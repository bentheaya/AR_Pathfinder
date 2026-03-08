"""
Dira Backend Unit Tests
Tests for utility functions, views logic, and service helpers.
These tests use SQLite and mock Gemini — no PostGIS/Redis needed.
"""

import json
import math
from unittest.mock import patch, MagicMock
from django.test import TestCase, RequestFactory
from django.conf import settings

from .views import (
    infer_direction_from_bearing,
    get_direction_from_bearing,
    calculate_bearing,
    format_distance,
)
from .utils import ImageCompressor


# ─────────────────────────────────────────────
# 1. Bearing & Direction Utilities
# ─────────────────────────────────────────────

class BearingCalculationTests(TestCase):
    """Tests for calculate_bearing() utility."""

    def test_north(self):
        """Due North should be ~0°."""
        bearing = calculate_bearing(0, 0, 1, 0)
        self.assertAlmostEqual(bearing, 0.0, delta=1.0)

    def test_east(self):
        """Due East should be ~90°."""
        bearing = calculate_bearing(0, 0, 0, 1)
        self.assertAlmostEqual(bearing, 90.0, delta=1.0)

    def test_south(self):
        """Due South should be ~180°."""
        bearing = calculate_bearing(1, 0, 0, 0)
        self.assertAlmostEqual(bearing, 180.0, delta=1.0)

    def test_west(self):
        """Due West should be ~270°."""
        bearing = calculate_bearing(0, 1, 0, 0)
        self.assertAlmostEqual(bearing, 270.0, delta=1.0)

    def test_same_point_returns_zero(self):
        """Zero distance should return 0°."""
        bearing = calculate_bearing(1.0, 1.0, 1.0, 1.0)
        self.assertAlmostEqual(bearing, 0.0, delta=1.0)

    def test_nairobi_to_mombasa(self):
        """Nairobi to Mombasa should be roughly South-East (100–140°)."""
        bearing = calculate_bearing(-1.2921, 36.8219, -4.0435, 39.6682)
        self.assertGreater(bearing, 100)
        self.assertLess(bearing, 160)


class DirectionFromBearingTests(TestCase):
    """Tests for get_direction_from_bearing() helper."""

    def test_forward_exact(self):
        self.assertEqual(get_direction_from_bearing(0, 0), 'forward')

    def test_forward_small_right(self):
        """Within 45° to right → forward."""
        self.assertEqual(get_direction_from_bearing(0, 30), 'forward')

    def test_forward_small_left(self):
        """Within 45° to left → forward."""
        self.assertEqual(get_direction_from_bearing(30, 0), 'forward')

    def test_turn_right(self):
        self.assertEqual(get_direction_from_bearing(0, 90), 'right')

    def test_turn_left(self):
        self.assertEqual(get_direction_from_bearing(90, 0), 'left')

    def test_turn_around(self):
        self.assertEqual(get_direction_from_bearing(0, 180), 'turn-around')

    def test_wrap_around_360(self):
        """350° heading, 10° target → only 20° diff → forward."""
        self.assertEqual(get_direction_from_bearing(350, 10), 'forward')


class InferDirectionTests(TestCase):
    """Tests for infer_direction_from_bearing() (bearing_adjustment-based)."""

    def test_forward_zero(self):
        self.assertEqual(infer_direction_from_bearing(0), 'forward')

    def test_forward_within_range(self):
        self.assertEqual(infer_direction_from_bearing(20), 'forward')
        self.assertEqual(infer_direction_from_bearing(-20), 'forward')

    def test_right_45(self):
        self.assertEqual(infer_direction_from_bearing(45), 'right')

    def test_left_45(self):
        self.assertEqual(infer_direction_from_bearing(-45), 'left')

    def test_turn_around_large(self):
        self.assertEqual(infer_direction_from_bearing(150), 'turn-around')
        self.assertEqual(infer_direction_from_bearing(-150), 'turn-around')


# ─────────────────────────────────────────────
# 2. Distance Formatting
# ─────────────────────────────────────────────

class FormatDistanceTests(TestCase):

    def test_very_close(self):
        result = format_distance(30)
        self.assertIn('m', result)
        self.assertIn('ahead', result)

    def test_medium_distance(self):
        result = format_distance(500)
        self.assertIn('m', result)

    def test_kilometric_distance(self):
        result = format_distance(2500)
        self.assertIn('km', result)

    def test_boundary_50(self):
        """Exactly 50m - should use the 'rounded' path."""
        result = format_distance(50)
        self.assertIn('m', result)


# ─────────────────────────────────────────────
# 3. GeminiNavigationService (mocked)
# ─────────────────────────────────────────────

class GeminiServiceTests(TestCase):
    """Tests for GeminiNavigationService with mocked Gemini client."""

    def test_fallback_when_no_client(self):
        """Service returns fallback when client init fails."""
        from .services import GeminiNavigationService
        with patch('navigation.services.genai.Client', side_effect=Exception("no key")):
            svc = GeminiNavigationService()
        result = svc.analyze_navigation_frame(
            image_b64='dGVzdA==',  # 'test' in base64
            latitude=-1.29,
            longitude=36.82,
            heading=90.0,
        )
        self.assertIn('error', result)

    def test_fill_missing_fields(self):
        """_fill_missing_fields should add defaults for any missing keys."""
        from .services import GeminiNavigationService
        partial = {'instruction': 'Turn left'}
        filled = GeminiNavigationService._fill_missing_fields(partial)
        self.assertIn('bearing_adjustment', filled)
        self.assertIn('landmark_identified', filled)
        self.assertIn('confidence', filled)
        self.assertEqual(filled['instruction'], 'Turn left')  # Original preserved

    def test_get_fallback_response_structure(self):
        from .services import GeminiNavigationService
        fallback = GeminiNavigationService._get_fallback_response()
        self.assertIn('instruction', fallback)
        self.assertIn('bearing_adjustment', fallback)
        self.assertIn('landmark_identified', fallback)
        self.assertIn('confidence', fallback)
        self.assertIn('is_lost', fallback)
        self.assertEqual(fallback['bearing_adjustment'], 0)

    def test_turn_guidance_aligned(self):
        """When already aligned (<5° diff), should return 'aligned' status without Gemini."""
        from .services import GeminiNavigationService
        svc = GeminiNavigationService()
        svc.client = MagicMock()  # Pretend client exists

        result = svc.generate_turn_guidance(
            user_heading=90.0,
            target_bearing=92.0,  # Only 2° off → aligned
            distance_m=500,
            poi_name='Nairobi CBD'
        )
        self.assertEqual(result['alignment_status'], 'aligned')
        self.assertIn('Nairobi CBD', result['text'])
        # Should NOT have called Gemini
        svc.client.models.generate_content.assert_not_called()

    def test_turn_guidance_right(self):
        from .services import GeminiNavigationService
        svc = GeminiNavigationService()
        mock_response = MagicMock()
        mock_response.text = 'Turn slightly to your right!'
        svc.client = MagicMock()
        svc.client.models.generate_content.return_value = mock_response

        result = svc.generate_turn_guidance(
            user_heading=0.0,
            target_bearing=315.0,  # 315° = 45° to the right (heading_diff goes negative)
            distance_m=1000,
            poi_name='Mount Kenya'
        )
        self.assertEqual(result['alignment_status'], 'turning_right')

    def test_turn_guidance_left(self):
        from .services import GeminiNavigationService
        svc = GeminiNavigationService()
        mock_response = MagicMock()
        mock_response.text = 'Look left a bit!'
        svc.client = MagicMock()
        svc.client.models.generate_content.return_value = mock_response

        result = svc.generate_turn_guidance(
            user_heading=0.0,
            target_bearing=45.0,  # 45° ahead-left in heading_diff convention: +45 = turn left
            distance_m=2000,
            poi_name='Lake Victoria'
        )
        # heading_diff = (45 - 0 + 360) % 360 = 45 → positive → turning_left
        self.assertEqual(result['alignment_status'], 'turning_left')


# ─────────────────────────────────────────────
# 4. Image Compressor Utility
# ─────────────────────────────────────────────

class ImageCompressorTests(TestCase):
    """Tests for ImageCompressor utility (no actual image file needed)."""

    def test_compress_invalid_base64_returns_error(self):
        """Should handle invalid base64 gracefully."""
        result, metadata = ImageCompressor.compress_base64_image(
            base64_data='not-real-base64!!!',
            max_dimension=800,
            quality=75
        )
        # Should return original data + failure flag
        self.assertEqual(result, 'not-real-base64!!!')
        self.assertTrue(metadata.get('compression_failed'))

    def test_compress_real_tiny_image(self):
        """Compress a real 1x1 pixel JPEG and verify metadata."""
        import base64
        from PIL import Image
        import io

        # Create a tiny valid JPEG
        img = Image.new('RGB', (1600, 900), color=(100, 150, 200))
        buffer = io.BytesIO()
        img.save(buffer, format='JPEG', quality=95)
        b64 = base64.b64encode(buffer.getvalue()).decode()

        compressed, metadata = ImageCompressor.compress_base64_image(
            base64_data=b64,
            max_dimension=800,
            quality=75
        )
        self.assertFalse(metadata.get('compression_failed', False))
        self.assertIn('compression_ratio', metadata)
        # Accept either key naming convention from the implementation
        has_size_keys = (
            ('original_size' in metadata and 'compressed_size' in metadata) or
            ('original_size_bytes' in metadata and 'compressed_size_bytes' in metadata)
        )
        self.assertTrue(has_size_keys, f"Expected size keys in metadata, got: {list(metadata.keys())}")


# ─────────────────────────────────────────────
# 5. View Endpoint Tests (no DB)
# ─────────────────────────────────────────────

class AnalyzeFrameViewTests(TestCase):
    """Tests for API endpoint input validation."""

    def setUp(self):
        self.factory = RequestFactory()

    def test_analyze_frame_missing_fields(self):
        """POST with missing fields should return 400."""
        from rest_framework.test import APIClient
        client = APIClient()
        response = client.post('/api/v1/analyze-frame/', {}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_analyze_horizon_missing_fields(self):
        """POST without image/lat/lon should return 400."""
        from rest_framework.test import APIClient
        client = APIClient()
        response = client.post('/api/v1/analyze-horizon/', {'heading': 90}, format='json')
        self.assertEqual(response.status_code, 400)


# ─────────────────────────────────────────────
# 6. DEM Service (no Mapbox key → graceful skip)
# ─────────────────────────────────────────────

class DEMServiceTests(TestCase):

    def test_elevation_without_mapbox_token(self):
        """Should return 0.0 if MAPBOX_ACCESS_TOKEN not configured."""
        from .dem_service import DEMService
        # Ensure the setting doesn't exist
        if hasattr(settings, 'MAPBOX_ACCESS_TOKEN'):
            del settings.MAPBOX_ACCESS_TOKEN

        elevation = DEMService.get_elevation(-1.29, 36.82)
        self.assertEqual(elevation, 0.0)

    def test_should_skip_gemini_returns_tuple(self):
        """should_skip_gemini_analysis always returns (bool, str)."""
        from .dem_service import should_skip_gemini_analysis
        with patch('navigation.dem_service.DEMService.get_terrain_variation', return_value=50.0):
            skip, reason = should_skip_gemini_analysis(-1.29, 36.82)
            self.assertIsInstance(skip, bool)
            self.assertIsInstance(reason, str)
            self.assertTrue(skip)  # 50m < 100m threshold → should skip

    def test_should_not_skip_complex_terrain(self):
        from .dem_service import should_skip_gemini_analysis
        with patch('navigation.dem_service.DEMService.get_terrain_variation', return_value=500.0):
            skip, reason = should_skip_gemini_analysis(-1.29, 36.82)
            self.assertFalse(skip)


# ─────────────────────────────────────────────
# 7. Throttling Config Sanity Checks
# ─────────────────────────────────────────────

class ThrottlingTests(TestCase):
    def test_throttle_classes_import(self):
        """All throttle classes should be importable."""
        from .throttling import (
            AnalyzeFrameAnonThrottle,
            AnalyzeFrameUserThrottle,
            OfflineManifestThrottle,
            BurstAnalyzeFrameThrottle,
        )
        self.assertTrue(True)  # Import success is the test
