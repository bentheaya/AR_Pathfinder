// GPS and Compass metadata types
export interface LocationData {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude: number | null;
    altitudeAccuracy: number | null;
    heading: number | null;
    speed: number | null;
}

export interface CompassData {
    heading: number;
    accuracy: number;
}

export interface FrameData {
    image: string; // base64 encoded image
    location: LocationData;
    compass: CompassData;
    timestamp: number;
}

export interface NavigationInstruction {
    direction: 'forward' | 'left' | 'right' | 'turn-around';
    distance: number;
    message: string;
}

export interface AnalyzeFrameResponse {
    instructions: NavigationInstruction[];
    confidence: number;
    landmarks: string[];
}
