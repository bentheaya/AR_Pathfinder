"""
Rate limiting (throttling) configurations for Dira API endpoints.
Prevents abuse and ensures fair usage of resources.
"""

from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class AnalyzeFrameAnonThrottle(AnonRateThrottle):
    """
    Rate limit for anonymous users analyzing frames.
    More restrictive than authenticated users.
    """
    # 10 requests per minute for anonymous users
    rate = '10/min'


class AnalyzeFrameUserThrottle(UserRateThrottle):
    """
    Rate limit for authenticated users analyzing frames.
    More generous allowance for registered users.
    """
    # 30 requests per minute for authenticated users
    rate = '30/min'


class OfflineManifestThrottle(AnonRateThrottle):
    """
    Rate limit for offline manifest downloads.
    Very restrictive since these are heavy operations.
    """
    # 2 requests per hour
    rate = '2/hour'


class BurstAnalyzeFrameThrottle(AnonRateThrottle):
    """
    Burst protection - prevents rapid successive calls.
    Allows quick bursts but prevents sustained spam.
    """
    scope = 'burst'
    # 3 requests per second (allows quick adjustments while walking)
    rate = '3/sec'
