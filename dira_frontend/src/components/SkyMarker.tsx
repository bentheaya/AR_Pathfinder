import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { calculateRelativeBearing } from '../utils/compassUtils';

interface SkyMarkerProps {
    name: string;
    category: string;
    bearing: number;        // Degrees from North (0-360)
    distance: number;       // Meters
    userHeading: number;    // Current device heading
    yAdjustment?: number;   // Gemini 3 Y-position refinement (-1 to 1)
}

// Category color mapping
const CATEGORY_COLORS: Record<string, string> = {
    institution: '#3B82F6',  // Blue
    nature: '#10B981',       // Green
    business: '#F59E0B',     // Orange
    government: '#8B5CF6',   // Purple
    transport: '#EF4444',    // Red
    landmark: '#EC4899',     // Pink
    city: '#14B8A6',         // Teal
    other: '#6B7280',        // Gray
};

export default function SkyMarker({
    name,
    category,
    bearing,
    distance,
    userHeading,
    yAdjustment = 0  // Default to no adjustment
}: SkyMarkerProps) {
    const beamRef = useRef<THREE.Mesh>(null);
    const markerGroupRef = useRef<THREE.Group>(null);

    // Calculate position on virtual sphere
    // The marker should be positioned based on the bearing relative to user's current heading
    const relativeBearingDegrees = calculateRelativeBearing(bearing, userHeading);
    const relativeBearingRad = THREE.MathUtils.degToRad(relativeBearingDegrees);

    // Virtual sphere radius (constant distance from camera)
    const sphereRadius = 100;

    // Calculate X, Z position on the sphere
    // We use sin for X because Three.js uses a left-handed coordinate system
    const x = Math.sin(relativeBearingRad) * sphereRadius;
    const z = -Math.cos(relativeBearingRad) * sphereRadius;

    // Calculate Y position with Gemini 3 refinement
    const baseY = getYPositionFromDistance(distance);
    // Apply AI adjustment (yAdjustment ranges from -1 to 1, scale to ±10 units)
    const y = baseY + (yAdjustment * 10);

    // Get category color
    const color = CATEGORY_COLORS[category] || CATEGORY_COLORS.other;

    // Animate beam pulsing
    useFrame(({ clock }) => {
        if (beamRef.current) {
            const pulse = Math.sin(clock.getElapsedTime() * 2) * 0.1 + 0.9;
            beamRef.current.scale.y = pulse;
        }
    });

    return (
        <group ref={markerGroupRef} position={[x, y, z]}>
            {/* Billboard - always faces camera */}
            <Billboard
                follow={true}
                lockX={false}
                lockY={false}
                lockZ={false}
            >
                {/* Marker background */}
                <mesh position={[0, 0, 0]}>
                    <planeGeometry args={[4, 1.2]} />
                    <meshBasicMaterial
                        color={color}
                        transparent
                        opacity={0.9}
                        side={THREE.DoubleSide}
                    />
                </mesh>

                {/* Text label */}
                <Text
                    position={[0, 0, 0.01]}
                    fontSize={0.5}
                    color="white"
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={0.02}
                    outlineColor="black"
                >
                    {name}
                </Text>

                {/* Distance indicator */}
                <Text
                    position={[0, -0.4, 0.01]}
                    fontSize={0.25}
                    color="white"
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={0.01}
                    outlineColor="black"
                >
                    {formatDistance(distance)}
                </Text>
            </Billboard>

            {/* Vertical beam pointing down to horizon */}
            <mesh ref={beamRef} position={[0, -y / 2, 0]}>
                <cylinderGeometry args={[0.05, 0.05, y, 8]} />
                <meshBasicMaterial
                    color={color}
                    transparent
                    opacity={0.4}
                />
            </mesh>

            {/* Glow effect at base */}
            <mesh position={[0, -y, 0]}>
                <sphereGeometry args={[0.3, 16, 16]} />
                <meshBasicMaterial
                    color={color}
                    transparent
                    opacity={0.6}
                />
            </mesh>
        </group>
    );
}

/**
 * Calculate Y position based on distance
 * Closer items appear lower (near horizon), distant items appear higher
 */
function getYPositionFromDistance(distanceMeters: number): number {
    // Map distance to Y position
    // < 1km: y = 0-2 (horizon level)
    // 1-10km: y = 2-8
    // 10-50km: y = 8-15

    if (distanceMeters < 1000) {
        // Very close: 0-2
        return (distanceMeters / 1000) * 2;
    } else if (distanceMeters < 10000) {
        // Medium distance: 2-8
        return 2 + ((distanceMeters - 1000) / 9000) * 6;
    } else {
        // Far distance: 8-15
        return 8 + Math.min(((distanceMeters - 10000) / 40000) * 7, 7);
    }
}

/**
 * Format distance for display
 */
function formatDistance(meters: number): string {
    if (meters < 1000) {
        return `${Math.round(meters)}m`;
    } else if (meters < 10000) {
        return `${(meters / 1000).toFixed(1)}km`;
    } else {
        return `${Math.round(meters / 1000)}km`;
    }
}
