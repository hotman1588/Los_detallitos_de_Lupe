import { useEffect, useRef, useState } from 'react';

interface MapPickerProps {
  municipio: string;
  localidad: string;
  barrio: string;
  direccionDetallada: string;
  value?: { lat: number; lng: number };
  onChange: (value: { lat: number; lng: number }, description: string) => void;
  readOnly?: boolean;
}

// Default center represents Bogotá Center
const DEFAULT_CENTER = { lat: 4.60971, lng: -74.08175 };

export default function MapPicker({
  municipio,
  localidad,
  barrio,
  direccionDetallada,
  value,
  onChange,
  readOnly = false
}: MapPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null); // Leaflet map instance
  const markerRef = useRef<any>(null); // Leaflet marker instance
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [loadingGeocoding, setLoadingGeocoding] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // 1. Dynamic CDN Loader for Leaflet
  useEffect(() => {
    let active = true;
    const loadLeaflet = async () => {
      if ((window as any).L) {
        if (active) setLeafletLoaded(true);
        return;
      }

      // Load Leaflet CSS
      if (!document.getElementById('leaflet-css-cdn')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css-cdn';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      // Load Leaflet TS/JS
      if (!document.getElementById('leaflet-js-cdn')) {
        const script = document.createElement('script');
        script.id = 'leaflet-js-cdn';
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.async = true;
        script.onload = () => {
          if (active) setLeafletLoaded(true);
        };
        script.onerror = () => {
          console.error('Failed to load Leaflet script from CDN.');
        };
        document.body.appendChild(script);
      } else {
        // Script already added but maybe not fully loaded yet
        const checkL = setInterval(() => {
          if ((window as any).L) {
            clearInterval(checkL);
            if (active) setLeafletLoaded(true);
          }
        }, 100);
        return () => clearInterval(checkL);
      }
    };

    loadLeaflet();
    return () => {
      active = false;
    };
  }, []);

  // 2. Map Initialization
  useEffect(() => {
    if (!leafletLoaded || !mapContainerRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    const initialCenter = value || DEFAULT_CENTER;

    if (!mapInstanceRef.current) {
      // Create new Leaflet Map instance
      const map = L.map(mapContainerRef.current, {
        zoomControl: !readOnly,
        dragging: !readOnly,
        scrollWheelZoom: !readOnly,
        doubleClickZoom: !readOnly,
        touchZoom: !readOnly,
      }).setView([initialCenter.lat, initialCenter.lng], 15);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      // Create draggable marker
      const marker = L.marker([initialCenter.lat, initialCenter.lng], {
        draggable: !readOnly,
        title: 'Lugar de Entrega'
      }).addTo(map);

      // Add simple popup instructions
      if (!readOnly) {
        marker.bindPopup("<div class='font-sans text-xs font-bold text-slate-800'>📍 ¡Ubicación de Entrega! <br/><span class='font-normal text-slate-500'>Arrastra este pin o haz clic en el mapa para marcar exactamente el lugar de entrega.</span></div>").openPopup();
      } else {
        marker.bindPopup("<div class='font-sans text-xs font-bold text-slate-800'>📍 Punto de Entrega Asignado</div>").openPopup();
      }

      // Click on map to position pin
      if (!readOnly) {
        map.on('click', (e: any) => {
          const { lat, lng } = e.latlng;
          marker.setLatLng([lat, lng]);
          onChange({ lat, lng }, `Ubicación manual: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
        });

        // Pin dragged event
        marker.on('dragend', () => {
          const position = marker.getLatLng();
          const lat = position.lat;
          const lng = position.lng;
          onChange({ lat, lng }, `Coordenadas ajustadas: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
        });
      }

      mapInstanceRef.current = map;
      markerRef.current = marker;
    } else {
      // Map already exists, update size if container resized
      mapInstanceRef.current.invalidateSize();
    }

    return () => {
      // Cleanup on unmount or re-initialization
    };
  }, [leafletLoaded]);

  // 3. Update marker position when internal selection changes
  useEffect(() => {
    if (leafletLoaded && value && mapInstanceRef.current && markerRef.current) {
      const { lat, lng } = value;
      const currentLatLng = markerRef.current.getLatLng();
      if (Math.abs(currentLatLng.lat - lat) > 0.0001 || Math.abs(currentLatLng.lng - lng) > 0.0001) {
        markerRef.current.setLatLng([lat, lng]);
        mapInstanceRef.current.panTo([lat, lng]);
      }
    }
  }, [leafletLoaded, value]);

  // 4. Geocode when physical input fields change "aproximándose a la dirección"
  useEffect(() => {
    if (!leafletLoaded || readOnly) return;
    if (!municipio && !localidad && !barrio) return;

    // Build Nominatim Search Query
    const searchParts: string[] = [];
    if (barrio) searchParts.push(`Barrio ${barrio}`);
    if (localidad) searchParts.push(`Localidad ${localidad}`);
    if (municipio) {
      searchParts.push(municipio);
    } else {
      searchParts.push('Bogotá');
    }
    searchParts.push('Colombia');

    const queryStr = searchParts.join(', ');

    const triggerGeocoding = async () => {
      setLoadingGeocoding(true);
      setGeoError(null);
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(queryStr)}`
        );
        if (!response.ok) throw new Error('Error al conectar con servidor de coordenadas');
        const data = await response.json();
        if (data && data.length > 0) {
          const first = data[0];
          const lat = parseFloat(first.lat);
          const lng = parseFloat(first.lon);
          
          if (mapInstanceRef.current && markerRef.current) {
            markerRef.current.setLatLng([lat, lng]);
            mapInstanceRef.current.setView([lat, lng], 16);
            onChange({ lat, lng }, first.display_name || queryStr);
          }
        }
      } catch (err: any) {
        console.warn('Geocoding search failed, staying at current point', err);
        setGeoError('No se pudo encontrar las coordenadas de este barrio de inmediato. Por favor arrastra el pin manualmente.');
      } finally {
        setLoadingGeocoding(false);
      }
    };

    // Debounce geocoding requests to prevent slamming Nominatim API on inputs
    const timer = setTimeout(() => {
      triggerGeocoding();
    }, 1500);

    return () => clearTimeout(timer);
  }, [leafletLoaded, municipio, localidad, barrio]);

  return (
    <div className="space-y-2 font-sans border border-sage-primary/10 bg-slate-50/45 p-4 rounded-3xl">
      <div className="space-y-1">
        <label className="block text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5 leading-relaxed">
          📍 Selecciona el punto o ubicación para donde va el pedido
        </label>
        <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
          El mapa se aproximará automáticamente de acuerdo a los campos de Municipio, Localidad o Barrio diligenciados para direccionar adecuadamente al domiciliario. Arrastra el marcador rojo para fijar el sitio exacto de llegada.
        </p>
      </div>

      <div className="relative w-full h-[240px] rounded-2xl overflow-hidden border border-slate-250 shadow-xs bg-slate-100 flex flex-col justify-center items-center">
        {!leafletLoaded && (
          <div className="text-center p-4 space-y-2">
            <div className="w-8 h-8 rounded-full border-4 border-sage-primary/20 border-t-sage-primary animate-spin mx-auto" />
            <p className="text-xs text-slate-500 font-medium">Cargando mapa interactivo de Bogotá...</p>
          </div>
        )}

        {/* Actual Map Container */}
        <div 
          ref={mapContainerRef} 
          className="w-full h-full" 
          style={{ visibility: leafletLoaded ? 'visible' : 'hidden', position: leafletLoaded ? 'relative' : 'absolute' }}
        />

        {/* Loading Overlay */}
        {loadingGeocoding && (
          <div className="absolute top-2 right-2 bg-white/95 backdrop-blur-xs px-3 py-1.5 rounded-full shadow-md text-[10px] font-bold text-sage-primary border border-slate-100 flex items-center gap-1.5 animate-pulse z-[1000]">
            <span className="w-1.5 h-1.5 rounded-full bg-sage-primary animate-ping" />
            Buscando Barrio...
          </div>
        )}

        {/* Error Notification */}
        {geoError && !loadingGeocoding && (
          <div className="absolute bottom-2 left-2 right-2 bg-amber-500/95 text-white p-2 rounded-xl shadow-md text-[10px] leading-relaxed z-[1000] border border-amber-600">
            ⚠️ {geoError}
          </div>
        )}
      </div>

      {!readOnly && (
        <div className="bg-slate-50 border border-slate-150 p-2.5 rounded-xl text-[10px] text-slate-500 flex items-start gap-1.5 leading-relaxed">
          <span className="text-xs select-none">💡</span>
          <p>
            Al seleccionar tu Municipio, Localidad y Barrio, **el mapa se aproximará de forma automática**. Puedes arrastrar el marcador rojo o hacer clic directamente en la calle exacta para orientar mejor al domiciliario de Los Detallitos de Lupe.
            {value && (
              <span className="block font-mono text-emerald-850 font-bold mt-1">
                📍 Pinned: Lat: {value.lat.toFixed(5)}, Lng: {value.lng.toFixed(5)}
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
