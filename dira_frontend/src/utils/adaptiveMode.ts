import { calculateSolarPhase, SolarPhase } from './solarCalc';

export type EnvironmentMode =
    | 'day'
    | 'night'
    | 'indoor-day'
    | 'indoor-night';

export interface AdaptiveConfig {
    frameInterval: number;      // milliseconds between frame captures
    suggestedMode: 'navigation' | 'horizon' | 'celestial';
    forceMode: boolean;         // true = auto-switch, false = suggest only
    bandwidthSavings: number;   // percentage reduction from baseline
    reason: string;             // Human-readable explanation
}

/**
 * Detect current environment mode using multi-signal corroboration
 * 
 * Priority:
 * 1. Solar position (GPS + time) - Primary, always available
 * 2. Ambient light sensor - Secondary, corroborates solar + detects indoor
 * 3. Fallback to solar only if sensor unavailable
 */
export function detectEnvironment(
    latitude: number,
    longitude: number,
    timestamp: Date = new Date(),
    ambientLight?: number
): EnvironmentMode {
    const solarPhase = calculateSolarPhase(latitude, longitude, timestamp);

    // High confidence cases (sensor confirms solar)
    if (solarPhase === 'night' && (!ambientLight || ambientLight < 50)) {
        return 'night';
    }

    if (solarPhase === 'day' && (!ambientLight || ambientLight > 100)) {
        return 'day';
    }

    // Corroboration cases (sensor contradicts solar)
    if (ambientLight !== undefined) {
        // Night outside, but bright indoors
        if (solarPhase === 'night' && ambientLight > 200) {
            return 'indoor-night';
        }

        // Day outside, but dark indoors (curtains closed, basement, etc.)
        if (solarPhase === 'day' && ambientLight < 10) {
            return 'indoor-day';
        }

        // Twilight - let ambient sensor decide
        if (solarPhase === 'twilight') {
            return ambientLight < 50 ? 'night' : 'day';
        }
    }

    // Fallback to solar position only
    return solarPhase === 'night' ? 'night' : 'day';
}

/**
 * Get adaptive behavior configuration based on environment and network
 * 
 * Network quality takes precedence over environment for emergency bandwidth saving
 */
export function getAdaptiveConfig(
    environmentMode: EnvironmentMode,
    networkSpeed?: 'slow-2g' | '2g' | '3g' | '4g'
): AdaptiveConfig {
    // CRITICAL: Network override (emergency bandwidth conservation)
    if (networkSpeed === 'slow-2g' || networkSpeed === '2g') {
        return {
            frameInterval: 20000, // 20 seconds
            suggestedMode: 'celestial',
            forceMode: false, // Suggest, don't force (user may need navigation)
            bandwidthSavings: 85,
            reason: 'Slow network detected - conserving bandwidth'
        };
    }

    // Environment-based adaptive behavior
    const configs: Record<EnvironmentMode, AdaptiveConfig> = {
        'night': {
            frameInterval: 15000, // 15 seconds
            suggestedMode: 'celestial',
            forceMode: true, // Auto-switch at night (per user request)
            bandwidthSavings: 80,
            reason: 'Night mode - camera feed analysis less effective'
        },
        'day': {
            frameInterval: 3000, // 3 seconds (baseline)
            suggestedMode: 'navigation',
            forceMode: false,
            bandwidthSavings: 0,
            reason: 'Optimal lighting for camera analysis'
        },
        'indoor-night': {
            frameInterval: 8000, // 8 seconds
            suggestedMode: 'celestial',
            forceMode: false, // Suggest only (user is indoors, may have good camera view)
            bandwidthSavings: 60,
            reason: 'Night time indoors - CelestialSearch recommended'
        },
        'indoor-day': {
            frameInterval: 3000, // No change during day
            suggestedMode: 'navigation',
            forceMode: false,
            bandwidthSavings: 0,
            reason: 'Daytime - navigation works well indoors'
        }
    };

    return configs[environmentMode];
}

/**
 * Format environment mode for display
 */
export function formatEnvironmentMode(mode: EnvironmentMode): string {
    const labels: Record<EnvironmentMode, string> = {
        'day': 'Day',
        'night': 'Night',
        'indoor-day': 'Indoor (Day)',
        'indoor-night': 'Indoor (Night)'
    };
    return labels[mode];
}

/**
 * Calculate bandwidth savings for analytics
 */
export function calculateBandwidthSavings(
    baselineInterval: number,
    adaptiveInterval: number,
    avgFrameSize: number = 200_000 // 200KB average
): {
    baselineMBPerMin: number;
    adaptiveMBPerMin: number;
    savingsPercent: number;
    savingsMBPerHour: number;
} {
    const baselineFramesPerMin = 60_000 / baselineInterval;
    const adaptiveFramesPerMin = 60_000 / adaptiveInterval;

    const baselineMBPerMin = (baselineFramesPerMin * avgFrameSize) / 1_000_000;
    const adaptiveMBPerMin = (adaptiveFramesPerMin * avgFrameSize) / 1_000_000;

    const savingsPercent = ((baselineMBPerMin - adaptiveMBPerMin) / baselineMBPerMin) * 100;
    const savingsMBPerHour = (baselineMBPerMin - adaptiveMBPerMin) * 60;

    return {
        baselineMBPerMin,
        adaptiveMBPerMin,
        savingsPercent,
        savingsMBPerHour
    };
}
