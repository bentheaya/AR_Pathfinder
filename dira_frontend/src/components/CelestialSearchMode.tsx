import { useState, useEffect, useCallback, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { CelestialSearch } from './CelestialSearch';
import { GuidedTurnIndicator } from './GuidedTurnIndicator';
import SkyAnchor from './SkyAnchor';

interface SearchResult {
    poi: {
        id: number;
        name: string;
        latitude: number;
        longitude: number;
        altitude: number;
    };
    bearing_degrees: number;
    distance_meters: number;
    elevation_angle_degrees: number;
    visual_height: number;
}

interface CelestialSearchModeProps {
    latitude: number;
    longitude: number;
    altitude: number;
    heading: number;
    apiBaseUrl: string;
}

/**
 * CelestialSearchMode - "The Guided Pivot" experience.
 * 
 * Complete flow:
 * 1. User searches for POI
 * 2. Backend calculates bearing, distance, elevation
 * 3. Gemini 3 provides voice guidance
 * 4. Turn indicator shows direction to rotate
 * 5. When aligned, SkyAnchor beam fades in
 * 6. Web Speech API speaks the guidance
 */
export default function CelestialSearchMode({
    latitude,
    longitude,
    altitude,
    heading,
    apiBaseUrl
}: CelestialSearchModeProps) {
    const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [isAligned, setIsAligned] = useState(false);
    const [guidanceText, setGuidanceText] = useState('');
    const lastGuidanceFetchRef = useRef(0);

    // Search for POI
    const handleSearch = useCallback(async (query: string) => {
        setIsSearching(true);
        setSearchResult(null);
        setIsAligned(false);
        setGuidanceText('Searching...');

        try {
            // Prevent search with invalid coordinates
            if (!latitude && !longitude) {
                console.warn('Waiting for GPS lock...');
                return;
            }

            const response = await fetch(
                `${apiBaseUrl}/navigation/search-celestial/?q=${encodeURIComponent(query)}&lat=${latitude}&lon=${longitude}&alt=${altitude}`
            );

            if (!response.ok) {
                const error = await response.json();
                setGuidanceText(error.error || 'POI not found. Try another search.');
                return;
            }

            const data: SearchResult = await response.json();
            setSearchResult(data);

            // Initial guidance
            fetchGuidance(data.bearing_degrees, data.distance_meters, data.poi.name);

        } catch (error) {
            console.error('Search error:', error);
            setGuidanceText('Could not find that location. Try another search.');
        } finally {
            setIsSearching(false);
        }
    }, [latitude, longitude, altitude, apiBaseUrl]);

    // Fetch voice guidance from Gemini 3
    const fetchGuidance = useCallback(async (targetBearing: number, distance: number, poiName: string) => {
        // Throttle guidance requests (max once every 2 seconds)
        const now = Date.now();
        if (now - lastGuidanceFetchRef.current < 2000) {
            return;
        }
        lastGuidanceFetchRef.current = now;

        try {
            const response = await fetch(`${apiBaseUrl}/navigation/turn-guidance/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_heading: heading,
                    target_bearing: targetBearing,
                    distance_meters: distance,
                    poi_name: poiName
                })
            });

            if (!response.ok) throw new Error('Guidance request failed');

            const data = await response.json();
            setGuidanceText(data.text);

            // Speak with Web Speech API
            if ('speechSynthesis' in window && data.text) {
                // Cancel any ongoing speech
                window.speechSynthesis.cancel();

                const utterance = new SpeechSynthesisUtterance(data.text);
                utterance.rate = 0.9;
                utterance.pitch = 1.0;
                utterance.lang = 'en-US';
                window.speechSynthesis.speak(utterance);
            }
        } catch (error) {
            console.error('Guidance error:', error);
            setGuidanceText('Keep turning to face the target');
        }
    }, [heading, apiBaseUrl]);

    // Update guidance as user rotates (throttled)
    useEffect(() => {
        if (searchResult && !isAligned) {
            const headingDiff = Math.abs(
                ((searchResult.bearing_degrees - heading + 180) % 360) - 180
            );

            // Only update if heading changed significantly (>10°)
            if (headingDiff > 10) {
                fetchGuidance(
                    searchResult.bearing_degrees,
                    searchResult.distance_meters,
                    searchResult.poi.name
                );
            }
        }
    }, [heading, searchResult, isAligned, fetchGuidance]);

    return (
        <div className="relative w-full h-full">
            {/* Search Bar */}
            <CelestialSearch onSearch={handleSearch} isSearching={isSearching} />

            {/* Turn Guidance (only show before alignment) */}
            {searchResult && !isAligned && (
                <GuidedTurnIndicator
                    userHeading={heading}
                    targetBearing={searchResult.bearing_degrees}
                    onAligned={() => setIsAligned(true)}
                    guidanceText={guidanceText}
                />
            )}

            {/* Three.js Sky Anchor */}
            <Canvas camera={{ position: [0, 0, 0], fov: 75 }}>
                <ambientLight intensity={0.5} />

                {searchResult && (
                    <SkyAnchor
                        bearing={searchResult.bearing_degrees}
                        elevationAngle={searchResult.elevation_angle_degrees}
                        visualHeight={searchResult.visual_height}
                        userHeading={heading}
                        isAligned={isAligned}
                    />
                )}

                {/* Sky background */}
                <mesh>
                    <sphereGeometry args={[500, 32, 32]} />
                    <meshBasicMaterial
                        color="#0a0e27"
                        side={2} // THREE.DoubleSide
                        transparent
                        opacity={0.8}
                    />
                </mesh>
            </Canvas>

            {/* Aligned state banner */}
            {isAligned && searchResult && (
                <div className="absolute bottom-32 left-0 right-0 z-20 px-4">
                    <div className="glass-dark rounded-2xl p-4 max-w-md mx-auto text-center">
                        <div className="text-green-400 font-semibold mb-1">
                            ✓ Aligned
                        </div>
                        <div className="text-white text-sm">
                            {searchResult.poi.name} • {(searchResult.distance_meters / 1000).toFixed(1)} km ahead
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
