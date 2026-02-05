/**
 * API Service for Dira Navigation
 * Handles all backend communication with image compression and offline support
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export interface NavigationInstruction {
    direction: 'forward' | 'left' | 'right' | 'turn-around';
    distance: number;
    message: string;
}

export interface NavigationResponse {
    instructions: NavigationInstruction[];
    confidence: number;
    landmarks: string[];
    thought_signature?: string;
    from_cache?: boolean;
}

export interface OfflineManifest {
    landmarks: Array<{
        id: number;
        name: string;
        coords: [number, number];
        description: string;
        distance: number;
        visual_cue?: string;
        approach_hint?: string;
    }>;
    count: number;
    center: [number, number];
    radius_meters: number;
}

export interface MetricsResponse {
    ai_performance: {
        average_latency_ms: number;
        recent_requests: number;
        error_count_24h: number;
    };
    usage: {
        total_requests_24h: number;
        fallback_count_24h: number;
        fallback_rate_percent: number;
    };
    compression: {
        total_bytes_saved: number;
        total_images_compressed: number;
        average_compression_percent: number;
    };
    timestamp: string;
}

export interface Waypoint {
    id: number;
    name: string;
    description: string;
    location: {
        type: string;
        coordinates: [number, number];
    };
}

class NavigationAPI {
    private baseUrl: string;

    constructor(baseUrl: string = API_BASE_URL) {
        this.baseUrl = baseUrl;
    }

    /**
     * Analyze a camera frame with Gemini AI
     */
    async analyzeFrame(payload: {
        image: string;
        latitude: number;
        longitude: number;
        heading: number;
        destination?: string;
        thought_signature?: string | null;
        compress?: boolean;
    }): Promise<NavigationResponse> {
        const response = await fetch(`${this.baseUrl}/api/v1/analyze-frame/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }

    /**
     * Get offline manifest for a location
     */
    async getOfflineManifest(
        lat: number,
        lon: number,
        radius: number = 1000,
        generateCues: boolean = false
    ): Promise<OfflineManifest> {
        const params = new URLSearchParams({
            lat: lat.toString(),
            lon: lon.toString(),
            radius: radius.toString(),
            ...(generateCues && { generate_cues: 'true' }),
        });

        const response = await fetch(
            `${this.baseUrl}/api/v1/offline-manifest/?${params}`
        );

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }

    /**
     * Get system metrics (for debugging/monitoring)
     */
    async getMetrics(): Promise<MetricsResponse> {
        const response = await fetch(`${this.baseUrl}/api/v1/metrics/`);

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }

    /**
     * Get nearby waypoints
     */
    async getNearbyWaypoints(
        lat: number,
        lon: number,
        radius: number = 1000
    ): Promise<Waypoint[]> {
        const params = new URLSearchParams({
            lat: lat.toString(),
            lon: lon.toString(),
            radius: radius.toString(),
        });

        const response = await fetch(
            `${this.baseUrl}/api/v1/waypoints/nearby/?${params}`
        );

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }
}

// Singleton instance
export const navigationAPI = new NavigationAPI();

/**
 * Image compression utility for frontend
 */
export const compressImage = (
    imageDataUrl: string,
    maxDimension: number = 800,
    quality: number = 0.75
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();

        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                reject(new Error('Could not get canvas context'));
                return;
            }

            // Calculate new dimensions
            let width = img.width;
            let height = img.height;

            if (width > height && width > maxDimension) {
                height = (height / width) * maxDimension;
                width = maxDimension;
            } else if (height > maxDimension) {
                width = (width / height) * maxDimension;
                height = maxDimension;
            }

            canvas.width = width;
            canvas.height = height;

            // Draw and compress
            ctx.drawImage(img, 0, 0, width, height);

            // Get compressed base64 (without data URI prefix)
            const compressed = canvas.toDataURL('image/jpeg', quality);
            resolve(compressed.split(',')[1]);
        };

        img.onerror = () => {
            reject(new Error('Failed to load image for compression'));
        };

        img.src = imageDataUrl;
    });
};
