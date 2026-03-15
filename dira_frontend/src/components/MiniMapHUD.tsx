import React, { useEffect, useState } from 'react';

interface POI {
  id: string;
  name: string;
  lat: number;
  lon: number;
  category: string;
}

interface MiniMapHUDProps {
  currentLat: number;
  currentLon: number;
  currentHeading: number;
  apiBaseUrl: string;
}

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

/**
 * GTA-style circular Mini-Map HUD.
 * Rotates based on user heading and shows nearby Google Maps POIs.
 */
const MiniMapHUD: React.FC<MiniMapHUDProps> = ({ currentLat, currentLon, currentHeading, apiBaseUrl }) => {
  const [pois, setPois] = useState<POI[]>([]);

  useEffect(() => {
    const fetchPOIs = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/v1/poi-nearby/?lat=${currentLat}&lon=${currentLon}&radius=1000`);
        const data = await response.json();
        if (data.results) {
          setPois(data.results);
        }
      } catch (error) {
        console.error("Error fetching POIs for minimap:", error);
      }
    };

    // Initial fetch
    fetchPOIs();
    // Update POIs every 30 seconds
    const interval = setInterval(fetchPOIs, 30000);
    return () => clearInterval(interval);
  }, [currentLat, currentLon, apiBaseUrl]);

  // Map visual settings
  const mapSize = 130; // HUD diameter in pixels
  const center = mapSize / 2;
  const zoomFactor = 0.15; // POI zoom factor

  // Google Static Map URL (Dark Mode Styling)
  // We use a slightly larger size to avoid edges during rotation if needed, 
  // but for a circle clip, 200x200 is plenty.
  const staticMapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${currentLat},${currentLon}&zoom=17&size=200x200&maptype=roadmap&style=element:geometry%7Ccolor:0x212121&style=element:labels.icon%7Cvisibility:off&style=element:labels.text.fill%7Ccolor:0x757575&style=element:labels.text.stroke%7Ccolor:0x212121&style=feature:administrative%7Celement:geometry%7Ccolor:0x757575&style=feature:administrative.country%7Celement:labels.text.fill%7Ccolor:0x9e9e9e&style=feature:administrative.land_parcel%7Cvisibility:off&style=feature:administrative.locality%7Celement:labels.text.fill%7Ccolor:0xbdbdbd&style=feature:poi%7Celement:labels.text.fill%7Ccolor:0x757575&style=feature:poi.park%7Celement:geometry%7Ccolor:0x181818&style=feature:poi.park%7Celement:labels.text.fill%7Ccolor:0x616161&style=feature:road%7Celement:geometry.fill%7Ccolor:0x2c2c2c&style=feature:road%7Celement:labels.text.fill%7Ccolor:0x8a8a8a&style=feature:road.arterial%7Celement:geometry%7Ccolor:0x373737&style=feature:road.highway%7Celement:geometry%7Ccolor:0x3c3c3c&style=feature:road.highway.controlled_access%7Celement:geometry%7Ccolor:0x4e4e4e&style=feature:road.local%7Celement:labels.text.fill%7Ccolor:0x616161&style=feature:transit%7Celement:labels.text.fill%7Ccolor:0x757575&style=feature:water%7Celement:geometry%7Ccolor:0x000000&style=feature:water%7Celement:labels.text.fill%7Ccolor:0x3d3d3d&key=${GOOGLE_MAPS_API_KEY}`;

  return (
    <div className="absolute bottom-6 left-6 z-40 group pointer-events-none">
      {/* Background & Frame */}
      <div 
        className="relative rounded-full glass-dark overflow-hidden pointer-events-auto shadow-[0_0_40px_rgba(0,0,0,0.8)]"
        style={{ 
          width: mapSize, 
          height: mapSize, 
        }}
      >
        {/* Grid lines (static for aesthetic) */}
        <div className="absolute inset-0 opacity-20 z-10 pointer-events-none">
           <div className="absolute top-1/2 left-0 right-0 h-[0.5px] bg-white/30" />
           <div className="absolute left-1/2 top-0 bottom-0 w-[0.5px] bg-white/30" />
           <div className="absolute inset-0 border border-white/20 rounded-full scale-75" />
           <div className="absolute inset-0 border border-white/10 rounded-full scale-50" />
        </div>

        {/* Rotating map layer */}
        <div 
          className="absolute inset-0 transition-transform duration-300 ease-out"
          style={{ 
            transform: `rotate(${-currentHeading}deg)`,
            width: mapSize,
            height: mapSize
          }}
        >
          {/* Static Map Background Overlay */}
          <div 
            className="absolute inset-[-40px] opacity-60 grayscale brightness-75 contrast-125"
            style={{ 
              backgroundImage: `url(${staticMapUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}
          />

          {pois.map((poi) => {
            // Calculate relative position (approximate Mercator)
            const dLat = poi.lat - currentLat;
            const dLon = poi.lon - currentLon;
            
            // 1 degree latitude ~= 111320 meters
            // We scale based on map size and zoom
            const y = -dLat * 111320 * zoomFactor; 
            const x = dLon * 111320 * Math.cos(currentLat * Math.PI / 180) * zoomFactor;
            
            // Hide if outside map circle (with small buffer)
            const dist = Math.sqrt(x*x + y*y);
            if (dist > (mapSize / 2)) return null;

            return (
              <div 
                key={poi.id}
                className="absolute w-[8px] h-[8px] rounded-full bg-[#00f2fe] border border-white shadow-[0_0_10px_#00f2fe] z-20"
                style={{ 
                  left: center + x - 4,
                  top: center + y - 4,
                }}
              />
            );
          })}
        </div>

        {/* Static center (User Marker) */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30">
          <div className="relative">
             <div className="w-4 h-4 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.8)] border-2 border-dira-primary" />
             {/* Direction wedge (points Up in HUD) */}
             <div className="absolute -top-[16px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[10px] border-b-white filter drop-shadow(0 0 4px rgba(255,255,255,0.8))" />
          </div>
        </div>

        {/* Scanline Effect */}
        <div className="scanline rounded-full" />

        {/* Compass labels around outer ring */}
        <div className="absolute inset-0 opacity-60 z-30 pointer-events-none">
           <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] font-black text-white/80">N</span>
           <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-black text-white/80">S</span>
           <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] font-black text-white/80">W</span>
           <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] font-black text-white/80">E</span>
        </div>
      </div>

      {/* Speed icon/tag (purely aesthetic for that premium feel) */}
      <div className="mt-2 flex items-center justify-center">
         <div className="px-2 py-0.5 rounded-full bg-black/40 border border-white/10 text-[8px] font-mono text-white/50 tracking-widest uppercase">
            Radar Active • {pois.length} Locations
         </div>
      </div>
    </div>
  );
};

export default MiniMapHUD;
