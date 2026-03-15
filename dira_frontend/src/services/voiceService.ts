/**
 * Voice Service for Dira Navigation
 * Handles Speech-to-Text (STT) via Web Speech API and Text-to-Speech (TTS).
 * Gemini can speak at will - call `speak()` from anywhere at any time.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const STT_SUPPORTED =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

const TTS_SUPPORTED =
    typeof window !== 'undefined' && 'speechSynthesis' in window;

// --- Text-to-Speech (TTS) ---

/**
 * Make Gemini speak. Can be called at any time from any component.
 * Automatically cancels any ongoing speech so Gemini is always heard.
 */
export function speak(text: string, rate = 0.92, pitch = 1.05): void {
    if (!TTS_SUPPORTED || !text) return;

    // Cancel any ongoing speech immediately so Gemini is never interrupted by itself
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.lang = 'en-US';

    // Prefer a natural-sounding voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v =>
        v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha')
    );
    if (preferred) utterance.voice = preferred;

    window.speechSynthesis.speak(utterance);
}

/**
 * Stop any currently speaking voice.
 */
export function stopSpeaking(): void {
    if (TTS_SUPPORTED) window.speechSynthesis.cancel();
}

// --- Speech-to-Text (STT) ---

export type STTResult = {
    transcript: string;
    confidence: number;
};

export type STTCallbacks = {
    onResult: (result: STTResult) => void;
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (error: string) => void;
};

let recognition: any = null;
let isListening = false;

function createRecognition(): any | null {
    if (!STT_SUPPORTED) return null;

    const SpeechRecognitionClass =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    const rec = new SpeechRecognitionClass();
    rec.lang = 'en-US';
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    return rec;
}

/**
 * Start listening for user voice input via microphone (push-to-talk).
 * Triggers callbacks on result, start, end, or error.
 */
export function startListening(callbacks: STTCallbacks): boolean {
    if (isListening || !STT_SUPPORTED) {
        callbacks.onError?.('Speech recognition not available or already active');
        return false;
    }

    recognition = createRecognition();
    if (!recognition) {
        callbacks.onError?.('Could not create speech recognition instance');
        return false;
    }

    recognition.onstart = () => {
        isListening = true;
        callbacks.onStart?.();
    };

    recognition.onresult = (event: any) => {
        const result = event.results[0][0];
        callbacks.onResult({
            transcript: result.transcript as string,
            confidence: result.confidence as number,
        });
    };

    recognition.onend = () => {
        isListening = false;
        callbacks.onEnd?.();
    };

    recognition.onerror = (event: any) => {
        isListening = false;
        callbacks.onError?.(event.error as string);
    };

    recognition.start();
    return true;
}

/**
 * Stop listening immediately.
 */
export function stopListening(): void {
    if (recognition && isListening) {
        recognition.stop();
        recognition = null;
    }
    isListening = false;
}

export function getIsListening(): boolean {
    return isListening;
}

export const voiceService = {
    speak,
    stopSpeaking,
    startListening,
    stopListening,
    getIsListening,
    STT_SUPPORTED,
    TTS_SUPPORTED,
};
