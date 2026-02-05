import base64
import hashlib
from rest_framework import viewsets, status
from rest_framework.decorators import api_view, action
from rest_framework.response import Response
from django.contrib.gis.geos import Point
from django.contrib.gis.measure import D

from .models import Waypoint, NavigationSession, FrameAnalysis
from .serializers import (
    WaypointSerializer,
    FrameAnalysisSerializer,
    AnalyzeFrameResponseSerializer
)


class WaypointViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for viewing waypoints"""
    queryset = Waypoint.objects.all()
    serializer_class = WaypointSerializer
    
    @action(detail=False, methods=['get'])
    def nearby(self, request):
        """Find waypoints near a given location"""
        lat = request.query_params.get('lat')
        lon = request.query_params.get('lon')
        radius = float(request.query_params.get('radius', 1000))  # Default 1km
        
        if not lat or not lon:
            return Response(
                {"error": "lat and lon parameters required"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        point = Point(float(lon), float(lat), srid=4326)
        nearby = Waypoint.objects.filter(
            location__distance_lte=(point, D(m=radius))
        )
        
        serializer = self.get_serializer(nearby, many=True)
        return Response(serializer.data)


@api_view(['POST'])
def analyze_frame(request):
    """
    Analyze a camera frame with GPS and compass data.
    Accepts base64 image string and metadata.
    """
    serializer = FrameAnalysisSerializer(data=request.data)
    
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    data = serializer.validated_data
    
    # Create Point from GPS coordinates
    location = Point(data['longitude'], data['latitude'], srid=4326)
    
    # Hash the image for deduplication (simple hash of first 1000 chars)
    image_sample = data['image'][:1000]
    image_hash = hashlib.md5(image_sample.encode()).hexdigest()
    
    # Find nearby waypoints using PostGIS spatial query
    nearby_waypoints = Waypoint.objects.filter(
        location__distance_lte=(location, D(m=500))
    ).distance(location).order_by('distance')[:5]
    
    landmarks = [wp.name for wp in nearby_waypoints]
    
    # Calculate navigation instruction (simplified logic for now)
    # In production, this would use computer vision and pathfinding
    if nearby_waypoints.exists():
        nearest = nearby_waypoints[0]
        distance_to_nearest = location.distance(nearest.location) * 111000  # Rough conversion to meters
        
        # Simple direction calculation based on bearing
        bearing = calculate_bearing(
            data['latitude'], data['longitude'],
            nearest.location.y, nearest.location.x
        )
        
        direction = get_direction_from_bearing(data['heading'], bearing)
        
        instructions = [{
            'direction': direction,
            'distance': round(distance_to_nearest, 1),
            'message': f"{direction.replace('-', ' ').title()} towards {nearest.name}"
        }]
        confidence = 0.85
    else:
        # No nearby waypoints
        instructions = [{
            'direction': 'forward',
            'distance': 0,
            'message': 'Continue exploring'
        }]
        confidence = 0.5
    
    # Store frame analysis (optional - can be disabled for privacy)
    # Uncomment to enable persistent storage:
    # FrameAnalysis.objects.create(
    #     location=location,
    #     heading=data['heading'],
    #     image_hash=image_hash,
    #     landmarks_detected=landmarks,
    #     confidence=confidence
    # )
    
    response_data = {
        'instructions': instructions,
        'confidence': confidence,
        'landmarks': landmarks
    }
    
    response_serializer = AnalyzeFrameResponseSerializer(data=response_data)
    if response_serializer.is_valid():
        return Response(response_serializer.data, status=status.HTTP_200_OK)
    
    return Response(response_data, status=status.HTTP_200_OK)


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
