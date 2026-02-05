import { useState } from 'react';
import NavigationHUD from './components/NavigationHUD';
import { Navigation, MapPin } from 'lucide-react';
import './index.css';

function App() {
    const [isNavigating, setIsNavigating] = useState(false);

    if (isNavigating) {
        return (
            <NavigationHUD
                direction="forward"
                distance={150}
                message="Continue straight ahead"
            />
        );
    }

    return (
        <div className="relative w-full h-full bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-6">
            {/* Background pattern */}
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PHBhdGggZD0iTTM2IDE0aDRWNGgtNHYxMHptMCA0MGg0VjQ0aC00djEwem0tMzYgMGg0VjQ0SDR2MTB6TTQgNGg0djEwSDRWNHoiLz48L2c+PC9nPjwvc3ZnPg==')] opacity-30" />

            <div className="relative z-10 max-w-2xl w-full">
                {/* Logo/Header */}
                <div className="text-center mb-12">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-dira-primary to-dira-secondary rounded-3xl mb-6 shadow-2xl shadow-dira-primary/20">
                        <Navigation className="w-10 h-10 text-white" />
                    </div>
                    <h1 className="text-5xl font-bold text-white mb-3 bg-clip-text text-transparent bg-gradient-to-r from-dira-primary via-white to-dira-secondary">
                        Dira
                    </h1>
                    <p className="text-xl text-gray-300">Digital Pathfinder</p>
                    <p className="text-sm text-gray-400 mt-2">AR Navigation for the Modern World</p>
                </div>

                {/* Welcome Card */}
                <div className="glass-dark rounded-3xl p-8 mb-6 shadow-2xl">
                    <h2 className="text-2xl font-semibold text-white mb-4">Welcome to Dira</h2>
                    <p className="text-gray-300 mb-6 leading-relaxed">
                        Experience the future of navigation with augmented reality.
                        Dira uses your device's camera, GPS, and compass to overlay
                        real-time directions onto the world around you.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                            <MapPin className="w-8 h-8 text-dira-primary mb-2" />
                            <h3 className="font-semibold text-white mb-1">Real-time Tracking</h3>
                            <p className="text-sm text-gray-400">
                                Precise GPS positioning with PostGIS spatial queries
                            </p>
                        </div>
                        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                            <Navigation className="w-8 h-8 text-dira-secondary mb-2" />
                            <h3 className="font-semibold text-white mb-1">AR Overlays</h3>
                            <p className="text-sm text-gray-400">
                                3D directional arrows seamlessly integrated with your view
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={() => setIsNavigating(true)}
                        className="w-full bg-gradient-to-r from-dira-primary to-dira-secondary hover:from-dira-primary/90 hover:to-dira-secondary/90 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-300 shadow-lg shadow-dira-primary/30 hover:shadow-xl hover:shadow-dira-primary/40 transform hover:scale-[1.02]"
                    >
                        Start Navigation
                    </button>
                </div>

                {/* Info text */}
                <p className="text-center text-sm text-gray-500">
                    Camera and location permissions required • Best experienced outdoors
                </p>
            </div>
        </div>
    );
}

export default App;
