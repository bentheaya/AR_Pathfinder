import { describe, it, expect } from 'vitest';
import { calculateSolarPhase, getSunriseSunset } from '../src/utils/solarCalc';

describe('Solar Calculator (Nairobi)', () => {
    // Nairobi coordinates
    const lat = -1.2921;
    const lon = 36.8219;

    it('detects day at noon', () => {
        // February 5th, 2026, 12:00 PM
        const noon = new Date('2026-02-05T12:00:00+03:00');
        const phase = calculateSolarPhase(lat, lon, noon);
        expect(phase).toBe('day');
    });

    it('detects night at midnight', () => {
        // February 5th, 2026, 00:00 AM
        const midnight = new Date('2026-02-05T00:00:00+03:00');
        const phase = calculateSolarPhase(lat, lon, midnight);
        expect(phase).toBe('night');
    });

    it('calculates sunrise/sunset plausible times', () => {
        const date = new Date('2026-02-05T12:00:00+03:00');
        const sunTimes = getSunriseSunset(lat, lon, date);

        // Nairobi sunrise ~6:30 AM, sunset ~6:40 PM
        expect(sunTimes.sunrise.getHours()).toBe(6);
        expect(sunTimes.sunset.getHours()).toBe(18);
    });
});

describe('Solar Calculator (Tokyo)', () => {
    // Tokyo coordinates
    const lat = 35.6762;
    const lon = 139.6503;

    it('detects distinct day/night phases correctly', () => {
        // Tokyo is roughly +9 UTC
        // Noon Tokyo time
        const noonTokyo = new Date('2026-02-05T03:00:00Z');
        expect(calculateSolarPhase(lat, lon, noonTokyo)).toBe('day');

        // Midnight Tokyo time
        const midnightTokyo = new Date('2026-02-05T15:00:00Z');
        expect(calculateSolarPhase(lat, lon, midnightTokyo)).toBe('night');
    });
});
