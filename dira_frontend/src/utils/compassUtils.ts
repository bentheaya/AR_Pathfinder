/**
 * Compass Utilities for AR Navigation
 * Provides cross-platform compass heading detection, GPS fallback, and utility functions
 */

// ====== TypeScript Interfaces ======

export interface CompassHeading {
  heading: number; // 0-360 degrees (0 = North, 90 = East, 180 = South, 270 = West)
  accuracy: number | null; // Accuracy in degrees (lower is better), null if unknown
  source: "compass" | "gps" | "fallback";
  timestamp: number;
}

export interface WebKitDeviceOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
}

export interface GPSPosition {
  latitude: number;
  longitude: number;
  timestamp: number;
}

// ====== Compass Heading Detection ======

/**
 * Get compass heading from device orientation event
 * Handles iOS (webkitCompassHeading) and Android (calculated from alpha/beta/gamma)
 */
export function getCompassHeading(
  event: DeviceOrientationEvent,
): CompassHeading | null {
  const webkitEvent = event as WebKitDeviceOrientationEvent;

  // iOS Safari - use webkitCompassHeading (most accurate)
  if (
    webkitEvent.webkitCompassHeading !== undefined &&
    webkitEvent.webkitCompassHeading !== null
  ) {
    return {
      // iOS uses 0 = North but counts counterclockwise, so we need to invert
      heading: (360 - webkitEvent.webkitCompassHeading) % 360,
      accuracy: webkitEvent.webkitCompassAccuracy || null,
      source: "compass",
      timestamp: Date.now(),
    };
  }

  // Android / Other browsers - calculate from device orientation
  if (event.alpha !== null && event.beta !== null && event.gamma !== null) {
    const heading = calculateCompassFromOrientation(
      event.alpha,
      event.beta,
      event.gamma,
    );

    return {
      heading,
      accuracy: null, // Android doesn't provide accuracy directly
      source: "compass",
      timestamp: Date.now(),
    };
  }

  // No compass data available
  return null;
}

/**
 * Calculate compass heading from device orientation (alpha, beta, gamma)
 * Used for Android and browsers that don't support webkitCompassHeading
 */
function calculateCompassFromOrientation(
  alpha: number,
  beta: number,
  gamma: number,
): number {
  // Convert to radians
  const alphaRad = alpha * (Math.PI / 180);
  const betaRad = beta * (Math.PI / 180);
  const gammaRad = gamma * (Math.PI / 180);

  // Most common case: phone held vertically (portrait mode)
  // Beta close to 0 means phone is upright
  if (Math.abs(beta) < 45) {
    // Simple case: alpha is approximately the compass heading
    return (alpha + 360) % 360;
  }

  // Phone tilted significantly - need more complex calculation
  // This is a simplified version; full quaternion math would be more accurate

  // Calculate compass heading accounting for screen orientation
  const cX = Math.cos(betaRad) * Math.sin(gammaRad);
  const cY = -Math.sin(betaRad);
  const cZ = Math.cos(betaRad) * Math.cos(gammaRad);

  // Calculate heading from components
  const compassHeading = Math.atan2(cX, cZ) * (180 / Math.PI);

  // Normalize to 0-360
  return (compassHeading + 360 + alpha) % 360;
}

/**
 * Calculate compass heading from GPS movement (fallback when compass unavailable)
 * Requires two GPS positions to determine direction of travel
 */
export function calculateGPSHeading(
  from: GPSPosition,
  to: GPSPosition,
): CompassHeading | null {
  // Need at least 5 meters of movement for reasonable accuracy
  const distance = calculateDistance(
    from.latitude,
    from.longitude,
    to.latitude,
    to.longitude,
  );

  if (distance < 5) {
    return null; // Not enough movement to determine direction
  }

  const bearing = calculateBearing(
    from.latitude,
    from.longitude,
    to.latitude,
    to.longitude,
  );

  return {
    heading: bearing,
    accuracy: distance < 10 ? 45 : distance < 20 ? 30 : 15, // Rough accuracy estimate
    source: "gps",
    timestamp: to.timestamp,
  };
}

// ====== Compass Quality Assessment ======

export type CompassQuality = "excellent" | "good" | "poor" | "unavailable";

export interface CompassQualityAssessment {
  quality: CompassQuality;
  needsCalibration: boolean;
  message: string;
}

/**
 * Assess compass quality based on accuracy value
 */
export function assessCompassQuality(
  heading: CompassHeading,
): CompassQualityAssessment {
  if (heading.source === "fallback") {
    return {
      quality: "unavailable",
      needsCalibration: false,
      message: "Compass unavailable - using fallback",
    };
  }

  if (heading.source === "gps") {
    return {
      quality: "poor",
      needsCalibration: false,
      message: "Using GPS heading - move to improve accuracy",
    };
  }

  // Assess based on accuracy
  if (heading.accuracy === null) {
    return {
      quality: "good",
      needsCalibration: false,
      message: "Compass active",
    };
  }

  if (heading.accuracy < 15) {
    return {
      quality: "excellent",
      needsCalibration: false,
      message: "Compass calibrated",
    };
  } else if (heading.accuracy < 30) {
    return {
      quality: "good",
      needsCalibration: false,
      message: "Compass accuracy is good",
    };
  } else if (heading.accuracy < 50) {
    return {
      quality: "poor",
      needsCalibration: true,
      message: "Compass needs calibration",
    };
  } else {
    return {
      quality: "poor",
      needsCalibration: true,
      message: "Compass calibration required",
    };
  }
}

// ====== Bearing Calculations ======

/**
 * Calculate relative bearing between a POI and user heading
 * Returns shortest angular difference (-180 to 180)
 *
 * Example: User facing North (0°), POI at East (90°) → returns 90°
 * Example: User facing North (0°), POI at West (270°) → returns -90°
 */
export function calculateRelativeBearing(
  poiBearing: number,
  userHeading: number,
): number {
  let diff = poiBearing - userHeading;

  // Normalize to -180 to 180 range
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;

  return diff;
}

/**
 * Calculate absolute bearing between two geographic points
 * Returns 0-360 degrees (0 = North, 90 = East, 180 = South, 270 = West)
 */
export function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;

  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

  const bearing = (Math.atan2(y, x) * 180) / Math.PI;

  return (bearing + 360) % 360;
}

/**
 * Calculate distance between two points in meters (Haversine formula)
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Check if POI is visible in current heading (within field of view)
 * @param poiBearing - Bearing to the POI (0-360)
 * @param userHeading - Current user heading (0-360)
 * @param fovDegrees - Field of view in degrees (default 90 = ±45° from center)
 */
export function isInFieldOfView(
  poiBearing: number,
  userHeading: number,
  fovDegrees: number = 90,
): boolean {
  const relativeBearing = Math.abs(
    calculateRelativeBearing(poiBearing, userHeading),
  );
  return relativeBearing <= fovDegrees / 2;
}

// ====== Direction Helpers ======

export type CardinalDirection =
  | "N"
  | "NE"
  | "E"
  | "SE"
  | "S"
  | "SW"
  | "W"
  | "NW";

/**
 * Convert heading to cardinal direction (N, NE, E, etc.)
 */
export function getCardinalDirection(heading: number): CardinalDirection {
  const directions: CardinalDirection[] = [
    "N",
    "NE",
    "E",
    "SE",
    "S",
    "SW",
    "W",
    "NW",
  ];
  const index = Math.round(heading / 45) % 8;
  return directions[index];
}

/**
 * Smooth heading changes to prevent jitter
 * Uses exponential moving average
 */
export class HeadingSmoothing {
  private previousHeading: number | null = null;
  private smoothingFactor: number;

  constructor(smoothingFactor: number = 0.3) {
    this.smoothingFactor = Math.max(0, Math.min(1, smoothingFactor));
  }

  smooth(newHeading: number): number {
    if (this.previousHeading === null) {
      this.previousHeading = newHeading;
      return newHeading;
    }

    // Handle wrapping at 0/360 boundary
    let diff = newHeading - this.previousHeading;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    const smoothed = this.previousHeading + diff * this.smoothingFactor;
    this.previousHeading = (smoothed + 360) % 360;

    return this.previousHeading;
  }

  reset() {
    this.previousHeading = null;
  }
}
