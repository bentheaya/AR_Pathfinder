import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface SkyAnchorProps {
    bearing: number;          // Target bearing (0-360°)
    elevationAngle: number;   // Vertical angle in degrees
    visualHeight: number;     // Beam height based on distance
    userHeading: number;      // Current device heading
    isAligned: boolean;       // Whether user is facing target
}

/**
 * SkyAnchor - Glowing vertical beam that marks POI location in the sky.
 * 
 * The beam fades in when user aligns with target bearing,
 * positioned at correct bearing and elevation accounting for Earth's curvature.
 */
export default function SkyAnchor({
    bearing,
    elevationAngle,
    visualHeight,
    userHeading,
    isAligned
}: SkyAnchorProps) {
    const beamRef = useRef<THREE.Mesh>(null);
    const glowRef = useRef<THREE.PointLight>(null);
    const topMarkerRef = useRef<THREE.Mesh>(null);

    // Calculate position on virtual sphere
    const relativeBearing = (bearing - userHeading + 360) % 360;
    const relativeBearingRad = THREE.MathUtils.degToRad(relativeBearing);
    const elevationRad = THREE.MathUtils.degToRad(elevationAngle);

    // Sphere radius (virtual dome)
    const sphereRadius = 100;

    // 3D position accounting for elevation
    const x = Math.sin(relativeBearingRad) * Math.cos(elevationRad) * sphereRadius;
    const y = Math.sin(elevationRad) * sphereRadius;
    const z = -Math.cos(relativeBearingRad) * Math.cos(elevationRad) * sphereRadius;

    // Smooth fade in/out animation
    useFrame((state) => {
        if (beamRef.current && glowRef.current && topMarkerRef.current) {
            const targetOpacity = isAligned ? 1.0 : 0.0;
            const currentOpacity = beamRef.current.material.opacity;

            // Smooth fade (lerp)
            const newOpacity = THREE.MathUtils.lerp(
                currentOpacity,
                targetOpacity,
                0.05
            );

            beamRef.current.material.opacity = newOpacity;
            (topMarkerRef.current.material as THREE.MeshStandardMaterial).opacity = newOpacity;

            // Pulsing glow effect
            const pulse = Math.sin(state.clock.elapsedTime * 2) * 0.3 + 0.7;
            glowRef.current.intensity = newOpacity * pulse * 3;
        }
    });

    return (
        <group position={[x, y, z]}>
            {/* Vertical Glowing Beam */}
            <mesh ref={beamRef} position={[0, -visualHeight / 2, 0]}>
                <cylinderGeometry args={[0.5, 0.5, visualHeight, 16]} />
                <meshStandardMaterial
                    color="#00ffff"
                    emissive="#00ffff"
                    emissiveIntensity={2}
                    transparent
                    opacity={0}
                />
            </mesh>

            {/* Point Light Glow */}
            <pointLight
                ref={glowRef}
                color="#00ffff"
                intensity={0}
                distance={30}
            />

            {/* Top Marker Sphere */}
            <mesh ref={topMarkerRef} position={[0, visualHeight / 2, 0]}>
                <sphereGeometry args={[1.5, 16, 16]} />
                <meshStandardMaterial
                    color="#00ffff"
                    emissive="#00ffff"
                    emissiveIntensity={3}
                    transparent
                    opacity={0}
                />
            </mesh>
        </group>
    );
}
