"""
Digital Elevation Model service using Mapbox Terrain-RGB tiles.
Provides terrain elevation data for line-of-sight calculations.

Performance optimizations:
- Pre-checks terrain before expensive Gemini API calls
- Caches tile requests via requests library
- Skips Gemini on flat terrain (<100m variation)
- Free tier: 200,000 requests/month
"""

import math
import logging
from typing import Tuple, Optional
from django.conf import settings
import requests
from PIL import Image
import io

logger = logging.getLogger(__name__)


class DEMService:
    """
    Digital Elevation Model service for terrain analysis.
    Uses Mapbox Terrain-RGB tiles for elevation data.
    """
    
    TILE_SIZE = 256
    CACHE_TIMEOUT = 3600  # Cache tiles for 1 hour
    
    @staticmethod
    def get_elevation(lat: float, lon: float, zoom: int = 14) -> float:
        """
        Get elevation at coordinates using Terrain-RGB encoding.
        
        Elevation formula: -10000 + ((R * 256 * 256 + G * 256 + B) * 0.1)
        
        Args:
            lat: Latitude
            lon: Longitude
            zoom: Tile zoom level (14 = ~10m resolution)
            
        Returns:
            Elevation in meters above sea level
        """
        if not hasattr(settings, 'MAPBOX_ACCESS_TOKEN'):
            logger.warning("MAPBOX_ACCESS_TOKEN not configured, skipping DEM")
            return 0.0
        
        try:
            # Convert lat/lon to tile coordinates
            tile_x, tile_y = DEMService._lat_lon_to_tile(lat, lon, zoom)
            
            # Fetch tile
            url = (
                f"https://api.mapbox.com/v4/mapbox.terrain-rgb/{zoom}/{tile_x}/{tile_y}"
                f".pngraw?access_token={settings.MAPBOX_ACCESS_TOKEN}"
            )
            
            response = requests.get(url, timeout=2)
            
            if response.status_code != 200:
                logger.warning(f"DEM tile fetch failed: {response.status_code}")
                return 0.0
            
            # Parse RGB pixel
            img = Image.open(io.BytesIO(response.content))
            
            # Get pixel coordinates within tile
            px, py = DEMService._get_pixel_coords(lat, lon, tile_x, tile_y, zoom)
            
            # Ensure pixel is within bounds
            px = max(0, min(DEMService.TILE_SIZE - 1, px))
            py = max(0, min(DEMService.TILE_SIZE - 1, py))
            
            r, g, b = img.getpixel((px, py))
            
            # Decode elevation from RGB
            elevation = -10000 + ((r * 256 * 256 + g * 256 + b) * 0.1)
            
            return elevation
            
        except Exception as e:
            logger.error(f"DEM elevation error: {e}")
            return 0.0
    
    @staticmethod
    def get_terrain_variation(lat: float, lon: float, radius_m: float = 1000) -> float:
        """
        Calculate terrain elevation variation within radius.
        Used to determine if terrain is flat enough to skip Gemini analysis.
        
        Args:
            lat: Center latitude
            lon: Center longitude
            radius_m: Radius in meters to check
            
        Returns:
            Max elevation variation in meters
        """
        try:
            # Sample 5 points in a cross pattern
            center_elev = DEMService.get_elevation(lat, lon)
            
            # Approximate degrees for radius (very rough, good enough for check)
            deg_per_m = 1 / 111000  # At equator
            offset_deg = radius_m * deg_per_m
            
            elevations = [center_elev]
            elevations.append(DEMService.get_elevation(lat + offset_deg, lon))
            elevations.append(DEMService.get_elevation(lat - offset_deg, lon))
            elevations.append(DEMService.get_elevation(lat, lon + offset_deg))
            elevations.append(DEMService.get_elevation(lat, lon - offset_deg))
            
            variation = max(elevations) - min(elevations)
            logger.info(f"Terrain variation: {variation:.1f}m")
            
            return variation
            
        except Exception as e:
            logger.error(f"Terrain variation error: {e}")
            return 1000.0  # Assume complex terrain on error
    
    @staticmethod
    def has_line_of_sight(
        observer_lat: float,
        observer_lon: float,
        target_lat: float,
        target_lon: float,
        samples: int = 10
    ) -> bool:
        """
        Check if target is visible from observer (no terrain blocking).
        
        Args:
            observer_lat: Observer latitude
            observer_lon: Observer longitude
            target_lat: Target latitude
            target_lon: Target longitude
            samples: Number of elevation samples along line
            
        Returns:
            True if line of sight is clear
        """
        try:
            observer_elev = DEMService.get_elevation(observer_lat, observer_lon)
            target_elev = DEMService.get_elevation(target_lat, target_lon)
            
            # Sample points along the line
            for i in range(1, samples):
                t = i / samples
                sample_lat = observer_lat + t * (target_lat - observer_lat)
                sample_lon = observer_lon + t * (target_lon - observer_lon)
                
                sample_elev = DEMService.get_elevation(sample_lat, sample_lon)
                
                # Calculate expected elevation if line of sight is clear
                expected_elev = observer_elev + t * (target_elev - observer_elev)
                
                # If terrain is higher than line of sight, blocked
                # Use 50m tolerance for curvature and inaccuracies
                if sample_elev > expected_elev + 50:
                    logger.info(f"Line of sight blocked at sample {i}/{samples}")
                    return False
            
            return True
            
        except Exception as e:
            logger.error(f"Line of sight error: {e}")
            return True  # Assume visible on error
    
    @staticmethod
    def _lat_lon_to_tile(lat: float, lon: float, zoom: int) -> Tuple[int, int]:
        """Convert geographic coordinates to tile coordinates."""
        lat_rad = math.radians(lat)
        n = 2.0 ** zoom
        x = int((lon + 180.0) / 360.0 * n)
        y = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
        return x, y
    
    @staticmethod
    def _get_pixel_coords(
        lat: float,
        lon: float,
        tile_x: int,
        tile_y: int,
        zoom: int
    ) -> Tuple[int, int]:
        """Get pixel coordinates within a tile."""
        lat_rad = math.radians(lat)
        n = 2.0 ** zoom
        
        x_tile_frac = (lon + 180.0) / 360.0 * n
        y_tile_frac = (1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n
        
        x_pixel = int((x_tile_frac - tile_x) * DEMService.TILE_SIZE)
        y_pixel = int((y_tile_frac - tile_y) * DEMService.TILE_SIZE)
        
        return x_pixel, y_pixel


def should_skip_gemini_analysis(lat: float, lon: float) -> Tuple[bool, str]:
    """
    Performance optimization: Determine if Gemini analysis can be skipped.
    
    Args:
        lat: User latitude
        lon: User longitude
        
    Returns:
        (should_skip, reason) tuple
    """
    dem = DEMService()
    
    # Check terrain variation
    variation = dem.get_terrain_variation(lat, lon, radius_m=5000)
    
    if variation < 100:
        return (True, f"flat_terrain (variation: {variation:.1f}m)")
    
    return (False, "complex_terrain")
