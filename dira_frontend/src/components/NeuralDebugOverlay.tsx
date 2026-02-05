import { useEffect, useRef } from 'react';
import {
    Activity,
    Brain,
    Cpu,
    Eye,
    Layers,
    Pause,
    Play,
    Satellite,
    Terminal,
    Wifi,
    WifiOff,
    X
} from 'lucide-react';
import { useDebugStore, LogEntry } from '../stores/debugStore';

export default function NeuralDebugOverlay() {
    const store = useDebugStore();
    const logContainerRef = useRef<HTMLDivElement>(null);

    // Auto-scroll log
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [store.thoughtLog]);

    if (!store.isOpen) return null;

    return (
        <div className="fixed top-20 right-4 w-96 bg-black/90 text-green-500 font-mono border border-green-500/30 rounded-lg shadow-2xl backdrop-blur-md z-50 flex flex-col max-h-[85vh] overflow-hidden text-xs">

            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-green-500/30 bg-green-900/10">
                <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 animate-pulse fill-green-500/20" />
                    <span className="font-bold tracking-wider">NEURAL LINK V1.0</span>
                    <span className="text-[10px] bg-green-500/20 px-1 rounded animate-pulse">Running</span>
                </div>
                <button
                    onClick={store.toggleOpen}
                    className="hover:text-white transition-colors p-1"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-4">

                {/* Gemini Core Stats */}
                <section>
                    <div className="flex items-center gap-2 mb-2 text-green-400/70 border-b border-green-500/20 pb-1">
                        <Cpu className="w-3 h-3" />
                        <span className="font-bold uppercase">Gemini Core</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <StatRow label="Signature" value={store.geminiStats.thoughtSignature} />
                        <StatRow label="Latency" value={`${store.geminiStats.reasoningLatency} ms`} />
                        <StatRow label="Mode" value={store.geminiStats.thinkingLevel} className="text-amber-400" />
                        <StatRow
                            label="Efficiency"
                            value={`${store.geminiStats.tokenEfficiency.input}/${store.geminiStats.tokenEfficiency.output}`}
                        />
                    </div >
                </section >

                {/* Sensor Fusion */}
                < section >
                    <div className="flex items-center gap-2 mb-2 text-green-400/70 border-b border-green-500/20 pb-1">
                        <Satellite className="w-3 h-3" />
                        <span className="font-bold uppercase">Sensor Fusion</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <StatRow label="Heading" value={`${store.sensorData.compassHeading.toFixed(1)}°`} />
                        <StatRow label="GPS Acc" value={`±${store.sensorData.gpsAccuracy.toFixed(1)}m`} />
                        <StatRow label="Pitch/Roll" value={`${store.sensorData.pitch.toFixed(0)}° / ${store.sensorData.roll.toFixed(0)}°`} />
                        <StatRow label="PostGIS" value={`${store.postGisQueryTime}ms`} />
                    </div>
                </section >

                {/* Image Pipeline */}
                < section >
                    <div className="flex items-center gap-2 mb-2 text-green-400/70 border-b border-green-500/20 pb-1">
                        <Eye className="w-3 h-3" />
                        <span className="font-bold uppercase">Visual Cortex</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <StatRow label="Resolution" value={store.imageStats.resolution} />
                        <StatRow label="Compression" value={store.imageStats.compressionRatio} />
                        <StatRow
                            label="Size"
                            value={`${(store.imageStats.originalSize / 1024).toFixed(0)}KB → ${(store.imageStats.compressedSize / 1024).toFixed(0)}KB`}
                            className="col-span-2"
                        />
                    </div>
                </section >

                {/* Manual Overrides */}
                < section >
                    <div className="flex items-center gap-2 mb-2 text-green-400/70 border-b border-green-500/20 pb-1">
                        <Activity className="w-3 h-3" />
                        <span className="font-bold uppercase">Overrides</span>
                    </div>
                    <div className="flex gap-2">
                        <ToggleBtn
                            active={store.showAnchors}
                            onClick={store.toggleShowAnchors}
                            icon={<Layers className="w-3 h-3" />}
                            label="AR Anchors"
                        />
                        <ToggleBtn
                            active={store.isFrozen}
                            onClick={store.toggleFreeze}
                            icon={store.isFrozen ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                            label={store.isFrozen ? "Resume" : "Freeze"}
                            color="amber"
                        />
                        <ToggleBtn
                            active={store.forceOffline}
                            onClick={store.toggleForceOffline}
                            icon={store.forceOffline ? <WifiOff className="w-3 h-3" /> : <Wifi className="w-3 h-3" />}
                            label="Sim Offline"
                            color="red"
                        />
                    </div>
                </section >
            </div >

            {/* Thought Stream (Terminal) */}
            < div className="bg-black border-t border-green-500/30 p-2 h-40 flex flex-col" >
                <div className="flex items-center gap-2 mb-1 text-[10px] text-green-600">
                    <Terminal className="w-3 h-3" />
                    <span>THOUGHT_STREAM_LOG</span>
                </div>
                <div
                    ref={logContainerRef}
                    className="flex-1 overflow-y-auto font-mono text-[10px] space-y-1 custom-scrollbar"
                >
                    {store.thoughtLog.length === 0 && (
                        <div className="text-green-900 italic">Waiting for neural link...</div>
                    )}
                    {store.thoughtLog.map((log: LogEntry) => (
                        <div key={log.id} className="flex gap-2">
                            <span className="text-green-700 select-none">[{log.timestamp}]</span>
                            <span className={`
                ${log.source === 'GEMINI' ? 'text-amber-400' : ''}
                ${log.source === 'SYSTEM' ? 'text-blue-400' : ''}
                ${log.source === 'SENSOR' ? 'text-purple-400' : ''}
                ${log.type === 'error' ? 'text-red-500 font-bold' : ''}
              `}>
                                <span className="font-bold opacity-70">[{log.source}]:</span> {log.message}
                            </span>
                        </div>
                    ))}
                </div>
            </div >
        </div >
    );
}

// Subcomponents
function StatRow({ label, value, className = "" }: { label: string, value: string | number, className?: string }) {
    return (
        <div className="flex justify-between items-center border-l border-green-500/10 pl-2">
            <span className="text-green-500/60">{label}:</span>
            <span className={`font-medium ${className}`}>{value}</span>
        </div>
    );
}

function ToggleBtn({
    active,
    onClick,
    icon,
    label,
    color = 'green'
}: {
    active: boolean,
    onClick: () => void,
    icon: React.ReactNode,
    label: string,
    color?: 'green' | 'amber' | 'red'
}) {
    const colorClasses = {
        green: active ? "bg-green-500/20 text-green-400 border-green-500/50" : "bg-black text-green-800 border-green-900/30",
        amber: active ? "bg-amber-500/20 text-amber-400 border-amber-500/50" : "bg-black text-green-800 border-green-900/30",
        red: active ? "bg-red-500/20 text-red-400 border-red-500/50" : "bg-black text-green-800 border-green-900/30",
    };

    return (
        <button
            onClick={onClick}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 border rounded transition-all text-[10px] font-medium ${colorClasses[color]}`}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
}
