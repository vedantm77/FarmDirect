'use client';

import { useEffect, useRef } from 'react';

export interface RouteStop {
  name: string;
  lat: number;
  lng: number;
  action?: string;
  isBuyer?: boolean;
}

interface RouteMapProps {
  currentStage?: string;
  activeStops?: number[];
  height?: number | string;
  stops?: RouteStop[];
}

const defaultStops: RouteStop[] = [
  { name: 'Khed Farmer Group', lat: 18.738, lng: 73.846, action: 'Pickup 420 kg · ₹27/kg' },
  { name: 'Junnar Collective', lat: 19.208, lng: 73.875, action: 'Pickup 250 kg · ₹25/kg' },
  { name: 'Baramati FPO', lat: 18.151, lng: 74.578, action: 'Pickup 330 kg · ₹26/kg' },
  { name: 'Pune Institutional Buyer', lat: 18.5204, lng: 73.8567, action: 'Final Delivery Hub', isBuyer: true }
];

export default function RouteMap({ height = 280, stops = defaultStops }: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  const activeRouteStops = stops && stops.length > 0 ? stops : defaultStops;

  useEffect(() => {
    let isMounted = true;

    async function initMap() {
      if (!containerRef.current || mapInstanceRef.current) return;

      const L = (await import('leaflet')).default;

      // Ensure leaflet CSS is present
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      if (!isMounted || !containerRef.current) return;

      const buyerStop = activeRouteStops.find(s => s.isBuyer) || activeRouteStops[activeRouteStops.length - 1];
      const initialCenter: [number, number] = [buyerStop.lat, buyerStop.lng];

      const map = L.map(containerRef.current, {
        center: initialCenter,
        zoom: 9,
        scrollWheelZoom: false
      });
      mapInstanceRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18
      }).addTo(map);

      const createIcon = (bg: string, text: string) => {
        return L.divIcon({
          className: 'custom-map-icon',
          html: `<div style="background:${bg};color:#fff;font-weight:700;font-size:11px;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.35);border:2px solid #fff;">${text}</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
          popupAnchor: [0, -14]
        });
      };

      const latLngPoints: [number, number][] = [];

      activeRouteStops.forEach((stop, idx) => {
        const pos: [number, number] = [stop.lat, stop.lng];
        latLngPoints.push(pos);

        const isLast = idx === activeRouteStops.length - 1;
        const isDestination = stop.isBuyer || isLast;
        const iconColor = isDestination ? '#10b981' : '#2563eb';
        const labelText = isDestination ? '🏢' : String(idx + 1);

        L.marker(pos, { icon: createIcon(iconColor, labelText) })
          .addTo(map)
          .bindPopup(`<b>${stop.name}</b><br/>${stop.action || (isDestination ? 'Delivery Destination' : 'Farm Pickup')}`);
      });

      if (latLngPoints.length > 1) {
        L.polyline(latLngPoints, {
          color: '#059669',
          weight: 3.5,
          opacity: 0.8,
          dashArray: '6, 8'
        }).addTo(map);

        const bounds = L.latLngBounds(latLngPoints);
        map.fitBounds(bounds, { padding: [30, 30] });
      }
    }

    initMap();

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [activeRouteStops]);

  return (
    <div style={{ width: '100%', position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line)' }}>
      <div ref={containerRef} style={{ height, width: '100%' }} />
      <div style={{
        position: 'absolute',
        bottom: 8,
        left: 8,
        background: 'rgba(255,255,255,0.95)',
        padding: '5px 10px',
        borderRadius: 6,
        fontSize: '11px',
        color: '#1f2937',
        zIndex: 1000,
        boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
        fontWeight: 500
      }}>
        📍 <strong>Multi-Stop Route:</strong>{' '}
        {activeRouteStops.map((s, i) => `${s.name.split(' ')[0]} (${s.action ? s.action.split('·')[0].trim() : (s.isBuyer ? 'Dest' : 'Pickup')})`).join(' → ')}
      </div>
    </div>
  );
}
