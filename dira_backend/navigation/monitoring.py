"""
Monitoring and metrics tracking for Dira navigation system.
Tracks AI performance, errors, and usage patterns.
"""

import time
import logging
from typing import Optional, Dict, Any
from django.core.cache import cache
from django.utils import timezone

logger = logging.getLogger(__name__)


class NavigationMetrics:
    """
    Tracks and stores metrics for navigation performance monitoring.
    """
    
    # Cache keys
    CACHE_PREFIX = 'dira_metrics'
    AI_LATENCY_KEY = f'{CACHE_PREFIX}:ai_latency'
    AI_ERRORS_KEY = f'{CACHE_PREFIX}:ai_errors'
    FALLBACK_COUNT_KEY = f'{CACHE_PREFIX}:fallback_count'
    REQUEST_COUNT_KEY = f'{CACHE_PREFIX}:request_count'
    COMPRESSION_STATS_KEY = f'{CACHE_PREFIX}:compression'
    
    # Time windows
    HOUR_SECONDS = 3600
    DAY_SECONDS = 86400
    
    @staticmethod
    def record_ai_latency(duration_ms: float):
        """Record AI request latency in milliseconds."""
        try:
            # Store recent latencies (last hour)
            latencies = cache.get(NavigationMetrics.AI_LATENCY_KEY, [])
            latencies.append({
                'timestamp': timezone.now().timestamp(),
                'duration_ms': duration_ms
            })
            
            # Keep only last hour
            cutoff = time.time() - NavigationMetrics.HOUR_SECONDS
            latencies = [l for l in latencies if l['timestamp'] > cutoff]
            
            cache.set(NavigationMetrics.AI_LATENCY_KEY, latencies, NavigationMetrics.HOUR_SECONDS)
            
            logger.debug(f"AI latency recorded: {duration_ms:.2f}ms")
        except Exception as e:
            logger.error(f"Failed to record latency: {e}")
    
    @staticmethod
    def record_ai_error(error_type: str, error_message: str):
        """Record AI processing errors."""
        try:
            errors = cache.get(NavigationMetrics.AI_ERRORS_KEY, [])
            errors.append({
                'timestamp': timezone.now().timestamp(),
                'type': error_type,
                'message': error_message[:200]  # Truncate long messages
            })
            
            # Keep only last 24 hours
            cutoff = time.time() - NavigationMetrics.DAY_SECONDS
            errors = [e for e in errors if e['timestamp'] > cutoff]
            
            cache.set(NavigationMetrics.AI_ERRORS_KEY, errors, NavigationMetrics.DAY_SECONDS)
            
            logger.warning(f"AI error recorded: {error_type}")
        except Exception as e:
            logger.error(f"Failed to record error: {e}")
    
    @staticmethod
    def increment_fallback_count():
        """Increment counter for fallback navigation usage."""
        try:
            count = cache.get(NavigationMetrics.FALLBACK_COUNT_KEY, 0)
            cache.set(NavigationMetrics.FALLBACK_COUNT_KEY, count + 1, NavigationMetrics.DAY_SECONDS)
        except Exception as e:
            logger.error(f"Failed to increment fallback count: {e}")
    
    @staticmethod
    def increment_request_count():
        """Increment total request counter."""
        try:
            count = cache.get(NavigationMetrics.REQUEST_COUNT_KEY, 0)
            cache.set(NavigationMetrics.REQUEST_COUNT_KEY, count + 1, NavigationMetrics.DAY_SECONDS)
        except Exception as e:
            logger.error(f"Failed to increment request count: {e}")
    
    @staticmethod
    def record_compression_stats(stats: Dict[str, Any]):
        """Record image compression statistics."""
        try:
            compression_data = cache.get(NavigationMetrics.COMPRESSION_STATS_KEY, {
                'total_original_bytes': 0,
                'total_compressed_bytes': 0,
                'count': 0
            })
            
            compression_data['total_original_bytes'] += stats.get('original_size_bytes', 0)
            compression_data['total_compressed_bytes'] += stats.get('compressed_size_bytes', 0)
            compression_data['count'] += 1
            
            cache.set(NavigationMetrics.COMPRESSION_STATS_KEY, compression_data, NavigationMetrics.DAY_SECONDS)
        except Exception as e:
            logger.error(f"Failed to record compression stats: {e}")
    
    @staticmethod
    def get_metrics_summary() -> Dict[str, Any]:
        """
        Get summary of all metrics.
        
        Returns:
            Dictionary with current metrics
        """
        try:
            # Calculate average latency
            latencies = cache.get(NavigationMetrics.AI_LATENCY_KEY, [])
            avg_latency = sum(l['duration_ms'] for l in latencies) / len(latencies) if latencies else 0
            
            # Get error count
            errors = cache.get(NavigationMetrics.AI_ERRORS_KEY, [])
            
            # Get counts
            fallback_count = cache.get(NavigationMetrics.FALLBACK_COUNT_KEY, 0)
            request_count = cache.get(NavigationMetrics.REQUEST_COUNT_KEY, 0)
            
            # Calculate fallback rate
            fallback_rate = (fallback_count / request_count * 100) if request_count > 0 else 0
            
            # Get compression stats
            compression = cache.get(NavigationMetrics.COMPRESSION_STATS_KEY, {})
            total_saved = compression.get('total_original_bytes', 0) - compression.get('total_compressed_bytes', 0)
            
            return {
                'ai_performance': {
                    'average_latency_ms': round(avg_latency, 2),
                    'recent_requests': len(latencies),
                    'error_count_24h': len(errors),
                },
                'usage': {
                    'total_requests_24h': request_count,
                    'fallback_count_24h': fallback_count,
                    'fallback_rate_percent': round(fallback_rate, 2),
                },
                'compression': {
                    'total_bytes_saved': total_saved,
                    'total_images_compressed': compression.get('count', 0),
                    'average_compression_percent': round(
                        (total_saved / compression.get('total_original_bytes', 1)) * 100, 2
                    ) if compression.get('total_original_bytes', 0) > 0 else 0
                },
                'timestamp': timezone.now().isoformat()
            }
        except Exception as e:
            logger.error(f"Failed to get metrics summary: {e}", exc_info=True)
            return {'error': str(e)}


class PerformanceTimer:
    """Context manager for timing operations."""
    
    def __init__(self, operation_name: str):
        self.operation_name = operation_name
        self.start_time = None
        self.duration_ms = None
    
    def __enter__(self):
        self.start_time = time.time()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.duration_ms = (time.time() - self.start_time) * 1000
        
        if exc_type is None:
            logger.debug(f"{self.operation_name} completed in {self.duration_ms:.2f}ms")
        else:
            logger.error(f"{self.operation_name} failed after {self.duration_ms:.2f}ms")
        
        return False  # Don't suppress exceptions
