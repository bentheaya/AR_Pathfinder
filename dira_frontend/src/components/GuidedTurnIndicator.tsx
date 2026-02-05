import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';

interface GuidedTurnProps {
    userHeading: number;
    targetBearing: number;
    onAligned: () => void;
    guidanceText: string;
}

/**
 * GuidedTurnIndicator - Shows animated turn direction until aligned.
 * 
 * Displays:
 * - Animated arrows (left/right) indicating turn direction
 * - Degrees remaining to turn
 * - Gemini 3 voice guidance text
 * - Green checkmark when aligned (±5°)
 */
export function GuidedTurnIndicator({
    userHeading,
    targetBearing,
    onAligned,
    guidanceText
}: GuidedTurnProps) {
    const [headingDiff, setHeadingDiff] = useState(0);
    const [isAligned, setIsAligned] = useState(false);

    useEffect(() => {
        // Calculate heading difference (-180 to 180)
        let diff = (targetBearing - userHeading + 360) % 360;
        if (diff > 180) diff = diff - 360;

        setHeadingDiff(diff);

        // Check if aligned (within ±5°)
        const aligned = Math.abs(diff) < 5;
        setIsAligned(aligned);

        if (aligned) {
            onAligned();
        }
    }, [userHeading, targetBearing, onAligned]);

    const turnDirection = headingDiff > 0 ? 'left' : 'right';
    const turnAmount = Math.abs(headingDiff);

    return (
        <div className="absolute bottom-32 left-0 right-0 z-20 px-4">
            <div className="glass-dark rounded-2xl p-6 max-w-md mx-auto text-center">
                {/* Animated Turn Indicator */}
                <div className="flex items-center justify-center gap-4 mb-4">
                    {!isAligned && (
                        <>
                            {turnDirection === 'left' && (
                                <div className="animate-pulse">
                                    <ChevronLeft className="w-16 h-16 text-cyan-400" strokeWidth={3} />
                                </div>
                            )}

                            <div className="text-4xl font-bold text-white">
                                {turnAmount.toFixed(0)}°
                            </div>

                            {turnDirection === 'right' && (
                                <div className="animate-pulse">
                                    <ChevronRight className="w-16 h-16 text-cyan-400" strokeWidth={3} />
                                </div>
                            )}
                        </>
                    )}

                    {isAligned && (
                        <div className="animate-bounce">
                            <Check className="w-16 h-16 text-green-400" strokeWidth={3} />
                        </div>
                    )}
                </div>

                {/* Gemini 3 Voice Guidance */}
                <p className="text-lg text-gray-200 font-medium">
                    {guidanceText}
                </p>

                {/* Progress indicator */}
                {!isAligned && (
                    <div className="mt-4 text-sm text-gray-400">
                        Turn {turnDirection} • {turnAmount.toFixed(0)}° remaining
                    </div>
                )}
            </div>
        </div>
    );
}
