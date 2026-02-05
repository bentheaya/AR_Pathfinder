import { openDB, DBSchema, IDBPDatabase } from 'idb';
import Geohash from 'latlon-geohash';

interface SkylineFeature {
    type: 'mountain' | 'building' | 'treeline';
    bearing_start: number;
    bearing_end: number;
    estimated_height_degrees: number;
}

interface ObstacleData {
    geohash: string;
    skylineFeatures: SkylineFeature[];
    timestamp: number;
    heading: number; // Which direction this was analyzed
}

interface ObstacleDB extends DBSchema {
    obstacles: {
        key: string; // geohash
        value: ObstacleData;
        indexes: { 'by-timestamp': number };
    };
}

class ObstacleCache {
    private db: IDBPDatabase<ObstacleDB> | null = null;
    private readonly TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
    private readonly GEOHASH_PRECISION = 6; // ~1.2km precision

    async init() {
        if (this.db) return; // Already initialized

        this.db = await openDB<ObstacleDB>('dira-obstacles', 1, {
            upgrade(db) {
                const store = db.createObjectStore('obstacles', { keyPath: 'geohash' });
                store.createIndex('by-timestamp', 'timestamp');
            },
        });
    }

    async get(lat: number, lon: number, heading: number): Promise<SkylineFeature[] | null> {
        try {
            if (!this.db) await this.init();

            const geohash = Geohash.encode(lat, lon, this.GEOHASH_PRECISION);
            const cached = await this.db!.get('obstacles', geohash);

            if (!cached) return null;

            // Check TTL
            if (Date.now() - cached.timestamp > this.TTL_MS) {
                await this.db!.delete('obstacles', geohash);
                return null;
            }

            // Check if heading is similar (within 30°)
            const headingDiff = Math.abs(cached.heading - heading);
            const normalizedDiff = Math.min(headingDiff, 360 - headingDiff);

            if (normalizedDiff > 30) {
                // Different direction, need new analysis
                return null;
            }

            console.log(`🎯 Obstacle cache HIT for geohash ${geohash} (saved ~3s)`);
            return cached.skylineFeatures;

        } catch (error) {
            console.error('Obstacle cache get error:', error);
            return null;
        }
    }

    async set(lat: number, lon: number, heading: number, features: SkylineFeature[]) {
        try {
            if (!this.db) await this.init();

            const geohash = Geohash.encode(lat, lon, this.GEOHASH_PRECISION);

            await this.db!.put('obstacles', {
                geohash,
                skylineFeatures: features,
                timestamp: Date.now(),
                heading
            });

            console.log(`💾 Cached obstacles for geohash ${geohash}`);
        } catch (error) {
            console.error('Obstacle cache set error:', error);
        }
    }

    async cleanup() {
        try {
            if (!this.db) await this.init();

            const cutoff = Date.now() - this.TTL_MS;
            const tx = this.db!.transaction('obstacles', 'readwrite');
            const index = tx.store.index('by-timestamp');

            let deletedCount = 0;
            for await (const cursor of index.iterate()) {
                if (cursor.value.timestamp < cutoff) {
                    await cursor.delete();
                    deletedCount++;
                }
            }

            if (deletedCount > 0) {
                console.log(`🧹 Cleaned up ${deletedCount} old obstacle cache entries`);
            }
        } catch (error) {
            console.error('Obstacle cache cleanup error:', error);
        }
    }

    async getStats() {
        try {
            if (!this.db) await this.init();

            const tx = this.db!.transaction('obstacles', 'readonly');
            const allKeys = await tx.store.getAllKeys();

            return {
                totalEntries: allKeys.length,
                estimatedSizeKB: allKeys.length * 2 // Rough estimate
            };
        } catch (error) {
            console.error('Obstacle cache stats error:', error);
            return { totalEntries: 0, estimatedSizeKB: 0 };
        }
    }
}

// Singleton instance
export const obstacleCache = new ObstacleCache();

// Initialize and cleanup on app load
if (typeof window !== 'undefined') {
    obstacleCache.init().then(() => {
        // Run cleanup on init
        obstacleCache.cleanup();

        // Schedule periodic cleanup (once per day)
        setInterval(() => {
            obstacleCache.cleanup();
        }, 24 * 60 * 60 * 1000);
    });
}
