import { useState } from 'react';
import { Search, Loader } from 'lucide-react';

interface CelestialSearchProps {
    onSearch: (query: string) => Promise<void>;
    isSearching: boolean;
}

/**
 * CelestialSearch - Search input for finding POIs and triggering guided pivot.
 * 
 * User types POI name → backend calculates bearing → guided turn experience begins.
 */
export function CelestialSearch({ onSearch, isSearching }: CelestialSearchProps) {
    const [query, setQuery] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (query.trim() && !isSearching) {
            await onSearch(query.trim());
        }
    };

    return (
        <div className="absolute top-4 left-4 right-4 z-30">
            <form onSubmit={handleSubmit} className="glass-dark rounded-2xl p-3 shadow-xl">
                <div className="flex items-center gap-3">
                    <Search className="w-5 h-5 text-cyan-400 flex-shrink-0" />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Where is... (e.g., Maseno University)"
                        className="flex-1 bg-transparent text-white placeholder-gray-400 outline-none text-base"
                        disabled={isSearching}
                    />
                    {isSearching && (
                        <Loader className="w-5 h-5 text-cyan-400 animate-spin flex-shrink-0" />
                    )}
                </div>
            </form>

            {/* Quick search hints */}
            <div className="mt-2 px-3 text-xs text-gray-400">
                Try: "Maseno", "Mount Kenya", "Nairobi"
            </div>
        </div>
    );
}
