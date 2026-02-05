import React, { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ArrowBigUp } from 'lucide-react';
import * as THREE from 'three';

interface Arrow3DProps {
    direction: 'forward' | 'left' | 'right' | 'turn-around';
    distance: number;
}

// 3D Arrow Component using Three.js
function Arrow3D({ direction, distance }: Arrow3DProps) {
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

interface NavigationHUDProps {
    direction?: 'forward' | 'left' | 'right' | 'turn-around';
    distance?: number;
    message?: string;
}

// Main Navigation HUD Component
export default function NavigationHUD({
    direction = 'forward',
    distance = 100,
    message = 'Continue forward'
}: NavigationHUDProps) {
    const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);
    const [heading, setHeading] = useState<number>(0);

    // Initialize camera stream
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
    }, []);

    // Get GPS location
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

    // Get compass heading (if available)
    useEffect(() => {
        const handleOrientation = (event: DeviceOrientationEvent) => {
            if (event.alpha !== null) {
                setHeading(event.alpha);
            }
        };

        window.addEventListener('deviceorientation', handleOrientation);
        return () => window.removeEventListener('deviceorientation', handleOrientation);
    }, []);

    return (
        <div className="relative w-full h-full overflow-hidden">
            {/* Camera feed background */}
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover"
            />

            {/* Three.js AR Overlay */}
            <div className="absolute inset-0 pointer-events-none">
                <Canvas camera={{ position: [0, 0, 0], fov: 75 }}>
                    <Arrow3D direction={direction} distance={distance} />
                </Canvas>
            </div>

            {/* HUD Information - Glassmorphic overlay */}
            <div className="absolute top-0 left-0 right-0 p-6 z-10">
                <div className="glass-dark rounded-2xl p-4 max-w-md mx-auto">
                    <div className="flex items-center gap-3">
                        <div className="bg-dira-primary/20 p-2 rounded-lg">
                            <ArrowBigUp className="w-6 h-6 text-dira-primary" />
                        </div>
                        <div className="flex-1">
                            <p className="text-sm text-gray-300">Next instruction</p>
                            <p className="text-lg font-semibold text-white">{message}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-2xl font-bold text-dira-primary">{distance}m</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom HUD - Location info */}
            <div className="absolute bottom-0 left-0 right-0 p-6 z-10">
                <div className="glass-dark rounded-2xl p-4 max-w-md mx-auto">
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
                            <p className="font-semibold text-dira-primary">AR Navigation</p>
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
