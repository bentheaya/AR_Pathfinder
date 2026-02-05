// Shared TypeScript types for frontend and backend communication

export interface LocationData {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude?: number;
    altitudeAccuracy?: number;
    heading?: number;
    speed?: number;
}

export interface CompassData {
    heading: number;
    accuracy: number;
}

export interface FrameAnalysisRequest {
    image: string; // base64 encoded
    latitude: number;
    longitude: number;
    heading: number;
    accuracy?: number;
}

export interface NavigationInstruction {
    direction: 'forward' | 'left' | 'right' | 'turn-around';
    distance: number;
    message: string;
}

export interface FrameAnalysisResponse {
    instructions: NavigationInstruction[];
    confidence: number;
    landmarks: string[];
    session_id?: number;
}

export interface Waypoint {
    id: number;
    name: string;
    description: string;
    latitude: number;
    longitude: number;
    created_at: string;
}
