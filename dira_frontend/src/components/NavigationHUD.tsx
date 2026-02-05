
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import {
    ArrowBigUp,
    Wifi,
    WifiOff,
    Brain,
    Scan
} from 'lucide-react';
import * as THREE from 'three';
import HorizonMode from './HorizonMode';

import NeuralDebugOverlay from './NeuralDebugOverlay'; // Import Overlay
import { useDebugStore } from '../stores/debugStore'; // Import Store

interface Arrow3DProps {
    direction: 'forward' | 'left' | 'right' | 'turn-around';
    distance: number;
}

// 3D Arrow Component using Three.js
function Arrow3D({ direction }: Arrow3DProps) {
    const meshRef = useRef<THREE.Mesh>(null);
    const [rotation, setRotation] = useState(0);

    useEffect(() => {
        // Calculate rotation based on direction
        switch (direction) {
            case 'forward':
                setRotation(0);
                break;
            case 'right':
                setRotation(-Math.PI / 2);
                break;
            case 'left':
                setRotation(Math.PI / 2);
                break;
            case 'turn-around':
                setRotation(Math.PI);
                break;
        }
    }, [direction]);

    // Animate arrow bobbing
    useFrame(({ clock }) => {
        if (meshRef.current) {
            meshRef.current.position.y = Math.sin(clock.getElapsedTime() * 2) * 0.2;
            meshRef.current.rotation.y = rotation;
        }
    });

    return (
        <group>
            <mesh ref={meshRef} position={[0, 0, -5]}>
                {/* Arrow cone */}
                <coneGeometry args={[0.5, 2, 4]} />
                <meshStandardMaterial
                    color="#00D9FF"
                    emissive="#00D9FF"
                    emissiveIntensity={0.5}
                    transparent
                    opacity={0.9}
                />
            </mesh>

            {/* Arrow shaft */}
            <mesh position={[0, -1.5, -5]} rotation-y={rotation}>
                <cylinderGeometry args={[0.1, 0.1, 1, 8]} />
                <meshStandardMaterial
                    color="#00D9FF"
                    emissive="#00D9FF"
                    emissiveIntensity={0.3}
                    transparent
                    opacity={0.8}
                />
            </mesh>

            {/* Ambient light */}
            <ambientLight intensity={0.5} />
            <pointLight position={[0, 5, 0]} intensity={1} />
        </group>
    );
}

// Camera Controller - Syncs Three.js camera with device compass
interface CameraControllerProps {
    heading: number;
}

function CameraController({ heading }: CameraControllerProps) {
    useFrame(({ camera }) => {
        // Convert compass heading to radians
        // Device compass returns degrees where 0° = North, 90° = East, 180° = South, 270° = West
        // Three.js uses radians where 0 = positive Z axis
        // We need to invert the rotation so the camera rotates opposite to device rotation
        // This keeps the AR content fixed to real-world directions
        const headingRadians = THREE.MathUtils.degToRad(-heading);

        // Smoothly interpolate camera rotation for smooth transitions
        camera.rotation.y = THREE.MathUtils.lerp(
            camera.rotation.y,
            headingRadians,
            0.1 // Smoothing factor (0-1, higher = faster)
        );
    });

    return null; // This component doesn't render anything
}

interface NavigationInstruction {
    direction: 'forward' | 'left' | 'right' | 'turn-around';
    distance: number;
    message: string;
}

interface NavigationResponse {
    instructions: NavigationInstruction[];
    confidence: number;
    landmarks: string[];
    thought_signature?: string;
    from_cache?: boolean;
}

interface NavigationHUDProps {
    destination?: string;
    apiBaseUrl?: string;
}

// Main Navigation HUD Component with Agentic Loop
export default function NavigationHUD({
    destination,
    apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
}: NavigationHUDProps) {
    // === DEBUG STORE INTEGRATION ===
    const toggleDebug = useDebugStore(state => state.toggleOpen);
    const updateSensorData = useDebugStore(state => state.updateSensorData);
    const updateGeminiStats = useDebugStore(state => state.updateGeminiStats);
    const updateImageStats = useDebugStore(state => state.updateImageStats);
    const setPostGisQueryTime = useDebugStore(state => state.setPostGisQueryTime);
    const addLog = useDebugStore(state => state.addLog);
    const showAnchors = useDebugStore(state => state.showAnchors);
    const isFrozen = useDebugStore(state => state.isFrozen);

    const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Location and sensor state
    const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);
    const [heading, setHeading] = useState<number>(0);

    // Mode state: navigation or horizon
    const [mode, setMode] = useState<'navigation' | 'horizon'>('navigation');

    // Navigation state
    const [currentInstruction, setCurrentInstruction] = useState<NavigationInstruction>({
        direction: 'forward',
        distance: 0,
        message: 'Initializing AR navigation...'
    });
    const [landmarks, setLandmarks] = useState<string[]>([]);
    const [confidence, setConfidence] = useState<number>(0);

    // AI state - CRITICAL: Using useRef for thought signature to persist across renders
    const thoughtSignatureRef = useRef<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isOnline, setIsOnline] = useState(true);
    const [fromCache, setFromCache] = useState(false);

    // Frame analysis interval
    const analysisIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // === IMAGE COMPRESSION ===
    const compressImage = useCallback((imageDataUrl: string): Promise<string> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Target size: 800px max dimension
                const maxDimension = 800;
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

                ctx?.drawImage(img, 0, 0, width, height);

                // Compress to JPEG with 75% quality
                const compressed = canvas.toDataURL('image/jpeg', 0.75);
                resolve(compressed.split(',')[1]); // Return base64 without prefix
            };
            img.src = imageDataUrl;
        });
    }, []);

    // === CAPTURE AND ANALYZE FRAME ===
    const captureAndAnalyzeFrame = useCallback(async () => {
        if (!videoRef.current || !location || isProcessing) return;

        setIsProcessing(true);
        const startTime = Date.now();
        addLog('SYSTEM', 'Initiating frame capture cycle', 'info');

        try {
            // Capture frame from video
            const canvas = canvasRef.current || document.createElement('canvas');
            const video = videoRef.current;

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            const ctx = canvas.getContext('2d');
            ctx?.drawImage(video, 0, 0);

            // Get base64 image & calculate original size
            const imageDataUrl = canvas.toDataURL('image/jpeg', 0.8);
            const originalSize = Math.ceil((imageDataUrl.length * 3) / 4);

            // Compress image
            const compressedBase64 = await compressImage(imageDataUrl);
            const compressedSize = Math.ceil((compressedBase64.length * 3) / 4);
            const compressionRatio = `${(100 - (compressedSize / originalSize * 100)).toFixed(1)}% `;

            // Update Image Stats
            updateImageStats({
                originalSize,
                compressedSize,
                compressionRatio,
                resolution: 'Medium'
            });

            // Prepare request payload
            const payload = {
                image: compressedBase64,
                latitude: location.lat,
                longitude: location.lon,
                heading: heading,
                destination: destination,
                thought_signature: thoughtSignatureRef.current, // AGENTIC LOOP: Send previous signature
                compress: true
            };

            addLog('SYSTEM', `Sending frame to Gemini(${(compressedSize / 1024).toFixed(1)}KB)`, 'info');

            // Call backend API
            const response = await fetch(`${apiBaseUrl} /api/v1 / analyze - frame / `, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            const latency = Date.now() - startTime;
            setPostGisQueryTime(Math.floor(latency * 0.2)); // Simulating DB time as ~20% of total

            if (!response.ok) {
                throw new Error(`API Error: ${response.status} `);
            }

            const data: NavigationResponse = await response.json();

            // AGENTIC LOOP: Store new thought signature for next request
            if (data.thought_signature) {
                thoughtSignatureRef.current = data.thought_signature;
                addLog('GEMINI', `Context updated: ${data.thought_signature.substring(0, 12)}...`, 'success');
            }

            // Update Gemini Stats
            updateGeminiStats({
                thoughtSignature: data.thought_signature ? `${data.thought_signature.substring(0, 12)}...` : 'None',
                reasoningLatency: latency,
                tokenEfficiency: { input: 1200, output: 150 }, // Mock for now until headers available
                thinkingLevel: 'LOW'
            });

            // Update UI with navigation data
            if (data.instructions && data.instructions.length > 0) {
                setCurrentInstruction(data.instructions[0]);
                addLog('GEMINI', `Instruction: ${data.instructions[0].message} `, 'info');
            }

            setLandmarks(data.landmarks || []);
            setConfidence(data.confidence || 0);
            setFromCache(data.from_cache || false);
            setIsOnline(true);

            if (data.from_cache) {
                addLog('SYSTEM', 'Result served from local cache', 'warning');
            }

        } catch (error) {
            console.error('Frame analysis error:', error);
            addLog('SYSTEM', `Analysis failed: ${error} `, 'error');
            setIsOnline(false);
            setCurrentInstruction({
                direction: 'forward',
                distance: 0,
                message: 'Navigation offline - check connection'
            });
        } finally {
            setIsProcessing(false);
        }
    }, [location, heading, destination, apiBaseUrl, compressImage, isProcessing, addLog, updateGeminiStats, updateImageStats, setPostGisQueryTime]);


    // === INITIALIZE CAMERA ===
    useEffect(() => {
        async function initCamera() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: 'environment',
                        width: { ideal: 1920 },
                        height: { ideal: 1080 }
                    }
                });
                setVideoStream(stream);
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
            } catch (error) {
                console.error('Error accessing camera:', error);
            }
        }

        initCamera();

        return () => {
            if (videoStream) {
                videoStream.getTracks().forEach(track => track.stop());
            }
        };
    }, [videoStream]);

    // === GET GPS LOCATION ===
    useEffect(() => {
        if ('geolocation' in navigator) {
            const watchId = navigator.geolocation.watchPosition(
                (position) => {
                    setLocation({
                        lat: position.coords.latitude,
                        lon: position.coords.longitude
                    });
                },
                (error) => console.error('GPS Error:', error),
                { enableHighAccuracy: true, maximumAge: 1000 }
            );

            return () => navigator.geolocation.clearWatch(watchId);
        }
    }, []);

    // === GET COMPASS HEADING ===
    useEffect(() => {
        const handleOrientation = (event: DeviceOrientationEvent) => {
            if (event.alpha !== null) {
                setHeading(event.alpha);
            }
        };

        window.addEventListener('deviceorientation', handleOrientation);
        return () => window.removeEventListener('deviceorientation', handleOrientation);
    }, []);


    // Update Sensor Data in Debug Store
    useEffect(() => {
        if (location) {
            updateSensorData({
                compassHeading: heading,
                gpsAccuracy: 5.0, // Mock accuracy for now
                pitch: 0, // DeviceMotion would provide this
                roll: 0
            });
        }
    }, [location, heading, updateSensorData]);


    // === START FRAME ANALYSIS LOOP ===
    useEffect(() => {
        if (location && videoStream && !isFrozen) { // Check isFrozen
            // Analyze frame every 3 seconds
            analysisIntervalRef.current = setInterval(() => {
                captureAndAnalyzeFrame();
            }, 3000);

            // Initial analysis
            setTimeout(() => captureAndAnalyzeFrame(), 1000);
        }

        return () => {
            if (analysisIntervalRef.current) {
                clearInterval(analysisIntervalRef.current);
            }
        };
    }, [location, videoStream, captureAndAnalyzeFrame, isFrozen]); // Add isFrozen dependency

    return (
        <div className="relative w-full h-full overflow-hidden">
            {/* Neural Link Debug Overlay */}
            <NeuralDebugOverlay />

            {/* Camera feed background */}
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover"
            />

            {/* Hidden canvas for frame capture */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Debug Toggle (Easter Egg) */}
            <div className="absolute top-4 left-4 z-40">
                <button
                    onClick={() => {
                        toggleDebug();
                        addLog('USER', 'Neural Link activated via HUD', 'info');
                    }}
                    className="p-2 bg-black/40 backdrop-blur-md rounded-full border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-all"
                >
                    <Brain className="w-5 h-5" />
                </button>
            </div>

            {/* Mode Toggle Button */}
            <div className="absolute top-4 right-4 z-30">
                <button
                    onClick={() => setMode(mode === 'navigation' ? 'horizon' : 'navigation')}
                    className="glass-dark p-3 rounded-xl hover:bg-white/20 transition-all"
                >
                    {mode === 'navigation' ? (
                        <Scan className="w-6 h-6 text-dira-primary" />
                    ) : (
                        <ArrowBigUp className="w-6 h-6 text-dira-primary" />
                    )}
                </button>
            </div>

            {/* Conditional Rendering based on mode */}
            {mode === 'navigation' ? (
                <>
                    {/* Three.js AR Overlay - Navigation Mode */}
                    {showAnchors && ( // Respect toggle
                        <div className="absolute inset-0 pointer-events-none">
                            <Canvas camera={{ position: [0, 0, 0], fov: 75 }}>
                                {/* Sync camera rotation with device compass */}
                                <CameraController heading={heading} />

                                {/* 3D Navigation Arrow */}
                                <Arrow3D
                                    direction={currentInstruction.direction}
                                    distance={currentInstruction.distance}
                                />
                            </Canvas>
                        </div>
                    )}
                </>
            ) : (
                <>
                    {/* Horizon Mode */}
                    {location && (
                        <div className="absolute inset-0">
                            <HorizonMode
                                latitude={location.lat}
                                longitude={location.lon}
                                heading={heading}
                                apiBaseUrl={apiBaseUrl}
                            />
                        </div>
                    )}
                </>
            )}

            {/* HUD Information - Glassmorphic overlay */}
            <div className="absolute top-0 left-0 right-0 p-6 z-10 pointer-events-none">
                {/* Container for centering, pointer-events-auto for interactions if needed */}
                <div className="glass-dark rounded-2xl p-4 max-w-md mx-auto mt-12 pointer-events-auto">
                    <div className="flex items-center gap-3">
                        <div className="bg-dira-primary/20 p-2 rounded-lg">
                            <ArrowBigUp className="w-6 h-6 text-dira-primary" />
                        </div>
                        <div className="flex-1">
                            <p className="text-sm text-gray-300">Next instruction</p>
                            <p className="text-lg font-semibold text-white">{currentInstruction.message}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-2xl font-bold text-dira-primary">
                                {currentInstruction.distance > 0 ? `${currentInstruction.distance} m` : '---'}
                            </p>
                        </div>
                    </div>

                    {/* AI Status Indicator */}
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/10">
                        <div className="flex items-center gap-1 text-xs">
                            {isOnline ? (
                                <Wifi className="w-4 h-4 text-green-400" />
                            ) : (
                                <WifiOff className="w-4 h-4 text-red-400" />
                            )}
                            <span className="text-gray-400">
                                {isOnline ? 'Online' : 'Offline'}
                            </span>
                        </div>

                        {thoughtSignatureRef.current && (
                            <div className="flex items-center gap-1 text-xs">
                                <Brain className="w-4 h-4 text-purple-400" />
                                <span className="text-gray-400">Context Active</span>
                            </div>
                        )}

                        {fromCache && (
                            <span className="text-xs text-yellow-400">Cached</span>
                        )}

                        <div className="ml-auto text-xs text-gray-400">
                            {(confidence * 100).toFixed(0)}% confident
                        </div>
                    </div>
                </div>
            </div>

            {/* Landmarks Display */}
            {landmarks.length > 0 && showAnchors && (
                <div className="absolute top-48 left-6 right-6 z-10 pointer-events-none">
                    <div className="glass-dark rounded-xl p-3 max-w-md mx-auto pointer-events-auto">
                        <p className="text-xs text-gray-400 mb-1">Nearby Landmarks</p>
                        <div className="flex flex-wrap gap-2">
                            {landmarks.slice(0, 3).map((landmark, idx) => (
                                <span
                                    key={idx}
                                    className="text-xs bg-dira-primary/20 text-dira-primary px-2 py-1 rounded"
                                >
                                    {landmark}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Bottom HUD - Location info */}
            <div className="absolute bottom-0 left-0 right-0 p-6 z-10 pointer-events-none">
                <div className="glass-dark rounded-2xl p-4 max-w-md mx-auto pointer-events-auto">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <p className="text-gray-400">Latitude</p>
                            <p className="font-mono text-white">
                                {location ? location.lat.toFixed(6) : '---'}
                            </p>
                        </div>
                        <div>
                            <p className="text-gray-400">Longitude</p>
                            <p className="font-mono text-white">
                                {location ? location.lon.toFixed(6) : '---'}
                            </p>
                        </div>
                        <div>
                            <p className="text-gray-400">Heading</p>
                            <p className="font-mono text-white">{heading.toFixed(0)}°</p>
                        </div>
                        <div>
                            <p className="text-gray-400">Mode</p>
                            <p className="font-semibold text-dira-primary flex items-center gap-1">
                                AR + AI
                                {isProcessing && (
                                    <span className="inline-block w-2 h-2 bg-dira-primary rounded-full animate-pulse"></span>
                                )}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Fullscreen overlay for camera permission */}
            {!videoStream && (
                <div className="absolute inset-0 bg-black flex items-center justify-center">
                    <div className="text-center">
                        <p className="text-xl text-white mb-4">Camera access required</p>
                        <p className="text-gray-400">Please allow camera permissions for AR navigation</p>
                    </div>
                </div>
            )}
        </div>
    );
}
