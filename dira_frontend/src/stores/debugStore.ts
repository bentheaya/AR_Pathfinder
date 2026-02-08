import { create } from 'zustand';

export interface LogEntry {
    id: string;
    source: 'SYSTEM' | 'GEMINI' | 'SENSOR' | 'USER';
    message: string;
    timestamp: string;
    type: 'info' | 'success' | 'warning' | 'error';
}

interface SensorData {
    compassHeading: number;
    pitch: number;
    roll: number;
    gpsAccuracy: number;
}

interface GeminiStats {
    thoughtSignature: string;
    reasoningLatency: number;
    thinkingLevel: 'LOW' | 'HIGH';
    tokenEfficiency: { input: number; output: number };
}

interface ImageStats {
    compressionRatio: string;
    resolution: 'Low' | 'Medium' | 'High';
    originalSize: number;
    compressedSize: number;
}

interface DebugState {
    // UI State
    isOpen: boolean;
    toggleOpen: () => void;

    // Controls
    showAnchors: boolean;
    isFrozen: boolean;
    forceOffline: boolean;
    toggleShowAnchors: () => void;
    toggleFreeze: () => void;
    toggleForceOffline: () => void;

    // Real-time Data
    sensorData: SensorData;
    geminiStats: GeminiStats;
    imageStats: ImageStats;
    postGisQueryTime: number;

    // Logging
    thoughtLog: LogEntry[];

    // Adaptive Mode Stats
    environmentMode: string;
    solarPhase: string;
    ambientLux: number;
    networkSpeed: string;
    frameIntervalMs: number;
    bandwidthSavings: number;

    // Actions
    updateSensorData: (data: Partial<SensorData>) => void;
    updateGeminiStats: (data: Partial<GeminiStats>) => void;
    updateImageStats: (data: Partial<ImageStats>) => void;
    setPostGisQueryTime: (time: number) => void;
    updateAdaptiveStats: (stats: Partial<{
        environmentMode: string;
        solarPhase: string;
        ambientLux: number;
        networkSpeed: string;
        frameIntervalMs: number;
        bandwidthSavings: number;
    }>) => void;
    addLog: (source: LogEntry['source'], message: string, type?: LogEntry['type']) => void;
    clearLogs: () => void;
}

export const useDebugStore = create<DebugState>((set) => ({
    // UI Defaults
    isOpen: false,
    toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),

    // Control Defaults
    showAnchors: true,
    isFrozen: false,
    forceOffline: false,

    toggleShowAnchors: () => set((state) => ({ showAnchors: !state.showAnchors })),
    toggleFreeze: () => set((state) => ({ isFrozen: !state.isFrozen })),
    toggleForceOffline: () => set((state) => ({ forceOffline: !state.forceOffline })),

    // Data Defaults
    sensorData: {
        compassHeading: 0,
        pitch: 0,
        roll: 0,
        gpsAccuracy: 0,
    },

    geminiStats: {
        thoughtSignature: 'Waiting...',
        reasoningLatency: 0,
        thinkingLevel: 'LOW',
        tokenEfficiency: { input: 0, output: 0 },
    },

    imageStats: {
        compressionRatio: '0%',
        resolution: 'Medium',
        originalSize: 0,
        compressedSize: 0,
    },

    postGisQueryTime: 0,

    thoughtLog: [],

    // Adaptive Mode Defaults
    environmentMode: 'Detecting...',
    solarPhase: 'Calculating...',
    ambientLux: 0,
    networkSpeed: 'Unknown',
    frameIntervalMs: 3000,
    bandwidthSavings: 0,

    // Actions
    updateSensorData: (data) => set((state) => ({
        sensorData: { ...state.sensorData, ...data }
    })),

    updateGeminiStats: (data) => set((state) => ({
        geminiStats: { ...state.geminiStats, ...data }
    })),

    updateImageStats: (data) => set((state) => ({
        imageStats: { ...state.imageStats, ...data }
    })),

    setPostGisQueryTime: (time) => set({ postGisQueryTime: time }),

    updateAdaptiveStats: (stats) => set((state) => ({
        environmentMode: stats.environmentMode ?? state.environmentMode,
        solarPhase: stats.solarPhase ?? state.solarPhase,
        ambientLux: stats.ambientLux ?? state.ambientLux,
        networkSpeed: stats.networkSpeed ?? state.networkSpeed,
        frameIntervalMs: stats.frameIntervalMs ?? state.frameIntervalMs,
        bandwidthSavings: stats.bandwidthSavings ?? state.bandwidthSavings,
    })),

    addLog: (source, message, type = 'info') => set((state) => {
        const newEntry: LogEntry = {
            id: Math.random().toString(36).substr(2, 9),
            source,
            message,
            timestamp: new Date().toLocaleTimeString(),
            type
        };

        // Keep log size manageable (max 100 entries)
        const newLog = [newEntry, ...state.thoughtLog].slice(0, 100);
        return { thoughtLog: newLog };
    }),

    clearLogs: () => set({ thoughtLog: [] }),
}));
