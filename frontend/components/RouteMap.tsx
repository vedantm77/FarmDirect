'use client';

import { useEffect, useRef } from 'react';

export interface RouteStop {
  name: string;
  lat: number;
  lng: number;
  action?: string;
  isBuyer?: boolean;
  isHub?: boolean;
  isConsumer?: boolean;
  stopType?: 'FARMER' | 'HUB' | 'BUYER' | 'CONSUMER';
  etaMinutes?: number;
  quantityKg?: number;
}

interface RouteMapProps {
  currentStage?: string;
  activeStops?: number[];
  height?: number | string;
  stops?: RouteStop[];
  routeMetrics?: {
    totalDistanceKm?: number;
    baselineDistanceKm?: number;
    distanceSavedKm?: number;
    fuelCostSavedInr?: number;
    optimizationMethod?: string;
  };
}

const defaultStops: RouteStop[] = [
  { name: 'Khed Farmer Group', lat: 18.738, lng: 73.846, action: 'Pickup 420 kg · ₹27/kg', stopType: 'FARMER', quantityKg: 420 },
  { name: 'Junnar Collective', lat: 19.208, lng: 73.875, action: 'Pickup 250 kg · ₹25/kg', stopType: 'FARMER', quantityKg: 250 },
  { name: 'Baramati FPO', lat: 18.151, lng: 74.578, action: 'Pickup 330 kg · ₹26/kg', stopType: 'FARMER', quantityKg: 330 },
  { name: 'Pune Institutional Buyer', lat: 18.5204, lng: 73.8567, action: 'Final Delivery Hub', isBuyer: true, stopType: 'BUYER', quantityKg: 1000 }
];

export default function RouteMap({ height = 300, stops = defaultStops, routeMetrics }: RouteMapProps) {
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

      const buyerStop = activeRouteStops.find(s => s.isBuyer || s.stopType === 'BUYER') || activeRouteStops[activeRouteStops.length - 1];
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

      const createIcon = (bg: string, text: string, typeEmoji: string) => {
        return L.divIcon({
          className: 'custom-map-icon',
          html: `<div style="background:${bg};color:#fff;font-weight:700;font-size:11px;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 8px rgba(0,0,0,0.35);border:2.5px solid #fff;cursor:pointer;" title="${text}">${typeEmoji}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
          popupAnchor: [0, -16]
        });
      };

      const latLngPoints: [number, number][] = [];

      activeRouteStops.forEach((stop, idx) => {
        const pos: [number, number] = [stop.lat, stop.lng];
        latLngPoints.push(pos);

        // Marker color coding per Phase 25 specifications:
        // Farmer: green (#10b981)
        // Hub / Cross-dock: blue (#2563eb)
        // Buyer: purple (#8b5cf6)
        // Consumer: orange (#f59e0b)
        let iconColor = '#10b981';
        let emoji = String(idx + 1);

        if (stop.isBuyer || stop.stopType === 'BUYER') {
          iconColor = '#8b5cf6'; // purple
          emoji = '🏢';
        } else if (stop.isHub || stop.stopType === 'HUB') {
          iconColor = '#2563eb'; // blue
          emoji = '🏬';
        } else if (stop.isConsumer || stop.stopType === 'CONSUMER') {
          iconColor = '#f59e0b'; // orange
          emoji = '🏠';
        } else {
          iconColor = '#10b981'; // green (farmer)
          emoji = '🌾';
        }

        const marker = L.marker(pos, { icon: createIcon(iconColor, stop.name, emoji) }).addTo(map);
        marker.bindPopup(`
          <div style="font-family:inherit;font-size:12px;line-height:1.4;">
            <div style="font-weight:700;color:${iconColor};font-size:13px;margin-bottom:2px;">Stop ${idx + 1}: ${stop.name}</div>
            <div style="color:#4b5563;">${stop.action || 'Logistics checkpoint'}</div>
            ${stop.quantityKg ? `<div style="font-weight:600;margin-top:2px;">Quantity: ${stop.quantityKg} kg</div>` : ''}
            ${stop.etaMinutes ? `<div style="color:#059669;font-size:11px;margin-top:2px;">⏱ Est. Arrival: +${stop.etaMinutes} mins</div>` : ''}
          </div>
        `);
      });

      if (latLngPoints.length > 1) {
        L.polyline(latLngPoints, {
          color: '#059669',
          weight: 4,
          opacity: 0.85,
          dashArray: '8, 8'
        }).addTo(map);

        const bounds = L.latLngBounds(latLngPoints);
        map.fitBounds(bounds, { padding: [35, 35] });
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

  const hasSavings = routeMetrics && (routeMetrics.distanceSavedKm ?? 0) > 0;

  return (
    <div style={{ width: '100%', position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line)' }}>
      <div ref={containerRef} style={{ height, width: '100%' }} />

      {/* Top Legend Bar */}
      <div style={{
        position: 'absolute',
        top: 8,
        right: 8,
        background: 'rgba(255,255,255,0.95)',
        padding: '4px 10px',
        borderRadius: 6,
        fontSize: '10px',
        color: '#374151',
        zIndex: 1000,
        boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
        display: 'flex',
        gap: '8px',
        fontWeight: 600
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} /> Farmer</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2563eb' }} /> Partner Hub</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#8b5cf6' }} /> Bulk Buyer</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} /> Consumer</span>
      </div>

      {/* Bottom Route Sequence & Optimization Banner */}
      <div style={{
        position: 'absolute',
        bottom: 8,
        left: 8,
        right: 8,
        background: 'rgba(255,255,255,0.96)',
        padding: '7px 12px',
        borderRadius: 8,
        fontSize: '11px',
        color: '#1f2937',
        zIndex: 1000,
        boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '6px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>📍 <strong>Optimized Sequence:</strong></span>
          <span style={{ color: '#4b5563' }}>
            {activeRouteStops.map((s, i) => `${i + 1}. ${s.name.split(' ')[0]}`).join(' → ')}
          </span>
        </div>

        {hasSavings && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: '#ecfdf5', padding: '3px 8px', borderRadius: 5, border: '1px solid #a7f3d0' }}>
            <span style={{ color: '#065f46', fontWeight: 700 }}>
              🌿 Saved: {routeMetrics.distanceSavedKm?.toFixed(1)} KM
            </span>
            <span style={{ color: '#047857' }}>
              (₹{routeMetrics.fuelCostSavedInr?.toFixed(0)} fuel saving)
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
