import { useState, useEffect, useCallback, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Compass, Filter, MapPin, Brain } from 'lucide-react';
import SkyMarker from './SkyMarker';
import { obstacleCache } from '../services/obstacleCache';
import { useThrottledHorizonAnalysis } from '../hooks/useThrottledHorizonAnalysis';
import { isInFieldOfView, calculateBearing, calculateDistance } from '../utils/compassUtils';

interface POI {
    id: number | string;
    name: string;
    category: string;
    distance_meters: number;
    bearing_degrees: number;
    coords: [number, number];
    // Gemini 3 refinements
    y_adjustment?: number;
    action?: 'show' | 'hide' | 'raise' | 'lower';
}

interface HorizonModeProps {
    latitude: number;
    longitude: number;
    heading: number;
    apiBaseUrl: string;
}

const CATEGORIES = [
    { value: 'all', label: 'All', icon: '🌍' },
    { value: 'institution', label: 'Institutions', icon: '🏫' },
    { value: 'nature', label: 'Nature', icon: '🌳' },
    { value: 'business', label: 'Business', icon: '🏢' },
    { value: 'government', label: 'Government', icon: '🏛️' },
    { value: 'transport', label: 'Transport', icon: '🚉' },
    { value: 'landmark', label: 'Landmarks', icon: '🗿' },
    { value: 'city', label: 'Cities', icon: '🏙️' },
];

export default function HorizonMode({
    latitude,
    longitude,
    heading,
    apiBaseUrl
}: HorizonModeProps) {
    const [pois, setPois] = useState<POI[]>([]);
    const [googlePois, setGooglePois] = useState<POI[]>([]);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [aiAnalyzed, setAiAnalyzed] = useState(false);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const thoughtSignatureRef = useRef<string | null>(null);

    // Fetch Internal Waypoints (within 50km)
    const fetchPOIs = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams({
                lat: latitude.toString(),
                lon: longitude.toString(),
                radius: '50000',  // 50km
                limit: '20',
            });

            if (selectedCategory !== 'all') {
                params.append('category', selectedCategory);
            }

            const response = await fetch(`${apiBaseUrl}/api/v1/waypoints/nearby/?${params}`);

            if (!response.ok) {
                throw new Error(`Failed to fetch POIs: ${response.statusText}`);
            }

            const data = await response.json();
            setPois(data.waypoints || []);
            setAiAnalyzed(false); // Reset AI analysis flag

        } catch (err) {
            console.error('Error fetching internal POIs:', err);
            setError(err instanceof Error ? err.message : 'Failed to load landmarks');
        } finally {
            setIsLoading(false);
        }
    }, [latitude, longitude, selectedCategory, apiBaseUrl]);

    // Fetch Google Maps POIs
    const fetchGooglePOIs = useCallback(async () => {
        try {
            const response = await fetch(`${apiBaseUrl}/api/v1/poi-nearby/?lat=${latitude}&lon=${longitude}&radius=5000`);
            const data = await response.json();
            
            if (data.results) {
                const adapted = data.results.map((item: any) => {
                    const dist = calculateDistance(latitude, longitude, item.lat, item.lon);
                    const bear = calculateBearing(latitude, longitude, item.lat, item.lon);
                    
                    return {
                        id: `g-${item.id}`,
                        name: item.name,
                        category: item.category,
                        coords: [item.lon, item.lat],
                        distance_meters: dist,
                        bearing_degrees: bear
                    };
                });
                setGooglePois(adapted);
            }
        } catch (err) {
            console.error('Error fetching Google POIs:', err);
        }
    }, [latitude, longitude, apiBaseUrl]);

    // Gemini 3 Horizon Analysis with Obstacle Caching
    const analyzeHorizon = useCallback(async () => {
        const allCurrentPois = [...pois, ...googlePois];
        if (!videoRef.current || !canvasRef.current || allCurrentPois.length === 0) return;

        try {
            // 🎯 PERFORMANCE: Check obstacle cache first
            const cachedFeatures = await obstacleCache.get(latitude, longitude, heading);

            if (cachedFeatures) {
                setAiAnalyzed(true);
                return;
            }

            // Capture frame from video
            const canvas = canvasRef.current;
            const video = videoRef.current;
            if (!canvas || !video) return;

            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;

            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            const imageB64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];

            // Filter POIs visible in current direction (±90°)
            const visiblePoisToAnalyze = allCurrentPois.filter(poi => {
                return isInFieldOfView(poi.bearing_degrees, heading, 180);
            });

            // Call horizon analysis API
            const response = await fetch(`${apiBaseUrl}/api/v1/analyze-horizon/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: imageB64,
                    latitude,
                    longitude,
                    heading,
                    visible_pois: visiblePoisToAnalyze,
                    thought_signature: thoughtSignatureRef.current
                })
            });

            if (!response.ok) return;

            const analysisData = await response.json();

            if (analysisData.thought_signature) {
                thoughtSignatureRef.current = analysisData.thought_signature;
            }

            if (analysisData.skyline_features && analysisData.skyline_features.length > 0) {
                await obstacleCache.set(latitude, longitude, heading, analysisData.skyline_features);
            }

            // Apply refinements to POIs (both internal and Google)
            if (analysisData.refined_pois && analysisData.refined_pois.length > 0) {
                const applyRefinement = (currentPOIs: POI[]) => {
                    return currentPOIs.map(poi => {
                        const refinement = analysisData.refined_pois.find(
                            (r: { name: string }) => r.name === poi.name
                        );
                        if (refinement) {
                            return {
                                ...poi,
                                y_adjustment: refinement.y_adjustment || 0,
                                action: refinement.action || 'show'
                            };
                        }
                        return poi;
                    });
                };

                setPois(prev => applyRefinement(prev));
                setGooglePois(prev => applyRefinement(prev));
                setAiAnalyzed(true);
            }

        } catch (err) {
            console.error('Horizon analysis error:', err);
        }
    }, [pois, googlePois, latitude, longitude, heading, apiBaseUrl]);

    // Fetch POIs when location changes
    useEffect(() => {
        if (latitude && longitude && (latitude !== 0 || longitude !== 0)) {
            fetchPOIs();
            fetchGooglePOIs();
        }
    }, [latitude, longitude, fetchPOIs, fetchGooglePOIs]);

    // 🚀 PERFORMANCE: Continuous throttled analysis
    useThrottledHorizonAnalysis(heading, analyzeHorizon, {
        minHeadingChange: 15,
        minInterval: 10000,
        velocityThreshold: 2
    });

    const combinedPois = [...pois, ...googlePois];

    // Filter POIs to only show those within ±90° of current heading
    const visiblePOIs = combinedPois.filter(poi => {
        if (poi.action === 'hide') return false;
        return isInFieldOfView(poi.bearing_degrees, heading, 180);
    });

    return (
        <div className="relative w-full h-full">
            {/* Hidden video and canvas for horizon analysis */}
            <video ref={videoRef} autoPlay playsInline muted className="hidden" />
            <canvas ref={canvasRef} className="hidden" />

            {/* Category Filter Bar - Moved down to avoid overlapping with top Status/Debug icons */}
            <div className="absolute top-24 left-0 right-0 z-20 px-4">
                <div className="glass-dark rounded-2xl p-3 max-w-4xl mx-auto">
                    <div className="flex items-center gap-2 mb-2">
                        <Filter className="w-4 h-4 text-dira-primary" />
                        <span className="text-sm text-gray-300">Filter by category</span>
                        {aiAnalyzed && (
                            <div className="ml-auto flex items-center gap-1 text-xs text-green-400">
                                <Brain className="w-3 h-3" />
                                <span>AI Refined</span>
                            </div>
                        )}
                    </div>

                    <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                        {CATEGORIES.map(cat => (
                            <button
                                key={cat.value}
                                onClick={() => setSelectedCategory(cat.value)}
                                className={`
                                    px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-all
                                    ${selectedCategory === cat.value
                                        ? 'bg-dira-primary text-white'
                                        : 'bg-white/10 text-gray-300 hover:bg-white/20'
                                    }
                                `}
                            >
                                <span className="mr-1">{cat.icon}</span>
                                {cat.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* POI Counter & Scan Indicator - Positioned below category filter */}
            <div className="absolute top-48 left-0 right-0 z-20 px-4">
                <div className="glass-dark rounded-xl p-3 max-w-md mx-auto">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-dira-primary" />
                            <span className="text-white font-semibold">
                                {visiblePOIs.length} landmarks visible
                            </span>
                        </div>

                        <div className="flex items-center gap-2 text-sm text-gray-400">
                            <Compass className="w-4 h-4" />
                            <span>{Math.round(heading)}°</span>
                        </div>
                    </div>

                    {/* Scan Range Indicator */}
                    <div className="mt-2 h-1 bg-white/10 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-dira-primary transition-all duration-300"
                            style={{ width: `${(visiblePOIs.length / 20) * 100}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Loading State */}
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/50">
                    <div className="glass-dark rounded-xl p-4">
                        <div className="animate-spin h-8 w-8 border-4 border-dira-primary border-t-transparent rounded-full mx-auto" />
                        <p className="text-white mt-2">Scanning horizon...</p>
                    </div>
                </div>
            )}

            {/* Error State */}
            {error && (
                <div className="absolute bottom-20 left-4 right-4 z-20">
                    <div className="glass-dark rounded-xl p-4 border-2 border-red-500/50">
                        <p className="text-red-400 text-sm">{error}</p>
                        <button
                            onClick={fetchPOIs}
                            className="mt-2 px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            )}

            {/* Three.js Canvas with Sky Markers */}
            <Canvas camera={{ position: [0, 0, 0], fov: 75 }}>
                {/* Ambient lighting */}
                <ambientLight intensity={0.5} />
                <pointLight position={[0, 10, 0]} intensity={1} />

                {/* Render Sky Markers with Gemini 3 refinements */}
                {visiblePOIs.map(poi => (
                    <SkyMarker
                        key={poi.id}
                        name={poi.name}
                        category={poi.category}
                        bearing={poi.bearing_degrees}
                        distance={poi.distance_meters}
                        userHeading={heading}
                        yAdjustment={poi.y_adjustment}
                    />
                ))}

                {/* Optional: Sky gradient background */}
                <mesh>
                    <sphereGeometry args={[500, 32, 32]} />
                    <meshBasicMaterial
                        color="#0a0e27"
                        side={2}  // THREE.BackSide
                        transparent
                        opacity={0.8}
                    />
                </mesh>
            </Canvas>

            {/* Instructions */}
            {visiblePOIs.length === 0 && !isLoading && (
                <div className="absolute inset-0 flex items-center justify-center z-10">
                    <div className="glass-dark rounded-2xl p-6 max-w-sm text-center">
                        <Compass className="w-12 h-12 text-dira-primary mx-auto mb-3" />
                        <h3 className="text-white text-lg font-semibold mb-2">
                            Scan the Horizon
                        </h3>
                        <p className="text-gray-300 text-sm">
                            Rotate your device to discover landmarks, cities, and points of interest around you.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
