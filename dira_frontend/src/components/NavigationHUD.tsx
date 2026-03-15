
import { useRef, useState, useEffect, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import {
    ArrowBigUp,
    Wifi,
    WifiOff,
    Brain,
    Scan,
    AlertCircle,
    RotateCw,
    Mic,
    MicOff,
    Home
} from 'lucide-react';
import { speak, startListening, stopListening, getIsListening } from '../services/voiceService';
import * as THREE from 'three';
import HorizonMode from './HorizonMode';
import MiniMapHUD from './MiniMapHUD';

import NeuralDebugOverlay from './NeuralDebugOverlay'; // Import Overlay
import { useDebugStore } from '../stores/debugStore'; // Import Store
import { detectEnvironment, getAdaptiveConfig, formatEnvironmentMode } from '../utils/adaptiveMode';
import { calculateSolarPhase } from '../utils/solarCalc';
import {
    getCompassHeading,
    calculateGPSHeading,
    assessCompassQuality,
    HeadingSmoothing,
    type CompassQuality,
    type GPSPosition
} from '../utils/compassUtils';

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
    onBack?: () => void;
}

// Main Navigation HUD Component with Agentic Loop
export default function NavigationHUD({
    destination,
    apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
    onBack
}: NavigationHUDProps) {
    // === DEBUG STORE INTEGRATION ===
    const toggleDebug = useDebugStore(state => state.toggleOpen);
    const updateSensorData = useDebugStore(state => state.updateSensorData);
    const updateGeminiStats = useDebugStore(state => state.updateGeminiStats);
    const updateImageStats = useDebugStore(state => state.updateImageStats);
    const setPostGisQueryTime = useDebugStore(state => state.setPostGisQueryTime);
    const addLog = useDebugStore(state => state.addLog);
    const updateAdaptiveStats = useDebugStore(state => state.updateAdaptiveStats);
    const showAnchors = useDebugStore(state => state.showAnchors);
    const isFrozen = useDebugStore(state => state.isFrozen);

    const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Location and sensor state
    const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);
    const [heading, setHeading] = useState<number>(0);
    
    // Compass quality state
    const [compassQuality, setCompassQuality] = useState<CompassQuality>('unavailable');
    const [needsCalibration, setNeedsCalibration] = useState(false);
    const [showCalibration, setShowCalibration] = useState(false);
    
    // GPS-based heading fallback
    const previousGPSPosition = useRef<GPSPosition | null>(null);
    const headingSmoother = useRef(new HeadingSmoothing(0.3));
    const lastCompassUpdate = useRef<number>(Date.now());

    // Mode state: navigation or horizon
    const [mode, setMode] = useState<'navigation' | 'horizon'>('navigation');
    const userModeOverrideRef = useRef<{ mode: typeof mode, timestamp: number } | null>(null); // Track manual overrides

    // Adaptive mode state
    const [ambientLight, setAmbientLight] = useState<number | undefined>();
    const [networkSpeed, setNetworkSpeed] = useState<string>('Unknown');
    const [frameInterval, setFrameInterval] = useState<number>(3000); // Dynamic interval

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
    const [lastKnownInstruction, setLastKnownInstruction] = useState<NavigationInstruction | null>(null);

    // Voice interaction state
    const [isVoiceListening, setIsVoiceListening] = useState(false);
    const [voiceTranscript, setVoiceTranscript] = useState<string | null>(null);
    const [voiceReply, setVoiceReply] = useState<string | null>(null);
    const greetingIndexRef = useRef(0);

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
        console.log('[NavigationHUD] captureAndAnalyzeFrame: Starting capture cycle');
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
            const response = await fetch(`${apiBaseUrl}/api/v1/analyze-frame/`, {
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
                setLastKnownInstruction(data.instructions[0]); // Save for GPS-only fallback
                addLog('GEMINI', `Instruction: ${data.instructions[0].message}`, 'info');
            }

            setLandmarks(data.landmarks || []);
            setConfidence(data.confidence || 0);
            setFromCache(data.from_cache || false);
            setIsOnline(true);

            if (data.from_cache) {
                addLog('SYSTEM', 'Result served from local cache', 'warning');
            }

        } catch (error) {
            console.error('[NavigationHUD] Frame analysis error:', error);
            addLog('SYSTEM', `Connection lost - using GPS-only mode`, 'error');
            setIsOnline(false);

            // GPS-Only Fallback: Use last known instruction + compass
            if (lastKnownInstruction) {
                setCurrentInstruction({
                    ...lastKnownInstruction,
                    message: `${lastKnownInstruction.message} (GPS-only)`
                });
                addLog('SYSTEM', 'Continuing with last instruction + GPS', 'warning');
            } else {
                setCurrentInstruction({
                    direction: 'forward',
                    distance: 0,
                    message: 'Navigation offline - check connection'
                });
            }
        } finally {
            setIsProcessing(false);
        }
    }, [location, heading, destination, apiBaseUrl, compressImage, isProcessing, addLog, updateGeminiStats, updateImageStats, setPostGisQueryTime]);


    // === INITIALIZE CAMERA ===
    useEffect(() => {
        async function initCamera() {
            console.log('[NavigationHUD] initCamera: Initializing media devices');
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
                    const newLocation = {
                        lat: position.coords.latitude,
                        lon: position.coords.longitude
                    };
                    setLocation(newLocation);
                    
                    // Store GPS position with timestamp for heading calculation
                    const gpsPosition: GPSPosition = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        timestamp: Date.now()
                    };
                    
                    // Try to calculate GPS-based heading if compass is unavailable
                    if (previousGPSPosition.current && compassQuality === 'unavailable') {
                        const gpsHeading = calculateGPSHeading(previousGPSPosition.current, gpsPosition);
                        if (gpsHeading) {
                            const smoothed = headingSmoother.current.smooth(gpsHeading.heading);
                            setHeading(smoothed);
                        }
                    }
                    
                    previousGPSPosition.current = gpsPosition;
                },
                (error) => console.error('GPS Error:', error),
                { enableHighAccuracy: true, maximumAge: 1000 }
            );

            return () => navigator.geolocation.clearWatch(watchId);
        }
    }, [compassQuality]);

    // === GET COMPASS HEADING ===
    useEffect(() => {
        const handleOrientation = (event: DeviceOrientationEvent) => {
            const compassData = getCompassHeading(event);
            
            if (compassData) {
                // Apply smoothing to reduce jitter
                const smoothed = headingSmoother.current.smooth(compassData.heading);
                setHeading(smoothed);
                lastCompassUpdate.current = Date.now();
                
                // Assess compass quality
                const quality = assessCompassQuality(compassData);
                setCompassQuality(quality.quality);
                setNeedsCalibration(quality.needsCalibration);
                
                // Show calibration prompt if needed (but not too often)
                if (quality.needsCalibration && !showCalibration) {
                    setShowCalibration(true);
                }
            } else {
                // No compass data available - rely on GPS fallback
                setCompassQuality('unavailable');
            }
        };

        // Request permission for device orientation (required on iOS 13+)
        if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
            (DeviceOrientationEvent as any).requestPermission()
                .then((response: string) => {
                    if (response === 'granted') {
                        window.addEventListener('deviceorientation', handleOrientation as any);
                    } else {
                        setCompassQuality('unavailable');
                    }
                })
                .catch((error: Error) => {
                    console.error('Orientation permission error:', error);
                    setCompassQuality('unavailable');
                });
        } else {
            // Auto-granted on Android and other platforms
            window.addEventListener('deviceorientation', handleOrientation);
        }

        return () => window.removeEventListener('deviceorientation', handleOrientation);
    }, [showCalibration]);


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

    // === AMBIENT LIGHT SENSOR ===
    useEffect(() => {
        if ('AmbientLightSensor' in window) {
            try {
                const sensor = new (window as any).AmbientLightSensor();
                sensor.addEventListener('reading', () => {
                    setAmbientLight(sensor.illuminance);
                });
                sensor.start();
                addLog('SYSTEM', 'Ambient light sensor activated', 'info');

                return () => sensor.stop();
            } catch (e) {
                addLog('SYSTEM', 'Ambient light sensor unavailable - using solar only', 'warning');
            }
        }
    }, [addLog]);

    // === NETWORK QUALITY DETECTION ===
    useEffect(() => {
        const connection = (navigator as any).connection;
        if (connection) {
            const updateNetworkSpeed = () => {
                setNetworkSpeed(connection.effectiveType || 'Unknown');
            };

            updateNetworkSpeed();
            connection.addEventListener('change', updateNetworkSpeed);

            return () => connection.removeEventListener('change', updateNetworkSpeed);
        }
    }, []);

    // === ADAPTIVE MODE LOGIC ===
    useEffect(() => {
        if (location) {
            const now = new Date();
            const solarPhase = calculateSolarPhase(location.lat, location.lon, now);
            const envMode = detectEnvironment(location.lat, location.lon, now, ambientLight);
            const config = getAdaptiveConfig(envMode, networkSpeed as any);

            // Update debug stats
            updateAdaptiveStats({
                environmentMode: formatEnvironmentMode(envMode),
                solarPhase,
                ambientLux: ambientLight || 0,
                networkSpeed,
                frameIntervalMs: config.frameInterval,
                bandwidthSavings: config.bandwidthSavings
            });

            // Update frame interval
            setFrameInterval(config.frameInterval);

            // Auto-switch mode (with 10-min user override protection)
            if (config.forceMode && config.suggestedMode !== mode) {
                const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
                const hasRecentOverride = userModeOverrideRef.current &&
                    userModeOverrideRef.current.timestamp > tenMinutesAgo;

                if (!hasRecentOverride) {
                    setMode(config.suggestedMode as any);
                    addLog('SYSTEM', `Auto-switched to ${config.suggestedMode} mode: ${config.reason}`, 'warning');
                }
            }

            // Log adaptive behavior
            if (config.bandwidthSavings > 0) {
                addLog('SYSTEM', `Adaptive mode: ${config.frameInterval}ms interval (-${config.bandwidthSavings}% bandwidth)`, 'info');
            }
        }
    }, [location, ambientLight, networkSpeed, mode, addLog, updateAdaptiveStats]);

    // Track manual mode changes — also triggers an ambient Gemini greeting
    const handleModeChange = useCallback((newMode: typeof mode) => {
        setMode(newMode);
        userModeOverrideRef.current = { mode: newMode, timestamp: Date.now() };
        addLog('USER', `Manual mode switch: ${newMode}`, 'info');

        // Ambient greeting on mode switch (non-blocking)
        const idx = greetingIndexRef.current++;
        fetch(`${apiBaseUrl}/api/v1/ambient-greeting/?mode=${newMode}&idx=${idx % 3}`)
            .then(r => r.json())
            .then(d => { if (d.greeting) speak(d.greeting); })
            .catch(() => {});
    }, [addLog, apiBaseUrl]);

    // === AMBIENT GREETING ON MOUNT ===
    useEffect(() => {
        // Greet the user once when the app starts (slight delay so voice is ready)
        const timer = setTimeout(() => {
            fetch(`${apiBaseUrl}/api/v1/ambient-greeting/?mode=navigation&idx=0`)
                .then(r => r.json())
                .then(d => { if (d.greeting) speak(d.greeting); })
                .catch(() => {});
        }, 1500);
        return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // === VOICE COMMAND HANDLER ===
    const handleMicPress = useCallback(() => {
        if (getIsListening()) {
            stopListening();
            setIsVoiceListening(false);
            return;
        }

        setVoiceTranscript(null);
        setVoiceReply(null);

        startListening({
            onStart: () => setIsVoiceListening(true),
            onEnd: () => setIsVoiceListening(false),
            onError: (err) => {
                setIsVoiceListening(false);
                addLog('SYSTEM', `Mic error: ${err}`, 'error');
            },
            onResult: async ({ transcript }) => {
                setVoiceTranscript(transcript);
                addLog('USER', `Voice: "${transcript}"`, 'info');

                try {
                    const res = await fetch(`${apiBaseUrl}/api/v1/voice-command/`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            transcript,
                            mode,
                            latitude: location?.lat,
                            longitude: location?.lon,
                            heading,
                            thought_signature: thoughtSignatureRef.current,
                        }),
                    });
                    const data = await res.json();
                    const reply = data.response || '';
                    setVoiceReply(reply);
                    speak(reply);
                    addLog('GEMINI', reply, 'success');
                } catch (err) {
                    speak('Sorry, I had trouble connecting. Please try again.');
                    addLog('SYSTEM', 'Voice command failed', 'error');
                }
            },
        });
    }, [addLog, apiBaseUrl, heading, location, mode]);


    // === START FRAME ANALYSIS LOOP (ADAPTIVE) ===
    useEffect(() => {
        if (location && videoStream && !isFrozen) {
            // Adaptive frame analysis interval
            analysisIntervalRef.current = setInterval(() => {
                captureAndAnalyzeFrame();
            }, frameInterval); // Dynamic interval based on environment!

            // Initial analysis
            setTimeout(() => captureAndAnalyzeFrame(), 1000);
        }

        return () => {
            if (analysisIntervalRef.current) {
                clearInterval(analysisIntervalRef.current);
            }
        };
    }, [location, videoStream, captureAndAnalyzeFrame, isFrozen, frameInterval]); // Add frameInterval dependency

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

            {/* Scanline overlay for that tech aesthetic */}
            <div className="scanline" />


            {/* Header Controls (Top) */}
            <div className="absolute top-4 left-4 right-4 z-30 flex justify-between items-start pointer-events-none">
                {/* Left Side: Home & Neural Link */}
                <div className="flex flex-col gap-3 pointer-events-auto sm:gap-4">
                    <button
                        onClick={onBack}
                        className="glass-dark p-3.5 rounded-2xl hover:bg-white/10 active:scale-95 transition-all text-white flex items-center gap-2 group"
                    >
                        <Home className="w-6 h-6 text-dira-primary group-hover:scale-110 transition-transform" />
                        <span className="text-[10px] font-bold uppercase tracking-widest hidden sm:block">Return Home</span>
                    </button>
                    
                    <button
                        onClick={() => toggleDebug()}
                        className="glass-dark p-3.5 rounded-2xl hover:bg-white/10 active:scale-95 transition-all text-purple-400 group"
                        title="Neural Diagnostics"
                    >
                         <Brain className="w-6 h-6 group-hover:rotate-12 transition-transform" />
                    </button>
                </div>

                {/* Right Side: Mode Toggle & Mic */}
                <div className="flex flex-col gap-3 pointer-events-auto items-end">
                    <button
                        onClick={() => handleModeChange(mode === 'navigation' ? 'horizon' : 'navigation')}
                        className="glass-dark p-3.5 rounded-2xl hover:bg-white/10 active:scale-95 transition-all group"
                    >
                        {mode === 'navigation' ? (
                            <Scan className="w-6 h-6 text-dira-primary group-hover:scale-110 transition-transform" />
                        ) : (
                            <ArrowBigUp className="w-6 h-6 text-dira-primary group-hover:scale-110 transition-transform" />
                        )}
                    </button>

                    {/* Mode Indicator Badge */}
                    <div className="glass-dark px-4 py-2 rounded-xl text-center border-dira-primary/20 bg-dira-primary/5">
                        <p className="text-[9px] text-dira-primary font-black uppercase tracking-[0.2em]">
                            {mode === 'navigation' ? 'Nav-Link' : 'Horizon-OS'}
                        </p>
                    </div>

                    {/* Repositioned Mic Button - Much natural for one-handed rail use */}
                    <button
                        onClick={handleMicPress}
                        className={`p-5 rounded-full shadow-2xl transition-all duration-300 active:scale-90 group relative ${
                            isVoiceListening
                                ? 'bg-red-500/80 hover:bg-red-600 shadow-red-500/40'
                                : 'bg-dira-primary/80 hover:bg-dira-primary shadow-dira-primary/40'
                        }`}
                        title={isVoiceListening ? 'Tap to stop' : 'Tap to talk to Gemini'}
                    >
                        {isVoiceListening && (
                            <>
                                <span className="absolute inset-0 rounded-full bg-red-400 opacity-60 animate-ping" />
                                <span className="absolute inset-[-4px] rounded-full border-2 border-red-400/30 animate-pulse" />
                            </>
                        )}
                        {isVoiceListening
                            ? <MicOff className="w-7 h-7 text-white relative z-10" />
                            : <Mic className="w-7 h-7 text-white relative z-10 group-hover:scale-110 transition-transform" />
                        }
                    </button>
                </div>
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

                    {/* Mini-Map HUD (Bottom Left) */}
                    {location && (
                        <MiniMapHUD
                            currentLat={location?.lat || 0}
                            currentLon={location?.lon || 0}
                            currentHeading={heading}
                            apiBaseUrl={apiBaseUrl || ''}
                        />
                    )}
                </>
            ) : (
                <>
                    {/* Horizon Mode */}
                    {location && (
                        <div className="absolute inset-0">
                            <HorizonMode
                                latitude={location?.lat || 0}
                                longitude={location?.lon || 0}
                                heading={heading}
                                apiBaseUrl={apiBaseUrl}
                            />
                        </div>
                    )}
                </>
            )}

            {/* HUD Information - Glassmorphic overlay (Only in Navigation Mode) */}
            {mode === 'navigation' && (
                <div className="absolute top-40 sm:top-32 left-0 right-0 p-4 z-10 pointer-events-none animate-fade-in">
                    {/* Container for centering, pointer-events-auto for interactions if needed */}
                    <div className="glass-dark rounded-[2rem] p-5 max-w-sm mx-auto pointer-events-auto border-white/5 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
                        <div className="flex items-center gap-4">
                            <div className="bg-dira-primary/10 p-3 rounded-2xl border border-dira-primary/20 shadow-[inset_0_0_15px_rgba(0,217,255,0.1)]">
                                <ArrowBigUp className="w-7 h-7 text-dira-primary animate-pulse-slow" />
                            </div>
                            <div className="flex-1">
                                <p className="text-[10px] text-dira-primary font-black uppercase tracking-[0.15em] mb-0.5">Vector Link</p>
                                <p className="text-base font-bold text-white leading-tight">{currentInstruction.message}</p>
                            </div>
                            <div className="text-right pl-2 border-l border-white/10">
                                <p className="text-2xl font-black text-white tracking-tighter">
                                    {currentInstruction.distance > 0 ? currentInstruction.distance : '---'}
                                    <span className="text-[10px] text-dira-primary ml-0.5 uppercase">m</span>
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
            )}

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

            {/* ===== VOICE TRANSCRIPT (Repositioned for less clutter) ===== */}
            <div className="absolute top-2/3 left-0 right-0 z-30 flex flex-col items-center gap-2 pointer-events-none">
                {/* Voice transcript / reply bubble */}
                {(voiceTranscript || voiceReply) && (
                    <div className="pointer-events-auto glass-dark rounded-2xl px-4 py-3 max-w-xs text-center shadow-lg border border-white/10 animate-fade-in">
                        {voiceTranscript && (
                            <p className="text-[10px] text-gray-400 mb-1">
                                <span className="text-dira-primary">You:</span> {voiceTranscript}
                            </p>
                        )}
                        {voiceReply && (
                            <p className="text-sm text-white font-medium leading-tight">{voiceReply}</p>
                        )}
                    </div>
                )}
            </div>

            {/* Compass Calibration Overlay */}
            {showCalibration && needsCalibration && (
                <div className="absolute inset-0 flex items-center justify-center z-50 bg-black/70 backdrop-blur-sm">
                    <div className="glass-dark rounded-2xl p-6 max-w-sm mx-4 border-2 border-yellow-500/50">
                        <div className="flex items-center gap-3 mb-4">
                            <AlertCircle className="w-8 h-8 text-yellow-400" />
                            <h3 className="text-xl font-bold text-white">Calibrate Compass</h3>
                        </div>
                        
                        <p className="text-gray-300 mb-4">
                            For accurate AR navigation, calibrate your device's compass by moving it in a figure-8 pattern.
                        </p>
                        
                        {/* Figure-8 Animation */}
                        <div className="flex justify-center mb-4">
                            <RotateCw className="w-16 h-16 text-dira-primary animate-spin" style={{ animationDuration: '3s' }} />
                        </div>
                        
                        <p className="text-sm text-gray-400 mb-4 text-center">
                            Hold your phone and rotate your wrist to trace a figure-8 in the air
                        </p>
                        
                        <button
                            onClick={() => setShowCalibration(false)}
                            className="w-full bg-dira-primary hover:bg-dira-primary/80 text-white font-semibold py-3 px-4 rounded-lg transition-all"
                        >
                            Done Calibrating
                        </button>
                    </div>
                </div>
            )}

            {/* Bottom HUD - Location info (Desktop / Large Mobile) */}
            <div className="absolute bottom-6 right-6 p-0 z-10 pointer-events-none sm:bottom-8 sm:right-8">
                <div className="glass-dark rounded-2xl p-4 min-w-[200px] pointer-events-auto border-white/5 group hover:bg-black/60 transition-colors">
                    <div className="flex flex-col gap-2 text-[10px]">
                        <div className="flex justify-between items-center group/lat">
                            <span className="text-gray-500 uppercase font-black tracking-widest group-hover/lat:text-dira-primary transition-colors">LAT</span>
                            <span className="text-white font-mono text-xs tabular-nums">{location ? (location.lat as number).toFixed(5) : '---'}</span>
                        </div>
                        <div className="flex justify-between items-center group/lon">
                            <span className="text-gray-500 uppercase font-black tracking-widest group-hover/lon:text-dira-primary transition-colors">LON</span>
                            <span className="text-white font-mono text-xs tabular-nums">{location ? (location.lon as number).toFixed(5) : '---'}</span>
                        </div>
                        <div className="flex justify-between items-center group/hdg">
                            <span className="text-gray-500 uppercase font-black tracking-widest group-hover/hdg:text-dira-primary transition-colors">HDG</span>
                            <div className="flex items-center gap-2">
                                <span className="text-white font-mono text-xs tabular-nums">{heading.toFixed(0)}°</span>
                                <div className="w-12 h-1 bg-white/5 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-dira-primary transition-all duration-300" 
                                        style={{ width: `${(heading / 360) * 100}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between">
                             <div className="flex items-center gap-1.5">
                                <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isOnline ? 'bg-dira-primary shadow-[0_0_8px_#00d9ff]' : 'bg-red-500'}`} />
                                <span className="text-dira-primary/80 lowercase font-black tracking-tighter italic">system nexus active</span>
                             </div>
                             {isProcessing && (
                                <div className="flex gap-0.5">
                                    <div className="w-1 h-3 bg-dira-primary/30 animate-[bounce_1s_infinite_0ms]" />
                                    <div className="w-1 h-3 bg-dira-primary/30 animate-[bounce_1s_infinite_150ms]" />
                                    <div className="w-1 h-3 bg-dira-primary/30 animate-[bounce_1s_infinite_300ms]" />
                                </div>
                             )}
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
