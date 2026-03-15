import { useState } from 'react';
import NavigationHUD from './components/NavigationHUD';
import { Navigation, MapPin } from 'lucide-react';
import './index.css';

function App() {
    const [isNavigating, setIsNavigating] = useState(false);

    if (isNavigating) {
        return (
            <NavigationHUD onBack={() => setIsNavigating(false)} />
        );
    }

    return (
        <div className="relative w-full h-full bg-dira-bg flex items-center justify-center p-6 overflow-hidden">
            {/* Background pattern & scanline */}
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDE0aDRWNGgtNHYxMHptMCA0MGg0VjQ0aC00djEwem0tMzYgMGg0VjQ0SDR2MTB6TTQgNGg0djEwSDRWNHoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-20" />
            <div className="scanline" />

            <div className="relative z-10 max-w-2xl w-full animate-fade-in">
                {/* Logo/Header */}
                <div className="text-center mb-12 flex flex-col items-center">
                    <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-dira-primary to-dira-secondary rounded-[2.5rem] mb-8 shadow-2xl shadow-dira-primary/20 transform hover:rotate-6 transition-transform">
                        <Navigation className="w-12 h-12 text-white" />
                    </div>
                    <h1 className="text-6xl font-black text-white mb-2 bg-clip-text text-transparent bg-gradient-to-b from-white to-white/40 tracking-tighter">
                        DIRA
                    </h1>
                    <div className="h-1 w-12 bg-dira-primary rounded-full mb-4 shadow-[0_0_10px_#00d9ff]" />
                    <p className="text-xl text-gray-400 uppercase tracking-[0.3em] font-light">Digital Pathfinder</p>
                </div>

                {/* Welcome Card */}
                <div className="glass-dark rounded-[3rem] p-10 mb-8 border-white/5 shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-dira-primary/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-dira-primary/10 transition-colors" />
                    
                    <h2 className="text-2xl font-bold text-white mb-4">Neural Navigation System</h2>
                    <p className="text-gray-400 mb-8 leading-relaxed">
                        Experience precision spatial navigation powered by AR and Gemini AI. 
                        Dira interprets your physical environment in real-time to provide 
                        seamless, contextual guidance.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                        <div className="glass-light rounded-2xl p-5 hover:bg-white/[0.08] transition-colors border-white/5">
                            <MapPin className="w-8 h-8 text-dira-primary mb-3" />
                            <h3 className="font-bold text-white mb-1">Spatial Awareness</h3>
                            <p className="text-xs text-gray-400 leading-tight">
                                Hyper-local GPS tracking & PostGIS integration
                            </p>
                        </div>
                        <div className="glass-light rounded-2xl p-5 hover:bg-white/[0.08] transition-colors border-white/5">
                            <Navigation className="w-8 h-8 text-dira-secondary mb-3" />
                            <h3 className="font-bold text-white mb-1">AI Context</h3>
                            <p className="text-xs text-gray-400 leading-tight">
                                Neural scene analysis with Gemini 1.5-Flash
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={() => setIsNavigating(true)}
                        className="btn-dira w-full text-lg py-5 shadow-dira-primary/20"
                    >
                        Initialize Neural Link
                    </button>
                </div>

                {/* Info text */}
                <div className="flex justify-center gap-6 text-[10px] text-gray-600 font-bold uppercase tracking-widest">
                    <span>Alpha Build 0.4.1</span>
                    <span>•</span>
                    <span>Systems Operational</span>
                </div>
            </div>
        </div>
    );
}

export default App;
