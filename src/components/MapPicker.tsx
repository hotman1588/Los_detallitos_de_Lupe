import { useEffect, useRef, useState } from 'react';
import { ubicarBarrio } from '../geoBarrios';

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
  // Aviso cuando el barrio no tiene punto exacto y el mapa se centra en la localidad.
  const [geoNotice, setGeoNotice] = useState<string | null>(null);

  // Mapa ampliado a pantalla completa; se minimiza solo al fijar el pin.
  const [isExpanded, setIsExpanded] = useState(false);
  const isExpandedRef = useRef(false);
  const collapseTimerRef = useRef<number | undefined>(undefined);

  const setExpanded = (expanded: boolean) => {
    isExpandedRef.current = expanded;
    setIsExpanded(expanded);
  };

  // Tras fijar el pin con el mapa ampliado, se minimiza dejando ver un instante el punto.
  const collapseAfterPin = () => {
    if (!isExpandedRef.current) return;
    window.clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = window.setTimeout(() => setExpanded(false), 700);
  };

  // Leaflet necesita recalcular su tamaño al cambiar el contenedor; además se
  // bloquea el scroll de la página y se permite cerrar con Escape.
  useEffect(() => {
    const map = mapInstanceRef.current;
    const timer = window.setTimeout(() => {
      if (map) {
        map.invalidateSize();
        if (markerRef.current) map.panTo(markerRef.current.getLatLng());
      }
    }, 80);
    if (!isExpanded) return () => window.clearTimeout(timer);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [isExpanded]);

  useEffect(() => () => window.clearTimeout(collapseTimerRef.current), []);

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
        link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
        link.crossOrigin = '';
        document.head.appendChild(link);
      }

      // Load Leaflet TS/JS
      if (!document.getElementById('leaflet-js-cdn')) {
        const script = document.createElement('script');
        script.id = 'leaflet-js-cdn';
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
        script.crossOrigin = '';
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
        attribution: '&copy; OpenStreetMap'
      }).addTo(map);
      map.attributionControl.setPrefix(false);

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
          collapseAfterPin();
        });

        // Pin dragged event
        marker.on('dragend', () => {
          const position = marker.getLatLng();
          const lat = position.lat;
          const lng = position.lng;
          onChange({ lat, lng }, `Coordenadas ajustadas: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
          collapseAfterPin();
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

  // 4. Al elegir municipio, localidad o barrio el mapa se centra con la tabla de
  //    coordenadas de la app (sin depender de un buscador externo).
  const skipInitialCenterRef = useRef(Boolean(value));
  useEffect(() => {
    if (!leafletLoaded || readOnly) return;
    if (!municipio) return;
    // Si el cliente ya había fijado el pin (p. ej. al volver a este paso), no se mueve al cargar.
    if (skipInitialCenterRef.current) {
      skipInitialCenterRef.current = false;
      return;
    }

    const ubicacion = ubicarBarrio(municipio, localidad, barrio);
    if (!ubicacion) return;

    if (mapInstanceRef.current && markerRef.current) {
      const [lat, lng] = ubicacion.punto;
      markerRef.current.setLatLng([lat, lng]);
      mapInstanceRef.current.setView([lat, lng], ubicacion.precision === 'barrio' ? 17 : ubicacion.precision === 'localidad' ? 15 : 13);
      onChange({ lat, lng }, [barrio, localidad, municipio].filter(Boolean).join(', '));
    }

    setGeoNotice(
      barrio && ubicacion.precision !== 'barrio'
        ? 'No tenemos el punto exacto de este barrio; te ubicamos en su zona. Mueve el pin al lugar de entrega.'
        : null
    );
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

      <div
        className={
          isExpanded
            ? 'fixed inset-0 z-[70] bg-slate-100 flex flex-col'
            : 'relative w-full h-[240px] rounded-2xl overflow-hidden border border-slate-250 shadow-xs bg-slate-100 flex flex-col justify-center items-center'
        }
      >
        {/* Barra superior del mapa ampliado */}
        {isExpanded && (
          <div className="shrink-0 bg-gradient-to-r from-earth-brown to-sage-primary text-white px-4 py-3 flex items-center justify-between gap-3 shadow-md">
            <p className="text-xs font-semibold leading-snug">
              📍 Toca el lugar exacto de entrega o arrastra el pin. El mapa se cerrará al fijarlo.
            </p>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="shrink-0 bg-white/15 hover:bg-white/25 text-white text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer"
            >
              ✕ Cerrar
            </button>
          </div>
        )}

        {/* Botón para ampliar el mapa a pantalla completa */}
        {!isExpanded && !readOnly && leafletLoaded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="absolute top-2 left-12 z-[1000] bg-white/95 hover:bg-white text-sage-primary text-[11px] font-bold px-3 py-1.5 rounded-full shadow-md border border-slate-200 flex items-center gap-1.5 cursor-pointer"
            aria-label="Ampliar mapa a pantalla completa"
          >
            ⛶ Ampliar mapa
          </button>
        )}

        {!leafletLoaded && (
          <div className="text-center p-4 space-y-2">
            <div className="w-8 h-8 rounded-full border-4 border-sage-primary/20 border-t-sage-primary animate-spin mx-auto" />
            <p className="text-xs text-slate-500 font-medium">Cargando mapa interactivo de Bogotá...</p>
          </div>
        )}

        {/* Actual Map Container */}
        <div 
          ref={mapContainerRef} 
          // La clase no debe cambiar: Leaflet agrega las suyas a este div y React las borraría.
          // El tamaño al ampliar se ajusta por estilo.
          className="w-full"
          style={{
            visibility: leafletLoaded ? 'visible' : 'hidden',
            position: leafletLoaded ? 'relative' : 'absolute',
            height: isExpanded ? 'auto' : '100%',
            flex: isExpanded ? '1 1 0%' : undefined,
            minHeight: 0
          }}
        />

        {/* Aviso: barrio sin punto exacto */}
        {geoNotice && !isExpanded && (
          <div className="absolute bottom-2 left-2 right-2 bg-amber-500/95 text-white p-2 rounded-xl shadow-md text-[10px] leading-relaxed z-[1000] border border-amber-600">
            ⚠️ {geoNotice}
          </div>
        )}
      </div>

      {!readOnly && (
        <div className="bg-slate-50 border border-slate-150 p-2.5 rounded-xl text-[10px] text-slate-500 flex items-start gap-1.5 leading-relaxed">
          <span className="text-xs select-none">💡</span>
          <p>
            Al seleccionar tu Municipio, Localidad y Barrio, <strong>el mapa se aproximará de forma automática</strong>. Puedes arrastrar el marcador rojo o hacer clic directamente en la calle exacta para orientar mejor al domiciliario de Los Detallitos de Lupe.
            {value && (
              <span className="block font-mono text-emerald-850 font-bold mt-1">
                📍 Ubicación de entrega marcada ✓
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
