"""
CelestialSearch API Endpoints for AR Pathfinder
"""
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import Waypoint
from .services import GeminiNavigationService
import logging

logger = logging.getLogger(__name__)


@api_view(['GET'])
def search_celestial_poi(request):
    """
    Search for a POI and return bearing/elevation for CelestialSearch.
    """
    from .utils import (
        calculate_bearing,
        calculate_distance_haversine,
        calculate_elevation_angle,
        calculate_visual_height
    )
    
    try:
        query = request.GET.get('q', '').strip()
        user_lat = float(request.GET.get('lat'))
        user_lon = float(request.GET.get('lon'))
        user_alt = float(request.GET.get('alt', 0))
        
        if not query:
            return Response({"error": "Query parameter 'q' required"}, status=400)
        
        # Search for POI (case-insensitive, partial match)
        poi = Waypoint.objects.filter(name__icontains=query).first()
        
        if not poi:
            return Response(
                {"error": f"POI '{query}' not found. Try a different search."},
                status=404
            )
        
        # Get POI coordinates
        poi_lat = poi.location.y
        poi_lon = poi.location.x
        poi_alt = poi.altitude or 0.0
        
        # Calculate bearing (0-360°, 0=North)
        bearing = calculate_bearing(user_lat, user_lon, poi_lat, poi_lon)
        distance = calculate_distance_haversine(user_lat, user_lon, poi_lat, poi_lon)
        elevation = calculate_elevation_angle(
            user_lat, user_lon, user_alt,
            poi_lat, poi_lon, poi_alt
        )
        visual_height = calculate_visual_height(distance)
        
        return Response({
            "poi": {
                "id": poi.id,
                "name": poi.name,
                "latitude": poi_lat,
                "longitude": poi_lon,
                "altitude": poi_alt
            },
            "bearing_degrees": round(bearing, 2),
            "distance_meters": round(distance, 2),
            "elevation_angle_degrees": round(elevation, 2),
            "visual_height": round(visual_height, 2)
        })
        
    except (ValueError, TypeError) as e:
        return Response({"error": f"Invalid parameters: {e}"}, status=400)
    except Exception as e:
        logger.error(f"Celestial POI search error: {e}")
        return Response({"error": "Internal server error"}, status=500)


@api_view(['POST'])
def generate_turn_guidance_view(request):
    """
    Generate natural voice guidance for turning to face a POI.
    """
    try:
        data = request.data
        
        user_heading = float(data.get('user_heading', 0))
        target_bearing = float(data.get('target_bearing', 0))
        distance_m = float(data.get('distance_meters', 0))
        poi_name = data.get('poi_name', 'target')
        
        # Initialize Gemini service
        gemini_service = GeminiNavigationService()
        
        # Generate guidance
        result = gemini_service.generate_turn_guidance(
            user_heading,
            target_bearing,
            distance_m,
            poi_name
        )
        
        return Response(result)
        
    except (ValueError, TypeError) as e:
        return Response({"error": f"Invalid parameters: {e}"}, status=400)
    except Exception as e:
        logger.error(f"Turn guidance generation error: {e}")
        return Response({"error": "Internal server error"}, status=500)
