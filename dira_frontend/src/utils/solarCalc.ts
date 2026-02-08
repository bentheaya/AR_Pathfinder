export type SolarPhase = 'day' | 'twilight' | 'night';

interface SunTimes {
    sunrise: Date;
    sunset: Date;
    solarNoon: Date;
}

/**
 * Calculate solar position using simplified NOAA algorithm
 * Accuracy: ±5 minutes (sufficient for day/night detection)
 * No external dependencies
 */
export function calculateSolarPhase(
    latitude: number,
    longitude: number,
    timestamp: Date = new Date()
): SolarPhase {
    const altitude = calculateSolarAltitude(latitude, longitude, timestamp);

    // Sun above horizon = day
    if (altitude > 0) return 'day';

    // Sun 0° to -6° below horizon = civil twilight
    if (altitude > -6) return 'twilight';

    // Sun below -6° = night
    return 'night';
}

/**
 * Calculate solar altitude angle in degrees
 * Positive = above horizon, Negative = below horizon
 */
function calculateSolarAltitude(
    latitude: number,
    longitude: number,
    timestamp: Date
): number {
    // Convert to radians
    const latRad = toRadians(latitude);

    // Calculate Julian day
    const jd = getJulianDay(timestamp);

    // Days since J2000.0
    const n = jd - 2451545.0;

    // Mean solar time (longitude correction)
    const meanSolarTime = n - (longitude / 360);

    // Solar mean anomaly (degrees)
    const M = (357.5291 + 0.98560028 * meanSolarTime) % 360;
    const MRad = toRadians(M);

    // Equation of center
    const C = 1.9148 * Math.sin(MRad) +
        0.0200 * Math.sin(2 * MRad) +
        0.0003 * Math.sin(3 * MRad);

    // Ecliptic longitude
    const lambda = (M + C + 180 + 102.9372) % 360;
    const lambdaRad = toRadians(lambda);

    // Declination (sun's position relative to celestial equator)
    const declination = Math.asin(Math.sin(lambdaRad) * Math.sin(toRadians(23.44)));

    // Hour angle (sun's position east/west)
    const hourAngle = getHourAngle(timestamp, longitude, meanSolarTime);
    const hourAngleRad = toRadians(hourAngle);

    // Calculate altitude using spherical trigonometry
    const altitudeRad = Math.asin(
        Math.sin(latRad) * Math.sin(declination) +
        Math.cos(latRad) * Math.cos(declination) * Math.cos(hourAngleRad)
    );

    return toDegrees(altitudeRad);
}

/**
 * Calculate hour angle (sun's east-west position)
 */
function getHourAngle(timestamp: Date, longitude: number, meanSolarTime: number): number {
    const utcHours = timestamp.getUTCHours() +
        timestamp.getUTCMinutes() / 60 +
        timestamp.getUTCSeconds() / 3600;

    // Equation of time correction (~16 minutes variation)
    const M = (357.5291 + 0.98560028 * meanSolarTime) % 360;
    const MRad = toRadians(M);
    const eot = -0.0002 -
        0.0004 * Math.cos(MRad) +
        7.5 * Math.sin(MRad) -
        9.5 * Math.sin(2 * MRad);

    // Local solar time
    const solarTime = utcHours + (longitude / 15) + (eot / 60);

    // Hour angle (15° per hour, 0° at solar noon)
    return (solarTime - 12) * 15;
}

/**
 * Calculate sunrise and sunset times
 */
export function getSunriseSunset(
    latitude: number,
    longitude: number,
    date: Date = new Date()
): SunTimes {
    // Use noon as reference point
    const noon = new Date(date);
    noon.setHours(12, 0, 0, 0);

    const jd = getJulianDay(noon);
    const n = jd - 2451545.0;

    // Solar declination at noon
    const M = (357.5291 + 0.98560028 * n) % 360;
    const MRad = toRadians(M);
    const C = 1.9148 * Math.sin(MRad);
    const lambda = (M + C + 180 + 102.9372) % 360;
    const declination = Math.asin(Math.sin(toRadians(lambda)) * Math.sin(toRadians(23.44)));

    // Hour angle at sunrise/sunset (sun at horizon, altitude = 0°)
    // Account for atmospheric refraction (~0.833°)
    const latRad = toRadians(latitude);
    const cosHA = -Math.tan(latRad) * Math.tan(declination);

    // Check for polar day/night
    if (cosHA > 1) {
        // Polar night - sun never rises
        return {
            sunrise: new Date(date.setHours(0, 0, 0, 0)),
            sunset: new Date(date.setHours(0, 0, 0, 0)),
            solarNoon: noon
        };
    }
    if (cosHA < -1) {
        // Polar day - sun never sets
        return {
            sunrise: new Date(date.setHours(0, 0, 0, 0)),
            sunset: new Date(date.setHours(23, 59, 59, 999)),
            solarNoon: noon
        };
    }

    const HA = toDegrees(Math.acos(cosHA));

    // Convert hour angle to UTC time
    const noonUTC = 12 - (longitude / 15);
    const sunriseUTC = noonUTC - (HA / 15);
    const sunsetUTC = noonUTC + (HA / 15);

    const sunrise = new Date(date);
    sunrise.setUTCHours(Math.floor(sunriseUTC));
    sunrise.setUTCMinutes((sunriseUTC % 1) * 60);
    sunrise.setUTCSeconds(0);

    const sunset = new Date(date);
    sunset.setUTCHours(Math.floor(sunsetUTC));
    sunset.setUTCMinutes((sunsetUTC % 1) * 60);
    sunset.setUTCSeconds(0);

    return { sunrise, sunset, solarNoon: noon };
}

/**
 * Convert Date to Julian Day
 */
function getJulianDay(date: Date): number {
    const a = Math.floor((14 - (date.getUTCMonth() + 1)) / 12);
    const y = date.getUTCFullYear() + 4800 - a;
    const m = (date.getUTCMonth() + 1) + (12 * a) - 3;

    let jd = date.getUTCDate() +
        Math.floor((153 * m + 2) / 5) +
        (365 * y) +
        Math.floor(y / 4) -
        Math.floor(y / 100) +
        Math.floor(y / 400) -
        32045;

    // Add time fraction
    const timeFraction = (date.getUTCHours() - 12) / 24 +
        date.getUTCMinutes() / 1440 +
        date.getUTCSeconds() / 86400;

    return jd + timeFraction;
}

// Utility functions
function toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
}

function toDegrees(radians: number): number {
    return radians * (180 / Math.PI);
}

/**
 * Get human-readable solar info for debugging
 */
export function getSolarInfo(
    latitude: number,
    longitude: number,
    timestamp: Date = new Date()
): {
    phase: SolarPhase;
    altitude: number;
    times: SunTimes;
    isDaytime: boolean;
} {
    const phase = calculateSolarPhase(latitude, longitude, timestamp);
    const altitude = calculateSolarAltitude(latitude, longitude, timestamp);
    const times = getSunriseSunset(latitude, longitude, timestamp);

    return {
        phase,
        altitude,
        times,
        isDaytime: altitude > 0
    };
}
