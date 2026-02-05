"""
Utility functions for image processing and compression.
Optimizes images before sending to Gemini API to reduce bandwidth and costs.
"""

import base64
import io
import logging
import math
from typing import Tuple, Optional
from PIL import Image

logger = logging.getLogger(__name__)


class ImageCompressor:
    """
    Compresses images for efficient API transmission while maintaining quality.
    """
    
    # Default settings optimized for AR navigation
    DEFAULT_MAX_DIMENSION = 800  # Max width or height in pixels
    DEFAULT_JPEG_QUALITY = 75    # JPEG compression quality (1-100)
    DEFAULT_FORMAT = 'JPEG'
    
    @staticmethod
    def compress_base64_image(
        base64_data: str,
        max_dimension: int = DEFAULT_MAX_DIMENSION,
        quality: int = DEFAULT_JPEG_QUALITY,
        output_format: str = DEFAULT_FORMAT
    ) -> Tuple[str, dict]:
        """
        Compress a base64 encoded image.
        
        Args:
            base64_data: Base64 encoded image string (with or without data URI prefix)
            max_dimension: Maximum width or height in pixels
            quality: JPEG quality (1-100, higher is better)
            output_format: Output format ('JPEG' or 'PNG')
            
        Returns:
            Tuple of (compressed_base64_string, metadata_dict)
        """
        try:
            # Remove data URI prefix if present
            if ',' in base64_data:
                base64_data = base64_data.split(',', 1)[1]
            
            # Decode base64 to bytes
            image_bytes = base64.b64decode(base64_data)
            original_size = len(image_bytes)
            
            # Open image with Pillow
            image = Image.open(io.BytesIO(image_bytes))
            original_dimensions = image.size
            
            # Convert RGBA to RGB if needed (for JPEG)
            if output_format == 'JPEG' and image.mode in ('RGBA', 'LA', 'P'):
                # Create white background
                rgb_image = Image.new('RGB', image.size, (255, 255, 255))
                if image.mode == 'P':
                    image = image.convert('RGBA')
                rgb_image.paste(image, mask=image.split()[-1] if image.mode == 'RGBA' else None)
                image = rgb_image
            
            # Resize if needed
            if max(image.size) > max_dimension:
                image = ImageCompressor._resize_maintain_aspect(image, max_dimension)
            
            # Compress to bytes
            output_buffer = io.BytesIO()
            save_params = {'format': output_format}
            
            if output_format == 'JPEG':
                save_params['quality'] = quality
                save_params['optimize'] = True
            
            image.save(output_buffer, **save_params)
            compressed_bytes = output_buffer.getvalue()
            
            # Encode back to base64
            compressed_base64 = base64.b64encode(compressed_bytes).decode('utf-8')
            
            # Calculate compression metrics
            compressed_size = len(compressed_bytes)
            compression_ratio = (1 - compressed_size / original_size) * 100
            
            metadata = {
                'original_size_bytes': original_size,
                'compressed_size_bytes': compressed_size,
                'compression_ratio': round(compression_ratio, 2),
                'original_dimensions': original_dimensions,
                'final_dimensions': image.size,
                'format': output_format
            }
            
            logger.debug(f"Image compressed: {original_size} -> {compressed_size} bytes "
                        f"({compression_ratio:.1f}% reduction)")
            
            return compressed_base64, metadata
            
        except Exception as e:
            logger.error(f"Image compression failed: {e}", exc_info=True)
            # Return original if compression fails
            return base64_data, {
                'error': str(e),
                'compression_failed': True
            }
    
    @staticmethod
    def _resize_maintain_aspect(image: Image.Image, max_dimension: int) -> Image.Image:
        """
        Resize image maintaining aspect ratio.
        
        Args:
            image: PIL Image object
            max_dimension: Maximum width or height
            
        Returns:
            Resized PIL Image
        """
        width, height = image.size
        
        if width > height:
            new_width = max_dimension
            new_height = int(height * (max_dimension / width))
        else:
            new_height = max_dimension
            new_width = int(width * (max_dimension / height))
        
        return image.resize((new_width, new_height), Image.Resampling.LANCZOS)
    
    @staticmethod
    def estimate_size_reduction(
        current_dimension: int,
        target_dimension: int = DEFAULT_MAX_DIMENSION,
        quality: int = DEFAULT_JPEG_QUALITY
    ) -> dict:
        """
        Estimate compression benefits without actually compressing.
        
        Args:
            current_dimension: Current max dimension
            target_dimension: Target max dimension
            quality: JPEG quality
            
        Returns:
            Dictionary with estimates
        """
        if current_dimension <= target_dimension:
            return {
                'resize_needed': False,
                'estimated_pixel_reduction': 0,
                'estimated_size_reduction_percent': 0
            }
        
        # Rough estimation based on pixel reduction
        pixel_ratio = (target_dimension / current_dimension) ** 2
        estimated_reduction = (1 - pixel_ratio) * 100
        
        # Quality adjustment
        quality_factor = (100 - quality) / 100 * 0.3  # Quality contributes ~30% to size
        total_reduction = estimated_reduction + (estimated_reduction * quality_factor)
        
        return {
            'resize_needed': True,
            'estimated_pixel_reduction': round((1 - pixel_ratio) * 100, 1),
            'estimated_size_reduction_percent': round(min(total_reduction, 95), 1)
        }


def get_image_info(base64_data: str) -> dict:
    """
    Get information about a base64 encoded image without decompression.
    
    Args:
        base64_data: Base64 encoded image
        
    Returns:
        Dictionary with image information
    """
    try:
        if ',' in base64_data:
            base64_data = base64_data.split(',', 1)[1]
        
        image_bytes = base64.b64decode(base64_data)
        image = Image.open(io.BytesIO(image_bytes))
        
        return {
            'format': image.format,
            'mode': image.mode,
            'dimensions': image.size,
            'size_bytes': len(image_bytes),
            'size_kb': round(len(image_bytes) / 1024, 2)
        }
    except Exception as e:
        logger.error(f"Failed to get image info: {e}")
        return {'error': str(e)}


# === BEARING AND DISTANCE CALCULATIONS ===

def calculate_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the Great Circle bearing between two points.
    
    Args:
        lat1, lon1: Starting point coordinates
        lat2, lon2: Ending point coordinates
        
    Returns:
        Bearing in degrees (0-360°, where 0° is North)
    """
    # Convert to radians
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    dlon = math.radians(lon2 - lon1)
    
    # Calculate bearing using Haversine formula
    y = math.sin(dlon) * math.cos(lat2_rad)
    x = math.cos(lat1_rad) * math.sin(lat2_rad) - \
        math.sin(lat1_rad) * math.cos(lat2_rad) * math.cos(dlon)
    
    bearing_rad = math.atan2(y, x)
    bearing_deg = math.degrees(bearing_rad)
    
    # Normalize to 0-360°
    return (bearing_deg + 360) % 360


def calculate_distance_haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the distance between two points using the Haversine formula.
    
    Args:
        lat1, lon1: Starting point coordinates
        lat2, lon2: Ending point coordinates
        
    Returns:
        Distance in meters
    """
    R = 6371000  # Earth's radius in meters
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    
    a = math.sin(dlat / 2) ** 2 + \
        math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    distance = R * c
    return distance


def calculate_elevation_angle(
    lat1: float, lon1: float, h1: float,
    lat2: float, lon2: float, h2: float
) -> float:
    """
    Calculate the vertical angle to a target accounting for Earth's curvature.
    
    This is critical for CelestialSearch to show POIs at the correct height.
    For distant targets, Earth's curvature causes the horizon to "drop",
    so we need to adjust the elevation angle accordingly.
    
    Args:
        lat1, lon1: Observer coordinates
        h1: Observer altitude (meters above sea level)
        lat2, lon2: Target coordinates
        h2: Target altitude (meters above sea level)
        
    Returns:
        Elevation angle in degrees (positive = above horizon, negative = below)
    """
    EARTH_RADIUS = 6371000  # meters
    
    # Calculate ground distance
    d = calculate_distance_haversine(lat1, lon1, lat2, lon2)
    
    if d == 0:
        return 0.0  # Same location
    
    # Height difference
    delta_h = h2 - h1
    
    # Correction for Earth's curvature
    # As distance increases, the horizon "drops" below the geometric line
    # Horizon drop formula: drop = d² / (2 * R)
    horizon_drop = (d ** 2) / (2 * EARTH_RADIUS)
    
    # Effective height difference accounting for curvature
    effective_delta_h = delta_h - horizon_drop
    
    # Elevation angle using arctangent
    alpha_rad = math.atan(effective_delta_h / d)
    
    return math.degrees(alpha_rad)


def calculate_visual_height(distance_m: float) -> float:
    """
    Calculate visual height for SkyAnchor beam based on distance.
    
    Closer targets get taller, more prominent beams.
    Distant targets get shorter beams (appear smaller on horizon).
    
    Args:
        distance_m: Distance to target in meters
        
    Returns:
        Visual height in Three.js units
    """
    # Scale factor: closer = taller
    # At 1km: 30 units
    # At 10km: 15 units  
    # At 50km: 5 units
    
    base_height = 30.0
    min_height = 5.0
    
    # Inverse relationship with distance
    height = base_height * (1000.0 / max(distance_m, 1000.0))
    
    return max(min_height, height)
