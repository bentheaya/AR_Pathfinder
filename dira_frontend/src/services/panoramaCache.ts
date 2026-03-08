interface POIWithRefinement {
    id: number;
    name: string;
    category: string;
    distance_meters: number;
    bearing_degrees: number;
    coords: [number, number];
    y_adjustment?: number;
    action?: 'show' | 'hide' | 'raise' | 'lower';
}

interface CachedDirection {
    pois: POIWithRefinement[];
    timestamp: number;
}

/**
 * In-memory cache for 360° panorama pre-fetching.
 * Performance optimizations:
 * - Uses RequestIdleCallback for background pre-caching
 * - Caches adjacent 90° sectors when user is idle
 * - 1-minute TTL (landscape changes faster than obstacles)
 * - Round heading to 10° buckets for better cache hits
 * 
 * Performance Impact: Pre-cached direction = instant marker display (0ms)
 */
class PanoramaCache {
    private cache = new Map<number, CachedDirection>();
    private readonly CACHE_TTL = 60000; // 1 minute
    private idleCallbackId: number | null = null;
    private readonly HEADING_BUCKET_SIZE = 10; // Round to nearest 10°

    /**
     * Start background pre-caching of adjacent directions.
     * Only runs during browser idle time (won't block UI).
     */
    startPreCaching(
        currentHeading: number,
        _lat: number,
        _lon: number,
        analyzeFunc: (heading: number) => Promise<POIWithRefinement[]>
    ) {
        // Cancel previous pre-caching
        if (this.idleCallbackId) {
            cancelIdleCallback(this.idleCallbackId);
        }

        // Schedule pre-caching during idle time
        this.idleCallbackId = requestIdleCallback(async (deadline) => {
            console.log('🔮 Starting panorama pre-cache...');

            // Pre-cache three directions: +90°, +180°, +270°
            const directions = [
                (currentHeading + 90) % 360,
                (currentHeading + 180) % 360,
                (currentHeading + 270) % 360
            ];

            for (const heading of directions) {
                // Only continue if we have idle time left
                if (deadline.timeRemaining() < 100) {
                    console.log('⏸️ Idle time expired, pausing pre-cache');
                    break;
                }

                // Skip if already cached and fresh
                const cached = this.get(heading);
                if (cached) {
                    console.log(`✅ Direction ${heading}° already cached`);
                    continue;
                }

                // Analyze at low priority during idle time
                try {
                    const startTime = performance.now();
                    const pois = await analyzeFunc(heading);
                    const duration = performance.now() - startTime;

                    this.set(heading, pois);
                    console.log(`💾 Pre-cached direction ${heading}° (${duration.toFixed(0)}ms)`);

                } catch (e) {
                    console.warn(`Pre-cache failed for ${heading}°:`, e);
                    break; // Don't keep trying on errors
                }
            }
        }, { timeout: 5000 }); // Max 5s wait for idle
    }

    /**
     * Get cached POIs for a heading direction.
     * Uses 10° buckets for better cache hit rate.
     */
    get(heading: number): POIWithRefinement[] | null {
        const key = this.normalizeHeading(heading);
        const cached = this.cache.get(key);

        if (!cached) return null;

        // Check TTL
        if (Date.now() - cached.timestamp > this.CACHE_TTL) {
            this.cache.delete(key);
            return null;
        }

        console.log(`🎯 Panorama cache HIT for ${heading}° (bucket ${key}°)`);
        return cached.pois;
    }

    /**
     * Store POIs for a heading direction.
     */
    set(heading: number, pois: POIWithRefinement[]) {
        const key = this.normalizeHeading(heading);
        this.cache.set(key, { pois, timestamp: Date.now() });
    }

    /**
     * Round heading to nearest bucket for cache efficiency.
     * Example: 87° -> 90°, 93° -> 90°
     */
    private normalizeHeading(heading: number): number {
        return Math.round(heading / this.HEADING_BUCKET_SIZE) * this.HEADING_BUCKET_SIZE % 360;
    }

    /**
     * Clear entire cache (call on location change).
     */
    clear() {
        this.cache.clear();
        if (this.idleCallbackId) {
            cancelIdleCallback(this.idleCallbackId);
            this.idleCallbackId = null;
        }
        console.log('🧹 Panorama cache cleared');
    }

    /**
     * Get cache statistics for debugging.
     */
    getStats() {
        const entries = Array.from(this.cache.entries());
        const fresh = entries.filter(([_, v]) => Date.now() - v.timestamp < this.CACHE_TTL);

        return {
            totalEntries: this.cache.size,
            freshEntries: fresh.length,
            estimatedSizeKB: this.cache.size * 5 // Rough estimate
        };
    }
}

// Singleton instance
export const panoramaCache = new PanoramaCache();
