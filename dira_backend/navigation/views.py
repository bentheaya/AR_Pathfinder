import base64
import hashlib
import logging
import time
from rest_framework import viewsets, status
from rest_framework.decorators import api_view, action, throttle_classes
from rest_framework.response import Response
from django.contrib.gis.geos import Point
from django.contrib.gis.measure import D
from django.contrib.gis.db.models.functions import Distance
from django.http import JsonResponse
from django.core.cache import cache
from django.conf import settings

from .models import Waypoint, NavigationSession, FrameAnalysis
from .serializers import (
    WaypointSerializer,
    FrameAnalysisSerializer,
    AnalyzeFrameResponseSerializer
)
from .services import get_navigation_service
from .throttling import (
    AnalyzeFrameAnonThrottle,
    AnalyzeFrameUserThrottle,
    OfflineManifestThrottle,
    BurstAnalyzeFrameThrottle
)
from .utils import ImageCompressor
from .monitoring import NavigationMetrics, PerformanceTimer

logger = logging.getLogger(__name__)


class WaypointViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for viewing waypoints"""
    queryset = Waypoint.objects.all()
    serializer_class = WaypointSerializer
    
    @action(detail=False, methods=['get'])
    def nearby(self, request):
        """
        Find waypoints near a given location with bearing and distance calculations.
        Supports extended radius up to 50km for Horizon Mode.
        """
        from .utils import calculate_bearing, calculate_distance_haversine
        
        lat = request.query_params.get('lat')
        lon = request.query_params.get('lon')
        radius = float(request.query_params.get('radius', 1000))  # Default 1km
        category = request.query_params.get('category')  # Optional category filter
        limit = int(request.query_params.get('limit', 100))  # Default 100, max for safety
        
        if not lat or not lon:
            return Response(
                {"error": "lat and lon parameters required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate radius (max 50km for Horizon Mode)
        if radius > 50000:
            return Response(
                {"error": "Maximum radius is 50000 meters (50km)"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        user_lat = float(lat)
        user_lon = float(lon)
        point = Point(user_lon, user_lat, srid=4326)
        
        # Query waypoints within radius
        queryset = Waypoint.objects.filter(
            location__distance_lte=(point, D(m=radius))
        ).annotate(
            distance_m=Distance('location', point)
        ).order_by('distance_m')
        
        # Apply category filter if provided
        if category:
            queryset = queryset.filter(category=category)
        
        # Limit results
        queryset = queryset[:limit]
        
        # Calculate bearing for each waypoint
        results = []
        for waypoint in queryset:
            waypoint_lon, waypoint_lat = waypoint.location.coords
            
            bearing = calculate_bearing(user_lat, user_lon, waypoint_lat, waypoint_lon)
            distance = waypoint.distance_m.m if hasattr(waypoint.distance_m, 'm') else 0
            
            results.append({
                "id": waypoint.id,
                "name": waypoint.name,
                "description": waypoint.description,
                "category": waypoint.category,
                "coords": [waypoint_lat, waypoint_lon],
                "distance_meters": round(distance, 2),
                "bearing_degrees": round(bearing, 2),
            })
        
        return Response({
            "count": len(results),
            "waypoints": results
        })


@api_view(['POST'])
@throttle_classes([AnalyzeFrameAnonThrottle])
def analyze_frame(request):
    """
    AI-Powered Frame Analysis using Gemini 3.
    With production optimizations: compression, caching, monitoring, and throttling.
    """
    # Increment request counter
    NavigationMetrics.increment_request_count()
    
    serializer = FrameAnalysisSerializer(data=request.data)
    
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    data = serializer.validated_data
    
    # Extract metadata
    thought_signature = request.data.get('thought_signature')
    destination_name = request.data.get('destination')
    
    # === IMAGE COMPRESSION ===
    compress_image = request.data.get('compress', True)  # Default to compressed
    
    if compress_image and data['image']:
        with PerformanceTimer("Image Compression"):
            compressed_image, compression_metadata = ImageCompressor.compress_base64_image(
                base64_data=data['image'],
                max_dimension=800,
                quality=75
            )
            
            # Log compression stats
            if not compression_metadata.get('compression_failed'):
                NavigationMetrics.record_compression_stats(compression_metadata)
                logger.info(f"Image compressed: {compression_metadata['compression_ratio']}% reduction")
                data['image'] = compressed_image
    
    # Create Point from GPS coordinates for PostGIS queries
    location = Point(data['longitude'], data['latitude'], srid=4326)
    
    # === RESULT CACHING ===
    # Generate cache key based on location + heading (rounded to reduce cache misses)
    if settings.ENABLE_RESULT_CACHING:
        cache_lat = round(data['latitude'], 4)  # ~11m precision
        cache_lon = round(data['longitude'], 4)
        cache_heading = round(data['heading'] / 15) * 15  # 15-degree buckets
        cache_key = f"nav_result:{cache_lat}:{cache_lon}:{cache_heading}"
        
        cached_result = cache.get(cache_key)
        if cached_result and not thought_signature:
            # Return cached result if no thought signature (no context needed)
            logger.debug(f"Cache hit for {cache_key}")
            cached_result['from_cache'] = True
            return Response(cached_result, status=status.HTTP_200_OK)
    
    # Find nearby waypoints using PostGIS spatial query
    # FIX: Use annotate with Distance function to calculate 'distance' field
    nearby_waypoints = Waypoint.objects.filter(
        location__distance_lte=(location, D(m=500))
    ).annotate(
        distance=Distance('location', location)
    ).order_by('distance')[:5]
    
    landmarks = [wp.name for wp in nearby_waypoints]
    
    # Get nearest waypoint as potential destination
    if nearby_waypoints.exists() and not destination_name:
        destination_name = nearby_waypoints[0].name
    
    # === GEMINI 3 AI ANALYSIS WITH MONITORING ===
    ai_start_time = time.time()
    
    try:
        with PerformanceTimer("AI Analysis"):
            nav_service = get_navigation_service()
            ai_result = nav_service.analyze_navigation_frame(
                image_b64=data['image'],
                latitude=data['latitude'],
                longitude=data['longitude'],
                heading=data['heading'],
                thought_signature=thought_signature,
                destination_name=destination_name
            )
        
        # Record AI latency
        ai_duration_ms = (time.time() - ai_start_time) * 1000
        NavigationMetrics.record_ai_latency(ai_duration_ms)
        
    except Exception as e:
        # Record error
        NavigationMetrics.record_ai_error(type(e).__name__, str(e))
        logger.error(f"AI analysis exception: {e}", exc_info=True)
        ai_result = {'error': str(e)}
    
    # Check if AI analysis succeeded
    if 'error' in ai_result:
        logger.warning(f"AI analysis failed: {ai_result['error']}. Using fallback.")
        NavigationMetrics.increment_fallback_count()
        
        # === IMPROVED FALLBACK NAVIGATION ===
        instructions = get_enhanced_fallback_instructions(
            location=location,
            heading=data['heading'],
            nearby_waypoints=nearby_waypoints,
            destination_name=destination_name
        )
        confidence = 0.4  # Higher confidence for improved fallback
        new_thought_signature = None
    else:
        # Parse AI response
        ai_data = ai_result['data']
        
        # Convert AI format to our API format
        direction = infer_direction_from_bearing(ai_data.get('bearing_adjustment', 0))
        
        instructions = [{
            'direction': direction,
            'distance': calculate_distance_to_nearest(location, nearby_waypoints),
            'message': ai_data.get('instruction', 'Continue forward')
        }]
        
        confidence = ai_data.get('confidence', 0.8)
        new_thought_signature = ai_result.get('thought_signature')
        
        # Update landmarks with AI-identified landmark
        if ai_data.get('landmark_identified') and ai_data['landmark_identified'] != 'Unknown':
            landmarks.insert(0, ai_data['landmark_identified'])
    
    response_data = {
        'instructions': instructions,
        'confidence': confidence,
        'landmarks': landmarks,
        'thought_signature': new_thought_signature,
        'from_cache': False
    }
    
    # === CACHE THE RESULT ===
    if settings.ENABLE_RESULT_CACHING and not thought_signature:
        # Only cache results without thought signatures (context-free)
        cache.set(cache_key, response_data, settings.NAVIGATION_CACHE_TIMEOUT)
    
    response_serializer = AnalyzeFrameResponseSerializer(data=response_data)
    if response_serializer.is_valid():
        return Response(response_serializer.data, status=status.HTTP_200_OK)
    
    return Response(response_data, status=status.HTTP_200_OK)


@api_view(['POST'])
@throttle_classes([AnalyzeFrameAnonThrottle])
def analyze_horizon(request):
    """
    Gemini 3 Semantic Horizon Analysis for POI positioning refinement.
    """
    required_fields = ['image', 'latitude', 'longitude', 'heading', 'visible_pois']
    missing_fields = [f for f in required_fields if f not in request.data]
    
    if missing_fields:
        return Response({"error": f"Missing: {', '.join(missing_fields)}"}, status=400)
    
    try:
        nav_service = get_navigation_service()
        result = nav_service.analyze_horizon(
            image_b64=request.data['image'],
            latitude=float(request.data['latitude']),
            longitude=float(request.data['longitude']),
            heading=float(request.data['heading']),
            visible_pois=request.data['visible_pois'],
            thought_signature=request.data.get('thought_signature')
        )
        
        if not result.get('success'):
            return Response({"error": result.get('error'), "refined_pois": result.get('refined_pois', [])}, status=500)
        
        return Response({
            "horizon_line_y_percent": result['data'].get('horizon_line_y_percent', 50),
            "skyline_features": result['data'].get('skyline_features', []),
            "refined_pois": result['data'].get('refined_pois', []),
            "thought_signature": result.get('thought_signature'),
            "success": True
        })
    except Exception as e:
        logger.error(f"Horizon analysis error: {e}", exc_info=True)
        return Response({"error": str(e), "refined_pois": request.data.get('visible_pois', [])}, status=500)


@api_view(['GET'])
@throttle_classes([OfflineManifestThrottle])
def get_offline_manifest(request):
    """
    Offline Atlas: Pre-fetch all landmarks within radius and generate visual cues.
    This allows the app to work without AI while offline using IndexedDB.
    """
    lat = request.GET.get('lat')
    lon = request.GET.get('lon')
    radius = float(request.GET.get('radius', 1000))  # Default 1km
    
    if not lat or not lon:
        return JsonResponse(
            {"error": "lat and lon parameters required"},
            status=400
        )
    
    # Check cache for manifest
    cache_key = f"manifest:{lat}:{lon}:{radius}"
    cached_manifest = cache.get(cache_key)
    
    if cached_manifest:
        logger.debug(f"Returning cached manifest for {cache_key}")
        cached_manifest['from_cache'] = True
        return JsonResponse(cached_manifest)
    
    try:
        user_location = Point(float(lon), float(lat), srid=4326)
        
        # PostGIS query: Find all waypoints within specified radius
        nearby_waypoints = Waypoint.objects.annotate(
            distance=Distance('location', user_location)
        ).filter(distance__lte=radius).order_by('distance')
        
        # Build manifest for IndexedDB storage on frontend
        manifest = []
        waypoint_list = []
        
        for waypoint in nearby_waypoints:
            waypoint_data = {
                "id": waypoint.id,
                "name": waypoint.name,
                "coords": [waypoint.location.y, waypoint.location.x],  # [lat, lon]
                "description": waypoint.description,
                "distance": waypoint.distance.m if hasattr(waypoint, 'distance') else 0
            }
            manifest.append(waypoint_data)
            waypoint_list.append({
                'name': waypoint.name,
                'lat': waypoint.location.y,
                'lon': waypoint.location.x
            })
        
        # Optionally use Gemini to generate visual cues for offline navigation
        # This is heavy - only do this when user explicitly requests offline download
        if request.GET.get('generate_cues') == 'true':
            nav_service = get_navigation_service()
            ai_result = nav_service.analyze_route_ahead(
                waypoints=waypoint_list,
                user_location=(float(lat), float(lon))
            )
            
            if 'data' in ai_result:
                # Merge AI visual cues into manifest
                cues_by_name = {cue['waypoint_name']: cue for cue in ai_result['data']}
                for item in manifest:
                    if item['name'] in cues_by_name:
                        item['visual_cue'] = cues_by_name[item['name']].get('visual_cue', '')
                        item['approach_hint'] = cues_by_name[item['name']].get('approach_hint', '')
        
        result = {
            "landmarks": manifest,
            "count": len(manifest),
            "center": [float(lat), float(lon)],
            "radius_meters": radius,
            "from_cache": False
        }
        
        # Cache manifest for 1 hour
        cache.set(cache_key, result, 3600)
        
        return JsonResponse(result)
        
    except Exception as e:
        logger.error(f"Error generating offline manifest: {e}", exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)


@api_view(['GET'])
def get_metrics(request):
    """
    Get navigation system metrics for monitoring.
    Requires authentication in production.
    """
    # TODO: Add authentication check for production
    # if not request.user.is_staff:
    #     return JsonResponse({"error": "Unauthorized"}, status=403)
    
    metrics = NavigationMetrics.get_metrics_summary()
    return JsonResponse(metrics)


# === Helper Functions ===
def get_enhanced_fallback_instructions(location, heading, nearby_waypoints, destination_name=None):
    """IMPROVED fallback geometric navigation with better UX."""
    if nearby_waypoints.exists():
        nearest = nearby_waypoints[0]
        # FIX: Calculate distance properly from the annotated field or manually
        distance_to_nearest = location.distance(nearest.location) * 111000
                
        bearing = calculate_bearing(
            location.y, location.x,
            nearest.location.y, nearest.location.x
        )
        
        direction = get_direction_from_bearing(heading, bearing)
        
        # Build contextual message
        landmark_name = destination_name or nearest.name
        distance_str = format_distance(distance_to_nearest)
        
        # Add additional context if multiple waypoints
        context = ""
        if nearby_waypoints.count() > 1:
            second = nearby_waypoints[1]
            context = f" (with {second.name} nearby)"
        
        message = f"{direction.replace('-', ' ').title()} towards {landmark_name} - about {distance_str}{context}"
        
        return [{
            'direction': direction,
            'distance': round(distance_to_nearest, 1),
            'message': message
        }]
    else:
        return [{
            'direction': 'forward',
            'distance': 0,
            'message': 'Exploring - no nearby landmarks detected. Continue forward.'
        }]


def format_distance(meters):
    """Format distance in human-readable way"""
    if meters < 50:
        return f"{int(meters)}m ahead"
    elif meters < 1000:
        rounded = round(meters / 50) * 50
        return f"{rounded}m away"
    else:
        km = meters / 1000
        return f"{km:.1f}km away"


def get_fallback_instructions(location, heading, nearby_waypoints):
    """Legacy fallback - kept for compatibility"""
    return get_enhanced_fallback_instructions(location, heading, nearby_waypoints)


def calculate_distance_to_nearest(location, waypoints):
    """Calculate distance in meters to nearest waypoint"""
    if waypoints.exists():
        nearest = waypoints[0]
        return round(location.distance(nearest.location) * 111000, 1)
    return 0


def infer_direction_from_bearing(bearing_adjustment):
    """Convert bearing adjustment to direction instruction"""
    if -22.5 <= bearing_adjustment <= 22.5:
        return 'forward'
    elif 22.5 < bearing_adjustment <= 90:
        return 'right'
    elif bearing_adjustment > 90:
        return 'turn-around'
    elif -90 <= bearing_adjustment < -22.5:
        return 'left'
    else:
        return 'turn-around'


def calculate_bearing(lat1, lon1, lat2, lon2):
    """Calculate bearing between two points"""
    import math
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    diff_lon = math.radians(lon2 - lon1)
    
    x = math.sin(diff_lon) * math.cos(lat2_rad)
    y = math.cos(lat1_rad) * math.sin(lat2_rad) - (
        math.sin(lat1_rad) * math.cos(lat2_rad) * math.cos(diff_lon)
    )
    
    bearing = math.atan2(x, y)
    bearing = math.degrees(bearing)
    bearing = (bearing + 360) % 360
    
    return bearing


def get_direction_from_bearing(current_heading, target_bearing):
    """Determine direction instruction based on current heading and target bearing"""
    diff = (target_bearing - current_heading + 360) % 360
    
    if diff < 45 or diff > 315:
        return 'forward'
    elif 45 <= diff < 135:
        return 'right'
    elif 135 <= diff < 225:
        return 'turn-around'
    else:
        return 'left'
