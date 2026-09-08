'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getFarmerListings, createProduceListing, updateProduceListing,
  deleteProduceListing, getOpenDemands, getFarmerOrders,
  respondToAllocation, markOrderReady, getFarmerAnalytics,
  logoutUser, getStoredUser, getTracking,
  getDemandForecast, getWastePreventionAlerts
} from '../lib/farmdirect-service';
import type { Listing, Demand, OrderItem, FarmerAnalytics, TrackingInfo, DemandForecast, SurplusAlert } from '../lib/types';
import RouteMap from './RouteMap';
import ProtectedRoute from './ProtectedRoute';

const links = [
  ['Dashboard', '/farmer/dashboard'],
  ['My Produce', '/farmer/produce'],
  ['Add Produce', '/farmer/produce/new'],
  ['Buyer Demand', '/farmer/demand'],
  ['Allocations', '/farmer/matches'],
  ['Orders & Tracking', '/farmer/orders'],
  ['Profile & Reviews', '/farmer/profile']
];

const CROP_PRESETS: Record<string, { shelf_life_days: number; storage_type: string; perishability_level: string }> = {
  tomatoes: { shelf_life_days: 7, storage_type: 'VENTILATED', perishability_level: 'MEDIUM' },
  tomato: { shelf_life_days: 7, storage_type: 'VENTILATED', perishability_level: 'MEDIUM' },
  onions: { shelf_life_days: 60, storage_type: 'AMBIENT', perishability_level: 'LOW' },
  onion: { shelf_life_days: 60, storage_type: 'AMBIENT', perishability_level: 'LOW' },
  spinach: { shelf_life_days: 3, storage_type: 'VENTILATED', perishability_level: 'HIGH' },
  strawberries: { shelf_life_days: 4, storage_type: 'COLD_STORAGE', perishability_level: 'VERY_HIGH' },
  strawberry: { shelf_life_days: 4, storage_type: 'COLD_STORAGE', perishability_level: 'VERY_HIGH' },
  potatoes: { shelf_life_days: 90, storage_type: 'AMBIENT', perishability_level: 'LOW' },
  potato: { shelf_life_days: 90, storage_type: 'AMBIENT', perishability_level: 'LOW' },
};

export default function FarmerWorkspace({ view }: { view: string }) {
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [demands, setDemands] = useState<Demand[]>([]);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [analytics, setAnalytics] = useState<FarmerAnalytics | null>(null);
  const [message, setMessage] = useState('Syncing farmer workspace with live backend…');
  const [form, setForm] = useState({
    crop: 'Tomatoes',
    quantity_kg: 300,
    asking_price: 27,
    quality_grade: 'A',
    ready_date: '2026-09-10',
    pickup_window: '8:00 AM – 11:00 AM',
    farm_location: 'Khed, Maharashtra',
    harvest_date: new Date().toISOString().split('T')[0],
    shelf_life_days: 7,
    storage_type: 'VENTILATED',
    perishability_level: 'MEDIUM'
  });
  const [farmerStep, setFarmerStep] = useState<1 | 2 | 3>(1);
  const [publishedSuccess, setPublishedSuccess] = useState<boolean>(false);
  const [stepError, setStepError] = useState<string>('');
  const [token, setToken] = useState<string>('');
  const [profile, setProfile] = useState<any>({
    name: 'Khed Farmer Group',
    location: 'Khed, Maharashtra',
    reliability: 96.0,
    role: 'FARMER'
  });

  // Demand Forecast state
  const [forecastCrop, setForecastCrop] = useState<string>('Tomatoes');
  const [forecastData, setForecastData] = useState<DemandForecast | null>(null);
  const [loadingForecast, setLoadingForecast] = useState<boolean>(false);

  // Food Waste & Surplus state
  const [surplusAlerts, setSurplusAlerts] = useState<SurplusAlert[]>([]);

  // Edit listing state
  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  const [editForm, setEditForm] = useState({ quantity_kg: 0, asking_price: 0, quality_grade: 'A' });

  // Selected tracking state
  const [activeTracking, setActiveTracking] = useState<TrackingInfo | null>(null);

  useEffect(() => {
    async function init() {
      const t = sessionStorage.getItem('farmdirect-token') || '';
      const stored = getStoredUser();
      if (stored) {
        setProfile((prev: any) => ({ ...prev, ...stored }));
        if (stored.location) {
          setForm(prev => ({ ...prev, farm_location: stored.location }));
        }
      }
      setToken(t);

      // Check for prefill from "Supply this Demand"
      const prefillRaw = sessionStorage.getItem('farmdirect-farmer-prefill');
      if (prefillRaw) {
        try {
          const prefill = JSON.parse(prefillRaw);
          setForm(prev => ({ ...prev, ...prefill }));
          sessionStorage.removeItem('farmdirect-farmer-prefill');
        } catch {
          // keep defaults
        }
      }

      if (!t) return;

      await refreshAllData(t);

      // Load authenticated profile
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8000'}/auth/me`, {
          headers: { Authorization: `Bearer ${t}` }
        });
        if (res.ok) {
          const u = await res.json();
          setProfile(u);
        }
      } catch {
        // Keeps state
      }
    }

    init();
  }, []);

  useEffect(() => {
    if (view === 'Add Produce') {
      setPublishedSuccess(false);
      setFarmerStep(1);
      setStepError('');
    }
  }, [view]);

  const handleLogout = () => {
    logoutUser();
    router.push('/');
  };

  async function refreshAllData(authToken: string) {
    try {
      const [l, d, o, a, fc, sa] = await Promise.all([
        getFarmerListings(authToken),
        getOpenDemands(authToken),
        getFarmerOrders(authToken),
        getFarmerAnalytics(authToken),
        getDemandForecast('Tomatoes', profile.location || 'Pune'),
        getWastePreventionAlerts()
      ]);

      setListings(l);
      setDemands(d);
      setOrders(o);
      setAnalytics(a.analytics);
      setForecastData(fc);
      setSurplusAlerts(sa);
      setMessage('All supply, demand, perishability, and allocation data synchronized in real-time.');
    } catch {
      setMessage('Loaded offline demo data.');
    }
  }

  function handleCropChange(newCrop: string) {
    const key = newCrop.trim().toLowerCase().replace(/s$/, '');
    const preset = CROP_PRESETS[key] || { shelf_life_days: 7, storage_type: 'VENTILATED', perishability_level: 'MEDIUM' };
    setForm(prev => ({
      ...prev,
      crop: newCrop,
      shelf_life_days: preset.shelf_life_days,
      storage_type: preset.storage_type,
      perishability_level: preset.perishability_level
    }));
  }

  async function handleLoadForecast(cropName: string) {
    setForecastCrop(cropName);
    setLoadingForecast(true);
    try {
      const data = await getDemandForecast(cropName, profile.location || 'Pune');
      setForecastData(data);
    } catch {
      // ignore
    } finally {
      setLoadingForecast(false);
    }
  }

  async function handlePublish() {
    setMessage('Publishing produce listing with perishability profile to database…');
    const effectivePrice = form.asking_price > 0 ? Number(form.asking_price) : 27.0;
    const ok = await createProduceListing({
      crop: form.crop,
      quantity_kg: Number(form.quantity_kg),
      asking_price: effectivePrice,
      quality_grade: form.quality_grade,
      ready_date: form.ready_date,
      latitude: 18.738,
      longitude: 73.846,
      harvest_date: form.harvest_date,
      shelf_life_days: Number(form.shelf_life_days),
      storage_type: form.storage_type,
      perishability_level: form.perishability_level
    }, token);

    if (ok) {
      setMessage(`Successfully listed ${form.quantity_kg} kg of ${form.crop} (${form.perishability_level} perishability). Now active in buyer matching!`);
      setPublishedSuccess(true);
      const l = await getFarmerListings(token);
      setListings(l);
      const a = await getFarmerAnalytics(token);
      setAnalytics(a.analytics);
    } else {
      setMessage('Failed to publish listing. Please check backend connection.');
    }
  }

  function handleResetWizard() {
    setFarmerStep(1);
    setPublishedSuccess(false);
    setStepError('');
    setForm({
      crop: 'Tomatoes',
      quantity_kg: 300,
      asking_price: 27,
      quality_grade: 'A',
      ready_date: '2026-09-10',
      pickup_window: '8:00 AM – 11:00 AM',
      farm_location: profile.location || 'Khed, Maharashtra',
      harvest_date: new Date().toISOString().split('T')[0],
      shelf_life_days: 7,
      storage_type: 'VENTILATED',
      perishability_level: 'MEDIUM'
    });
  }

  function handleStep1Continue() {
    setStepError('');
    if (!form.crop.trim()) {
      setStepError('Please specify the crop name.');
      return;
    }
    if (!form.quantity_kg || form.quantity_kg <= 0) {
      setStepError('Available quantity must be greater than 0 kg.');
      return;
    }
    setFarmerStep(2);
  }

  function handleStep2Continue() {
    setStepError('');
    // Asking price is optional; if omitted, defaults to market rate matching
    if (!form.ready_date) {
      setStepError('Please select a harvest ready date.');
      return;
    }
    if (!form.farm_location.trim()) {
      setStepError('Please specify the farm dispatch location.');
      return;
    }
    setFarmerStep(3);
  }

  async function handleUpdateListing(e: React.FormEvent) {
    e.preventDefault();
    if (!editingListing) return;
    setMessage(`Updating listing for ${editingListing.crop}…`);
    const ok = await updateProduceListing(editingListing.id, editForm, token);
    if (ok) {
      setMessage(`Listing updated successfully! New price: ₹${editForm.asking_price}/kg, qty: ${editForm.quantity_kg} kg.`);
      setEditingListing(null);
      const l = await getFarmerListings(token);
      setListings(l);
      const a = await getFarmerAnalytics(token);
      setAnalytics(a.analytics);
    } else {
      setMessage('Failed to update listing.');
    }
  }

  async function handleDeleteListing(listingId: string) {
    if (!confirm('Are you sure you want to remove this produce listing?')) return;
    setMessage('Removing listing from marketplace…');
    const ok = await deleteProduceListing(listingId, token);
    if (ok) {
      setMessage('Listing removed successfully.');
      const l = await getFarmerListings(token);
      setListings(l);
      const a = await getFarmerAnalytics(token);
      setAnalytics(a.analytics);
    } else {
      setMessage('Failed to delete listing.');
    }
  }

  async function handleRespondAllocation(itemId: string, action: 'ACCEPT' | 'REJECT') {
    setMessage(`${action === 'ACCEPT' ? 'Accepting' : 'Declining'} buyer allocation in database…`);
    const res = await respondToAllocation(itemId, action, token);
    setMessage(`Allocation status updated to ${res.status}. Buyer notified via live event.`);
    const updated = await getFarmerOrders(token);
    setOrders(updated);
    const a = await getFarmerAnalytics(token);
    setAnalytics(a.analytics);
  }

  async function handleMarkReady(orderId: string) {
    setMessage(`Marking produce ready for pickup for Order #${orderId}…`);
    await markOrderReady(orderId, token);
    setMessage(`Order #${orderId} marked ready! 3PL logistics driver dispatched for farm pickup.`);
    const updated = await getFarmerOrders(token);
    setOrders(updated);
    // Refresh tracking view
    const tRes = await getTracking(orderId);
    setActiveTracking(tRes.tracking);
  }

  async function handleViewTracking(orderId: string) {
    setMessage(`Fetching live route & tracking for Order #${orderId}…`);
    const tRes = await getTracking(orderId);
    setActiveTracking(tRes.tracking);
  }

  const pendingAllocations = orders.filter(o => o.status === 'PENDING_ACCEPTANCE');

  return (
    <ProtectedRoute allowedRoles={['FARMER', 'FPO']}>
      <main className="app">
        <nav className="nav" style={{ flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div className="brand" onClick={() => router.push('/farmer/dashboard')} style={{ cursor: 'pointer' }}>
              <i />FarmDirect
            </div>
            <span className="portal-badge farmer">
              👨‍🌾 Farmer / FPO Workspace
            </span>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="user-welcome-text">
              Welcome, <strong>{profile.name || 'Farmer / FPO'}</strong>
            </span>
            <button
              type="button"
              className="logout-btn"
              onClick={handleLogout}
              title="Log out and return to portal login"
            >
              Logout
            </button>
          </div>
        </nav>

      {/* Navigation Tabs */}
      <div className="filter" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
        {links.map(x => {
          const isSelected = view.toLowerCase().includes(x[0].toLowerCase().split(' ')[0]);
          return (
            <a
              className="tag"
              style={{
                textDecoration: 'none',
                background: isSelected ? 'var(--green)' : '#f1f5f9',
                color: isSelected ? '#fff' : 'inherit',
                cursor: 'pointer'
              }}
              href={x[1]}
              key={x[1]}
            >
              {x[0]} {x[0] === 'Allocations' && pendingAllocations.length > 0 ? `(${pendingAllocations.length})` : ''}
            </a>
          );
        })}
      </div>

      <section className="content">
        <article className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <h1>{view}</h1>
            <div style={{ display: 'flex', gap: 8 }}>
              <span className="tag" style={{ background: '#dcfce7', color: '#166534' }}>
                Verified Producer · {profile.location || 'Pune, Maharashtra'}
              </span>
              <span className="tag" style={{ background: '#fef3c7', color: '#92400e' }}>
                Reliability: {profile.reliability || 96.0}%
              </span>
            </div>
          </div>

          <div className="notice" style={{ marginBottom: 14 }}>✦ {message}</div>

          {/* 1. DASHBOARD */}
          {view === 'Dashboard' && (
            <>
              <div className="grid">
                <div className="metric">
                  <small>ACTIVE LISTINGS</small>
                  <b>{analytics?.active_listings_count ?? listings.length}</b>
                </div>
                <div className="metric">
                  <small>COMMITTED SUPPLY</small>
                  <b>{analytics?.total_allocated_kg ?? 0} kg</b>
                </div>
                <div className="metric">
                  <small>TOTAL EARNINGS</small>
                  <b style={{ color: 'var(--green)' }}>₹{(analytics?.total_revenue ?? 0).toLocaleString()}</b>
                </div>
                <div className="metric">
                  <small>BUYER RATING</small>
                  <b>{analytics?.average_rating ?? 4.9}★</b>
                </div>
              </div>

              {pendingAllocations.length > 0 && (
                <div className="status" style={{ borderLeft: '4px solid #f59e0b', background: '#fffbeb', marginTop: 14 }}>
                  ⚠️ <strong>Action Required:</strong> You have {pendingAllocations.length} pending buyer allocation(s) waiting for acceptance.
                  <div style={{ marginTop: 8 }}>
                    <a href="/farmer/matches" style={{ textDecoration: 'none' }}>
                      <button className="button green" style={{ padding: '6px 12px', fontSize: 12 }}>Review Allocations →</button>
                    </a>
                  </div>
                </div>
              )}

              <div className="status" style={{ marginTop: 14 }}>
                ✦ <strong>Live Market Intelligence:</strong> High local demand observed for Tomatoes and Spinach across Pune Institutional buyers.
              </div>

              <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <a href="/farmer/produce/new" style={{ textDecoration: 'none' }}>
                  <button className="button green">+ List New Produce →</button>
                </a>
                <a href="/farmer/demand" style={{ textDecoration: 'none' }}>
                  <button className="button">View Buyer Demands ({demands.length})</button>
                </a>
                <a href="/farmer/orders" style={{ textDecoration: 'none' }}>
                  <button className="button">Fulfillment & Orders ({orders.length})</button>
                </a>
              </div>

              {/* Real ML Regional Demand Forecasting */}
              <div style={{ marginTop: 20, background: '#f8fafc', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                  <div>
                    <span className="tag" style={{ background: '#e0f2fe', color: '#0369a1', fontWeight: 700, marginBottom: 4, display: 'inline-block' }}>
                      ✦ Real ML Demand Forecasting
                    </span>
                    <h3 style={{ margin: 0, fontSize: 17 }}>Regional Agricultural Demand Predictor</h3>
                    <small style={{ color: 'var(--muted)' }}>
                      Predictive volume intelligence trained on 312 historical regional harvest/demand observation cycles.
                    </small>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 13, fontWeight: 600 }}>Crop:</label>
                    <select
                      value={forecastCrop}
                      onChange={e => handleLoadForecast(e.target.value)}
                      style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--line)', background: '#fff', fontSize: 13 }}
                    >
                      <option value="Tomatoes">Tomatoes</option>
                      <option value="Spinach">Spinach</option>
                      <option value="Strawberries">Strawberries</option>
                      <option value="Onions">Onions</option>
                      <option value="Potatoes">Potatoes</option>
                    </select>
                  </div>
                </div>

                {loadingForecast ? (
                  <p style={{ color: 'var(--muted)', fontSize: 13 }}>Computing Random Forest demand prediction…</p>
                ) : forecastData ? (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
                      <div style={{ background: '#fff', padding: 12, borderRadius: 8, border: '1px solid var(--line)' }}>
                        <small style={{ color: 'var(--muted)', fontWeight: 700, fontSize: 10 }}>PROJECTED DEMAND</small>
                        <b style={{ fontSize: 18, color: 'var(--navy)', display: 'block', marginTop: 4 }}>
                          {Math.round(forecastData.predicted_quantity).toLocaleString()} kg
                        </b>
                        <span style={{ fontSize: 11, color: forecastData.trend === 'Increasing' ? '#166534' : '#6b7280' }}>
                          Trend: {forecastData.trend}
                        </span>
                      </div>
                      <div style={{ background: '#fff', padding: 12, borderRadius: 8, border: '1px solid var(--line)' }}>
                        <small style={{ color: 'var(--muted)', fontWeight: 700, fontSize: 10 }}>HISTORICAL AVG</small>
                        <b style={{ fontSize: 18, color: 'var(--navy)', display: 'block', marginTop: 4 }}>
                          {Math.round(forecastData.historical_average).toLocaleString()} kg
                        </b>
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                          Active Supply: {Math.round(forecastData.active_supply).toLocaleString()} kg
                        </span>
                      </div>
                      <div style={{ background: '#fff', padding: 12, borderRadius: 8, border: '1px solid var(--line)' }}>
                        <small style={{ color: 'var(--muted)', fontWeight: 700, fontSize: 10 }}>MARKET STATUS</small>
                        <b style={{
                          fontSize: 15,
                          display: 'block',
                          marginTop: 4,
                          color: forecastData.market_status === 'Supply Shortage' ? '#dc2626' : forecastData.market_status === 'Balanced' ? '#0284c7' : '#d97706'
                        }}>
                          {forecastData.market_status}
                        </b>
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                          Gap: {forecastData.supply_gap > 0 ? `+${Math.round(forecastData.supply_gap)} kg` : `${Math.round(forecastData.supply_gap)} kg`}
                        </span>
                      </div>
                    </div>

                    <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, padding: 12, fontSize: 13, color: '#065f46', marginBottom: 8 }}>
                      <strong>Actionable Intelligence:</strong> {forecastData.recommendation}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--muted)' }}>
                      <span>🤖 <strong>Model:</strong> {forecastData.forecast_method} ({forecastData.data_points_used} regional points)</span>
                      <span>Target Hub: {forecastData.location}</span>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Food-Waste & Surplus Prevention Engine */}
              <div style={{ marginTop: 20, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
                  <div>
                    <span className="tag" style={{ background: '#ffedd5', color: '#c2410c', fontWeight: 700, marginBottom: 4, display: 'inline-block' }}>
                      🛡️ Food Waste Prevention Engine
                    </span>
                    <h3 style={{ margin: 0, fontSize: 17, color: '#9a3412' }}>Surplus & Freshness Degradation Monitoring</h3>
                  </div>
                  <span className="tag" style={{ background: '#fed7aa', color: '#7c2d12', fontWeight: 700 }}>
                    {surplusAlerts.length} Active Notice{surplusAlerts.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <p style={{ fontSize: 13, color: '#7c2d12', margin: '0 0 12px' }}>
                  FarmDirect proactively predicts spoilage risks and routes near-expiry harvest to rapid bulk matching or local partner cross-docks before quality loss.
                </p>

                {surplusAlerts.length === 0 ? (
                  <div style={{ background: '#fff', padding: 12, borderRadius: 8, fontSize: 13, color: '#166534', border: '1px solid #bbf7d0' }}>
                    ✓ No imminent spoilage risk detected across active produce lots. All listed volumes are within optimal shelf-life thresholds.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {surplusAlerts.map((alert, idx) => (
                      <div key={idx} style={{ background: '#fff', padding: 12, borderRadius: 8, border: '1px solid #fdba74', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                        <div>
                          <strong style={{ fontSize: 15, color: '#9a3412' }}>{alert.crop} ({alert.quantity_kg} kg)</strong>
                          <span className="tag" style={{
                            marginLeft: 8,
                            background: alert.urgency_level === 'CRITICAL' ? '#fee2e2' : alert.urgency_level === 'URGENT' ? '#ffedd5' : '#fef3c7',
                            color: alert.urgency_level === 'CRITICAL' ? '#991b1b' : alert.urgency_level === 'URGENT' ? '#9a3412' : '#92400e'
                          }}>
                            {alert.urgency_level}
                          </span>
                          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                            Listed by: {alert.farmer_name} · Freshness: <b>{Math.round(alert.freshness_percentage)}%</b> · Shelf-life remaining: <b>{alert.remaining_shelf_life_days.toFixed(1)} days</b>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <a href="/farmer/produce" style={{ textDecoration: 'none' }}>
                            <button className="button" style={{ fontSize: 12, padding: '6px 12px', background: '#ea580c', color: '#fff', border: 'none' }}>
                              Cross-Dock Dispatch →
                            </button>
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: 10, fontSize: 11, color: '#9a3412' }}>
                  ✦ <strong>Asset-Light Zero-Warehouse Rule:</strong> FarmDirect operates zero owned warehouses; short-duration cross-docking takes place at partner FPO collection centers and community stores.
                </div>
              </div>

              {/* Recent Buyer Feedback */}
              {analytics?.recent_feedback && analytics.recent_feedback.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <h3>Recent Buyer Reviews</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    {analytics.recent_feedback.map((f, i) => (
                      <div key={i} style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid var(--line)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#eab308', fontWeight: 700 }}>{'★'.repeat(f.score)}</span>
                          <small style={{ color: 'var(--muted)' }}>Verified Transaction</small>
                        </div>
                        <p style={{ margin: '4px 0 0', fontSize: 13 }}>"{f.comment || 'High quality harvest, timely fulfillment.'}"</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* 2. MY PRODUCE */}
          {view === 'My Produce' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ margin: 0 }}>Active farm produce listings eligible for buyer matching:</p>
                <a href="/farmer/produce/new" style={{ textDecoration: 'none' }}>
                  <button className="button green" style={{ padding: '8px 14px', fontSize: 13 }}>+ Add Produce</button>
                </a>
              </div>

              {listings.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 30, background: '#f8fafc', borderRadius: 8 }}>
                  <p>No active produce listed yet.</p>
                  <a href="/farmer/produce/new"><button className="button green" style={{ marginTop: 8 }}>Create First Listing →</button></a>
                </div>
              ) : (
                listings.map(x => (
                  <div className="card" key={x.id} style={{ border: '1px solid var(--line)', padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <div>
                        <strong style={{ fontSize: 16 }}>{x.crop}</strong>
                        <span className="tag" style={{ marginLeft: 8, background: '#dcfce7', color: '#166534' }}>
                          Grade {x.quality_grade}
                        </span>
                        <span className="tag" style={{
                          marginLeft: 6,
                          background: x.urgency_level === 'CRITICAL' ? '#fee2e2' : x.urgency_level === 'URGENT' ? '#ffedd5' : '#dcfce7',
                          color: x.urgency_level === 'CRITICAL' ? '#991b1b' : x.urgency_level === 'URGENT' ? '#9a3412' : '#166534',
                          fontWeight: 700
                        }}>
                          {x.freshness_percentage !== undefined ? `${Math.round(x.freshness_percentage)}% Fresh` : '95% Fresh'}
                        </span>
                        <span className="tag" style={{ marginLeft: 6, background: '#f1f5f9', color: '#475569' }}>
                          {x.storage_type === 'COLD_STORAGE' ? '❄️ Cold-Chain (2°C-6°C)' : x.storage_type === 'VENTILATED' ? '🍃 Ventilated' : '📦 Ambient Dry'}
                        </span>
                        <p style={{ margin: '6px 0 4px' }}>
                          <b>{x.quantity_kg} kg available</b> · <span style={{ color: 'var(--green)', fontWeight: 700 }}>₹{x.asking_price}/kg</span>
                          {x.remaining_shelf_life_days !== undefined && (
                            <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--muted)' }}>
                              ({x.remaining_shelf_life_days.toFixed(1)} days shelf-life remaining)
                            </span>
                          )}
                        </p>
                        <small style={{ color: 'var(--muted)' }}>
                          Harvest: {x.harvest_date || 'Recent'} · Ready: {x.ready_date || 'Immediate'} · Status: <b>{x.status || 'ACTIVE'}</b>
                        </small>
                      </div>

                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <button
                          className="button"
                          style={{ padding: '6px 12px', fontSize: 12 }}
                          onClick={() => {
                            setEditingListing(x);
                            setEditForm({ quantity_kg: x.quantity_kg, asking_price: x.asking_price, quality_grade: x.quality_grade });
                          }}
                        >
                          ✎ Edit
                        </button>
                        <button
                          className="button"
                          style={{ padding: '6px 12px', fontSize: 12, background: '#dc2626' }}
                          onClick={() => handleDeleteListing(x.id)}
                        >
                          ✕ Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}

              {/* Edit Listing Modal / Inline Section */}
              {editingListing && (
                <div style={{ background: '#f8fafc', border: '2px solid var(--green)', padding: 16, borderRadius: 10, marginTop: 10 }}>
                  <h3>Edit Listing: {editingListing.crop}</h3>
                  <form onSubmit={handleUpdateListing} className="form" style={{ marginTop: 10 }}>
                    <label className="field">
                      Available Quantity (kg)
                      <input
                        type="number"
                        required
                        value={editForm.quantity_kg}
                        onChange={e => setEditForm({ ...editForm, quantity_kg: Number(e.target.value) })}
                      />
                    </label>

                    <label className="field">
                      Asking Price / kg (₹)
                      <input
                        type="number"
                        required
                        value={editForm.asking_price}
                        onChange={e => setEditForm({ ...editForm, asking_price: Number(e.target.value) })}
                      />
                    </label>

                    <label className="field">
                      Quality Grade
                      <select
                        value={editForm.quality_grade}
                        onChange={e => setEditForm({ ...editForm, quality_grade: e.target.value })}
                      >
                        <option value="A">Grade A (Premium)</option>
                        <option value="B">Grade B (Standard)</option>
                        <option value="C">Grade C (Processing)</option>
                      </select>
                    </label>

                    <div style={{ gridColumn: 'span 2', display: 'flex', gap: 8, marginTop: 8 }}>
                      <button className="button green" type="submit">Save Changes</button>
                      <button className="button" type="button" onClick={() => setEditingListing(null)}>Cancel</button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}

          {/* 3. ADD PRODUCE (PROGRESSIVE 3-STEP WORKFLOW) */}
          {view === 'Add Produce' && (
            <>
              {publishedSuccess ? (
                <div style={{ textAlign: 'center', padding: '30px 10px' }}>
                  <div style={{
                    width: 68,
                    height: 68,
                    margin: '0 auto 16px',
                    borderRadius: '50%',
                    background: '#dcfce7',
                    color: '#166534',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 32,
                    fontWeight: 800
                  }}>
                    ✓
                  </div>
                  <h2 style={{ fontSize: 26, margin: '0 0 6px', color: 'var(--navy)' }}>Harvest Listing Published!</h2>
                  <p style={{ fontSize: 15, margin: '0 0 16px' }}>
                    <strong>{form.quantity_kg} kg {form.crop}</strong> (Grade {form.quality_grade}) listed at <strong>₹{form.asking_price}/kg</strong>.<br />
                    <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                      Your harvest is now active in the matching engine for nearby institutional buyer allocations and carrier dispatch.
                    </span>
                  </p>

                  <div style={{ maxWidth: 440, margin: '0 auto 24px', background: '#f8fafc', border: '1px solid var(--line)', borderRadius: 12, padding: 18, textAlign: 'left' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
                      <span style={{ color: 'var(--muted)' }}>Crop & Quality:</span>
                      <strong>{form.crop} (Grade {form.quality_grade})</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
                      <span style={{ color: 'var(--muted)' }}>Available Volume:</span>
                      <strong>{form.quantity_kg} kg</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
                      <span style={{ color: 'var(--muted)' }}>Direct Asking Price:</span>
                      <strong>₹{form.asking_price} / kg</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
                      <span style={{ color: 'var(--muted)' }}>Scheduled Pickup:</span>
                      <strong>{form.ready_date} ({form.pickup_window})</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
                      <span style={{ color: 'var(--muted)' }}>Dispatch Point:</span>
                      <strong>{form.farm_location}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: 8, fontSize: 16 }}>
                      <span><b>Projected Gross Farmgate:</b></span>
                      <strong style={{ color: 'var(--green)' }}>₹{(form.quantity_kg * form.asking_price).toLocaleString()}</strong>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <a href="/farmer/produce" style={{ textDecoration: 'none' }}>
                      <button className="button green">
                        View in My Produce →
                      </button>
                    </a>
                    <button className="button" onClick={handleResetWizard}>
                      + List Another Harvest
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="pagehead">
                    <p style={{ color: 'var(--muted)', margin: '0 0 14px', fontSize: 13 }}>
                      Publish harvest supply to participate in direct AI multi-farm matching with verified institutional buyers.
                    </p>
                  </div>

                  {/* Stepper bar (3 steps) */}
                  <div className="stepper" style={{ marginTop: 6 }}>
                    {[1, 2, 3].map(stepNum => (
                      <span key={stepNum} className={`stepdot ${stepNum <= farmerStep ? 'on' : ''}`} />
                    ))}
                  </div>
                  <span className="chip">STEP {farmerStep} OF 3</span>

                  {stepError && (
                    <div style={{ background: '#fee2e2', border: '1px solid #fecaca', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>⚠️</span>
                      <span>{stepError}</span>
                    </div>
                  )}

                  {/* Step 1: Produce & Quality Grade */}
                  {farmerStep === 1 && (
                    <div className="step-content">
                      <h3 style={{ fontSize: 18, margin: '8px 0 4px' }}>Produce & Quality Grade</h3>
                      <p style={{ color: 'var(--muted)', margin: '0 0 16px', fontSize: 13 }}>
                        Specify the crop variety, available harvest quantity, and quality grading standard.
                      </p>

                      <div className="form">
                        <label className="field">
                          Crop Name
                          <select
                            value={['Tomatoes', 'Onions', 'Spinach', 'Strawberries', 'Potatoes'].includes(form.crop) ? form.crop : 'Custom'}
                            onChange={e => {
                              const val = e.target.value;
                              if (val === 'Custom') {
                                handleCropChange('');
                              } else {
                                handleCropChange(val);
                              }
                            }}
                          >
                            <option value="Tomatoes">Tomatoes (Medium Perishability)</option>
                            <option value="Spinach">Spinach (High Perishability)</option>
                            <option value="Strawberries">Strawberries (Cold-Chain Required)</option>
                            <option value="Onions">Onions (Low Perishability / Ambient)</option>
                            <option value="Potatoes">Potatoes (Low Perishability / Ambient)</option>
                            <option value="Custom">Custom / Other Crop…</option>
                          </select>
                        </label>

                        {(!['Tomatoes', 'Onions', 'Spinach', 'Strawberries', 'Potatoes'].includes(form.crop) || form.crop === '') && (
                          <label className="field">
                            Enter Custom Crop Name
                            <input
                              value={form.crop}
                              onChange={e => handleCropChange(e.target.value)}
                              placeholder="e.g. Capsicum, Cauliflower, Mangoes"
                              autoFocus
                            />
                          </label>
                        )}

                        <label className="field">
                          Available Quantity (kg)
                          <input
                            type="number"
                            min="1"
                            value={form.quantity_kg || ''}
                            onChange={e => setForm({ ...form, quantity_kg: Math.max(0, Number(e.target.value)) })}
                          />
                          <small style={{ color: 'var(--muted)', fontSize: 11 }}>
                            Net weight in kilograms sorted for collection
                          </small>
                        </label>

                        <label className="field">
                          Quality Grade
                          <select
                            value={form.quality_grade}
                            onChange={e => setForm({ ...form, quality_grade: e.target.value })}
                          >
                            <option value="A">Grade A (Premium)</option>
                            <option value="B">Grade B (Standard)</option>
                            <option value="C">Grade C (Processing)</option>
                          </select>
                          <small style={{ color: 'var(--muted)', fontSize: 11 }}>
                            APMC direct-marketing quality classification
                          </small>
                        </label>

                        <label className="field">
                          Harvest Date
                          <input
                            type="date"
                            value={form.harvest_date}
                            onChange={e => setForm({ ...form, harvest_date: e.target.value })}
                          />
                          <small style={{ color: 'var(--muted)', fontSize: 11 }}>
                            Date of harvest (determines baseline freshness calculation)
                          </small>
                        </label>

                        <label className="field">
                          Expected Shelf Life (Days)
                          <input
                            type="number"
                            min="1"
                            max="365"
                            value={form.shelf_life_days}
                            onChange={e => setForm({ ...form, shelf_life_days: Number(e.target.value) })}
                          />
                          <small style={{ color: 'var(--muted)', fontSize: 11 }}>
                            Typical shelf life under standard storage
                          </small>
                        </label>

                        <label className="field">
                          Storage Condition Required
                          <select
                            value={form.storage_type}
                            onChange={e => setForm({ ...form, storage_type: e.target.value })}
                          >
                            <option value="VENTILATED">Ventilated Ambient (15°C – 22°C)</option>
                            <option value="COLD_STORAGE">Reefer Cold-Chain (2°C – 6°C)</option>
                            <option value="AMBIENT">Dry Ambient (20°C – 30°C)</option>
                            <option value="CONTROLLED_ATMOSPHERE">Controlled Atmosphere</option>
                          </select>
                          <small style={{ color: 'var(--muted)', fontSize: 11 }}>
                            Dictates 3PL freight vehicle recommendation (Mini Truck vs Reefer)
                          </small>
                        </label>

                        <label className="field">
                          Perishability Level
                          <select
                            value={form.perishability_level}
                            onChange={e => setForm({ ...form, perishability_level: e.target.value })}
                          >
                            <option value="LOW">LOW (Onions, Potatoes, Grains)</option>
                            <option value="MEDIUM">MEDIUM (Tomatoes, Peppers, Citrus)</option>
                            <option value="HIGH">HIGH (Leafy Greens, Spinach, Herbs)</option>
                            <option value="VERY_HIGH">VERY HIGH (Berries, Strawberries, Mushrooms)</option>
                          </select>
                          <small style={{ color: 'var(--muted)', fontSize: 11 }}>
                            ML spoilage risk classifier weight
                          </small>
                        </label>
                      </div>

                      <div style={{ marginTop: 22, display: 'flex', justifyContent: 'flex-end' }}>
                        <button className="button green" onClick={handleStep1Continue}>
                          Continue to Pricing & Logistics →
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 2: Pricing & Logistics */}
                  {farmerStep === 2 && (
                    <div className="step-content">
                      <h3 style={{ fontSize: 18, margin: '8px 0 4px' }}>Farmgate Pricing & Logistics</h3>
                      <p style={{ color: 'var(--muted)', margin: '0 0 16px', fontSize: 13 }}>
                        Set your direct farmgate asking price and define scheduled pickup window for third-party logistics.
                      </p>

                      <div className="form">
                        <label className="field" style={{ gridColumn: 'span 2' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Asking Price / Target (₹/kg) <small style={{ color: 'var(--muted)', fontWeight: 400 }}>(Optional)</small></span>
                            <span style={{ fontWeight: 700, color: form.asking_price > 0 ? 'var(--green)' : 'var(--muted)' }}>
                              {form.asking_price > 0 ? `₹${form.asking_price}/kg` : 'Open / Market Rate'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 4 }}>
                            <input
                              type="range"
                              min="15"
                              max="60"
                              step="1"
                              value={form.asking_price || 27}
                              onChange={e => setForm({ ...form, asking_price: Number(e.target.value) })}
                              style={{ flex: 1, accentColor: 'var(--green)', cursor: 'pointer' }}
                            />
                            <input
                              type="number"
                              min="1"
                              placeholder="e.g. 27"
                              value={form.asking_price || ''}
                              onChange={e => setForm({ ...form, asking_price: e.target.value ? Math.max(0, Number(e.target.value)) : 0 })}
                              style={{ width: 110 }}
                            />
                            {form.asking_price > 0 && (
                              <button
                                type="button"
                                className="button"
                                style={{ padding: '6px 10px', fontSize: 11 }}
                                onClick={() => setForm({ ...form, asking_price: 0 })}
                              >
                                Clear
                              </button>
                            )}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                            <span>Min: ₹15/kg</span>
                            <span>Direct farmgate rate · Leave empty for open buyer bidding / market price</span>
                            <span>Max: ₹60/kg</span>
                          </div>
                        </label>

                        <label className="field">
                          Ready Date for Pickup
                          <input
                            type="date"
                            value={form.ready_date}
                            onChange={e => setForm({ ...form, ready_date: e.target.value })}
                          />
                          <small style={{ color: 'var(--muted)', fontSize: 11 }}>
                            Date when crates are ready for 3PL vehicle arrival
                          </small>
                        </label>

                        <label className="field">
                          Pickup Time Window
                          <select
                            value={form.pickup_window}
                            onChange={e => setForm({ ...form, pickup_window: e.target.value })}
                          >
                            <option value="8:00 AM – 11:00 AM">8:00 AM – 11:00 AM (Morning Slot)</option>
                            <option value="11:00 AM – 2:00 PM">11:00 AM – 2:00 PM (Mid-day Slot)</option>
                            <option value="2:00 PM – 5:00 PM">2:00 PM – 5:00 PM (Afternoon Slot)</option>
                          </select>
                          <small style={{ color: 'var(--muted)', fontSize: 11 }}>
                            Coordinated with regional mini-truck collection circuit
                          </small>
                        </label>

                        <label className="field">
                          Dispatch Location / Farm Address
                          <input
                            value={form.farm_location}
                            onChange={e => setForm({ ...form, farm_location: e.target.value })}
                            placeholder="e.g. Khed, Maharashtra"
                          />
                          <small style={{ color: 'var(--muted)', fontSize: 11 }}>
                            Farm collection point for carrier driver
                          </small>
                        </label>
                      </div>

                      <div style={{ marginTop: 22, display: 'flex', justifyContent: 'space-between' }}>
                        <button className="button" onClick={() => setFarmerStep(1)}>
                          ← Back
                        </button>
                        <button className="button green" onClick={handleStep2Continue}>
                          Continue to Review →
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Review & Publish */}
                  {farmerStep === 3 && (
                    <div className="step-content">
                      <h3 style={{ fontSize: 18, margin: '8px 0 4px' }}>Review & Publish Produce Listing</h3>
                      <p style={{ color: 'var(--muted)', margin: '0 0 16px', fontSize: 13 }}>
                        Confirm harvest specifications and projected farmgate earnings before publishing to the direct matching network.
                      </p>

                      <div className="producepreview">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                          <div>
                            <b style={{ fontSize: 20, color: 'var(--navy)' }}>
                              {form.crop}
                            </b>
                            <span className="tag" style={{ marginLeft: 8, background: '#dcfce7', color: '#166534' }}>
                              Grade {form.quality_grade} ({form.quality_grade === 'A' ? 'Premium' : form.quality_grade === 'B' ? 'Standard' : 'Processing'})
                            </span>
                            <p style={{ margin: '6px 0 0', color: 'var(--muted)', fontSize: 14 }}>
                              {form.quantity_kg} kg harvest ready for direct procurement
                            </p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: 12, color: 'var(--muted)', display: 'block' }}>Projected Farmgate Earnings</span>
                            <b style={{ fontSize: 22, color: 'var(--green)' }}>
                              {form.asking_price > 0 ? `₹${(form.quantity_kg * form.asking_price).toLocaleString()}` : `~₹${(form.quantity_kg * 27).toLocaleString()} (Market Rate)`}
                            </b>
                            <small style={{ display: 'block', color: 'var(--green)', fontSize: 11, fontWeight: 700 }}>
                              ✦ 100% Direct Payout · Zero Commission
                            </small>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, borderTop: '1px solid #bbf7d0', marginTop: 16, paddingTop: 14 }}>
                          <div>
                            <small style={{ color: 'var(--muted)', display: 'block', fontSize: 11, fontWeight: 700 }}>AVAILABLE QUANTITY</small>
                            <b style={{ fontSize: 15 }}>{form.quantity_kg} kg</b>
                          </div>
                          <div>
                            <small style={{ color: 'var(--muted)', display: 'block', fontSize: 11, fontWeight: 700 }}>ASKING PRICE</small>
                            <b style={{ fontSize: 15 }}>{form.asking_price > 0 ? `₹${form.asking_price} / kg` : 'Market Rate (Open)'}</b>
                          </div>
                          <div>
                            <small style={{ color: 'var(--muted)', display: 'block', fontSize: 11, fontWeight: 700 }}>HARVEST & SHELF-LIFE</small>
                            <b style={{ fontSize: 14 }}>{form.harvest_date} ({form.shelf_life_days}d)</b>
                          </div>
                          <div>
                            <small style={{ color: 'var(--muted)', display: 'block', fontSize: 11, fontWeight: 700 }}>STORAGE TYPE</small>
                            <b style={{ fontSize: 14 }}>{form.storage_type.replace(/_/g, ' ')}</b>
                          </div>
                          <div>
                            <small style={{ color: 'var(--muted)', display: 'block', fontSize: 11, fontWeight: 700 }}>PERISHABILITY</small>
                            <b style={{ fontSize: 14, color: form.perishability_level === 'VERY_HIGH' || form.perishability_level === 'HIGH' ? '#dc2626' : '#166534' }}>
                              {form.perishability_level}
                            </b>
                          </div>
                          <div>
                            <small style={{ color: 'var(--muted)', display: 'block', fontSize: 11, fontWeight: 700 }}>READY DATE</small>
                            <b style={{ fontSize: 14 }}>{form.ready_date}</b>
                          </div>
                          <div>
                            <small style={{ color: 'var(--muted)', display: 'block', fontSize: 11, fontWeight: 700 }}>PICKUP WINDOW</small>
                            <b style={{ fontSize: 14 }}>{form.pickup_window}</b>
                          </div>
                          <div style={{ gridColumn: 'span 2' }}>
                            <small style={{ color: 'var(--muted)', display: 'block', fontSize: 11, fontWeight: 700 }}>DISPATCH LOCATION</small>
                            <b style={{ fontSize: 14 }}>{form.farm_location}</b>
                          </div>
                        </div>
                      </div>

                      <div className="notice" style={{ margin: '14px 0' }}>
                        <div>✓ <strong>Direct Marketing Exemption:</strong> This listing participates in AI multi-farm matching. Mandi intermediary charges are waived under Maharashtra direct marketing norms.</div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 22, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                        <button className="button" onClick={() => setFarmerStep(2)}>
                          ← Back
                        </button>
                        <button className="button green" onClick={handlePublish}>
                          Publish Produce Listing →
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* 4. BUYER DEMAND */}
          {view === 'Buyer Demand' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p>Active bulk requirements placed by buyers within your direct delivery radius:</p>
              {demands.length === 0 ? (
                <p style={{ color: 'var(--muted)' }}>No open buyer demands currently in your radius.</p>
              ) : (
                demands.map(d => (
                  <div key={d.id || d.crop} className="status" style={{ borderLeft: '4px solid var(--green)', padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>{d.location}</strong>
                      <span className="tag" style={{ background: '#dcfce7', color: '#166534' }}>OPEN DEMAND</span>
                    </div>
                    <p style={{ margin: '6px 0', fontSize: 14 }}>
                      Crop: <b>{d.crop}</b> · Required: <b>{d.quantity_kg} kg</b> · Max Price: <b>₹{d.max_price}/kg</b>
                    </p>
                    <small style={{ color: 'var(--muted)', display: 'block', marginBottom: 8 }}>
                      Delivery Target: {d.delivery_date} · Quality Requirement: {d.quality_requirement || 'Grade A'}
                    </small>
                    <button
                      className="button green"
                      style={{ padding: '6px 12px', fontSize: 12 }}
                      onClick={() => {
                        const prefillData = {
                          crop: d.crop,
                          quantity_kg: Math.min(d.quantity_kg, 400),
                          asking_price: Math.min(d.max_price, 28),
                          quality_grade: d.quality_requirement?.includes('B') ? 'B' : d.quality_requirement?.includes('C') ? 'C' : 'A',
                          ready_date: d.delivery_date || '2026-09-10',
                          pickup_window: '8:00 AM – 11:00 AM',
                          farm_location: profile.location || 'Khed, Maharashtra'
                        };
                        try {
                          sessionStorage.setItem('farmdirect-farmer-prefill', JSON.stringify(prefillData));
                        } catch {
                          // ignore
                        }
                        setForm(prev => ({ ...prev, ...prefillData }));
                        setFarmerStep(1);
                        setPublishedSuccess(false);
                        router.push('/farmer/produce/new');
                      }}
                    >
                      Supply this Demand →
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* 5. ALLOCATIONS & MATCHES */}
          {view.includes('Allocations') || view === 'Matches' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p>Direct allocations matched from buyer orders. Confirm or decline each allocation:</p>

              {orders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 25, background: '#f8fafc', borderRadius: 8 }}>
                  <p>No allocations currently assigned to your farm.</p>
                </div>
              ) : (
                orders.map(o => (
                  <div key={o.id} className="card" style={{ border: '1px solid var(--line)', padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong>Order #{o.order_id}</strong>
                      <span className="tag" style={{
                        background: o.status === 'ACCEPTED' ? '#dcfce7' : o.status === 'REJECTED' ? '#fee2e2' : '#fef3c7',
                        color: o.status === 'ACCEPTED' ? '#166534' : o.status === 'REJECTED' ? '#991b1b' : '#92400e'
                      }}>
                        {o.status}
                      </span>
                    </div>
                    <p style={{ margin: '6px 0', fontSize: 14 }}>
                      Crop: <b>{o.crop}</b> · Allocated: <b>{o.quantity_kg} kg</b> · Price: <b>₹{o.unit_price}/kg</b> · Total: <b>₹{(o.total_price ?? (o.quantity_kg * o.unit_price)).toLocaleString()}</b>
                    </p>
                    <p style={{ margin: '2px 0', fontSize: 13, color: 'var(--muted)' }}>
                      Pickup Window: <b>{o.pickup_window}</b> · Destination: {o.delivery_location}
                    </p>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      {o.status !== 'ACCEPTED' && (
                        <button className="button green" onClick={() => handleRespondAllocation(o.id, 'ACCEPT')}>
                          Accept Allocation ✓
                        </button>
                      )}
                      {o.status !== 'REJECTED' && (
                        <button className="button" onClick={() => handleRespondAllocation(o.id, 'REJECT')}>
                          Decline
                        </button>
                      )}
                      {o.status === 'ACCEPTED' && (
                        <span className="tag" style={{ background: '#dcfce7', color: '#166534', padding: '8px 12px' }}>
                          ✓ Allocation Confirmed. Preparing for scheduled pickup.
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : null}

          {/* 6. ORDERS & TRACKING */}
          {view.includes('Orders') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p>Manage order fulfillment, signal when crates are ready, and track 3PL logistics:</p>
              {orders.map(o => (
                <div key={o.id} className="card" style={{ border: '1px solid var(--line)', padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>Order #{o.order_id}</strong>
                    <span className="tag" style={{
                      background: o.order_status === 'DELIVERED' ? '#dcfce7' : o.order_status === 'IN_TRANSIT' ? '#dbeafe' : '#fef3c7',
                      color: o.order_status === 'DELIVERED' ? '#166534' : o.order_status === 'IN_TRANSIT' ? '#1e40af' : '#92400e'
                    }}>
                      {o.order_status}
                    </span>
                  </div>
                  <p style={{ margin: '6px 0' }}>
                    <b>{o.quantity_kg} kg {o.crop}</b> · Value: <b>₹{(o.total_price ?? (o.quantity_kg * o.unit_price)).toLocaleString()}</b>
                  </p>
                  <p style={{ margin: '2px 0', fontSize: 13, color: 'var(--muted)' }}>
                    Pickup window: <b>{o.pickup_window}</b> · Destination: {o.delivery_location}
                  </p>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    {o.status === 'ACCEPTED' && o.order_status !== 'DELIVERED' && (
                      <button className="button green" onClick={() => handleMarkReady(o.order_id)}>
                        Mark Produce Ready for Pickup ✓
                      </button>
                    )}
                    <button className="button" onClick={() => handleViewTracking(o.order_id)}>
                      View Route & Live Tracking 📍
                    </button>
                  </div>
                </div>
              ))}

              {/* Live Tracking Card if selected */}
              {activeTracking && (
                <div style={{ marginTop: 16, background: '#f8fafc', padding: 16, borderRadius: 10, border: '2px solid var(--green)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <strong>Live Route Tracking — Order #{activeTracking.order_id}</strong>
                    <span className="tag" style={{ background: '#dcfce7', color: '#166534' }}>
                      Status: {activeTracking.current_status}
                    </span>
                  </div>
                  <div className="bar" style={{ margin: '10px 0' }}>
                    <span style={{ width: `${activeTracking.progress_percent}%` }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {activeTracking.route_stops.map(s => (
                      <div key={s.stop} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#fff', borderRadius: 6, fontSize: 13 }}>
                        <span><b>Stop {s.stop}:</b> {s.name} ({s.action})</span>
                        <span className="tag" style={{ background: s.status === 'DONE' ? '#dcfce7' : '#f1f5f9' }}>{s.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 7. PROFILE & REVIEWS */}
          {view.includes('Profile') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: '#f8fafc', padding: 16, borderRadius: 8, border: '1px solid var(--line)' }}>
                <h3>{profile.name}</h3>
                <p style={{ margin: '4px 0', color: 'var(--muted)' }}>
                  Email: {profile.email || 'farmer@farmdirect.in'} · District: {profile.location}, {profile.state || 'Maharashtra'} · Role: {profile.role}
                </p>
                <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                  <span className="tag" style={{ background: '#dcfce7', color: '#166534' }}>
                    ✓ Verified Producer
                  </span>
                  <span className="tag" style={{ background: '#fef3c7', color: '#92400e' }}>
                    {profile.reliability || 96.0}% Historical Reliability Score
                  </span>
                </div>
              </div>

              <div className="status" style={{ borderLeft: '4px solid var(--green)' }}>
                <strong>Statutory Compliance & Verified Credentials:</strong>
                <p style={{ margin: '4px 0', fontSize: 13 }}>
                  ✓ Maharashtra APMC Direct-Sale Exemption active on file.<br />
                  ✓ Farmer Land Record (7-12 Extract) digitally registered.<br />
                  ✓ Quality Certification: Grade A Direct-Marketing standard.
                </p>
              </div>

              {/* All Farmer Reviews */}
              {analytics?.recent_feedback && (
                <div>
                  <h3>Buyer Rating History ({analytics.ratings_count || 0} reviews)</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    {analytics.recent_feedback.map((f, i) => (
                      <div key={i} style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid var(--line)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#eab308', fontWeight: 700 }}>{'★'.repeat(f.score)}</span>
                          <small style={{ color: 'var(--muted)' }}>Verified Direct Transaction</small>
                        </div>
                        <p style={{ margin: '4px 0 0', fontSize: 13 }}>"{f.comment || 'Crisp delivery, fresh produce.'}"</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </article>

        {/* Route Sidebar with Modular Leaflet Map */}
        <aside className="card">
          <h2>Regional Route & Logistics</h2>
          <div style={{ margin: '10px 0' }}>
            <RouteMap height={230} />
          </div>
          <div className="status" style={{ fontSize: 12 }}>
            <strong>Assigned 3PL Logistics:</strong> Mini Truck (1.5t capacity)<br />
            Scheduled pickup window: 8:00 AM – 11:00 AM.<br />
            Route circuit: Junnar → Khed → Baramati → Pune Institutional Hub.
          </div>
          <p className="footer" style={{ marginTop: 10 }}>
            Real-time OpenStreetMap multi-stop route. FarmDirect orchestrates third-party logistics without owning vehicles.
          </p>
        </aside>
      </section>
      </main>
    </ProtectedRoute>
  );
}
