'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  matchDemand, createDemand, checkCompliance, createOrder,
  requestLogisticsQuotes, selectLogisticsQuote, getTracking,
  nextTrackingEvent, submitRating, getBuyerAnalytics,
  logoutUser, getStoredUser,
  getBuyerOrders, getOrderDetails
} from '../../../lib/farmdirect-service';
import type { Match, Allocation, ComplianceCheck, LogisticsQuote, TrackingInfo, BuyerAnalytics, BuyerOrder } from '../../../lib/types';
import RouteMap, { RouteStop } from '../../../components/RouteMap';
import ProtectedRoute from '../../../components/ProtectedRoute';

type Stage = 'demand' | 'matches' | 'compliance' | 'order' | 'logistics' | 'tracking' | 'delivered';

const initialDemand = {
  crop: 'Tomatoes',
  quantity_kg: 1000,
  quality_requirement: 'A',
  max_price: 30,
  delivery_date: '2026-09-10',
  location: 'Pune Institutional Buyer Hub',
  latitude: 18.5204,
  longitude: 73.8567,
  radius_km: 120
};

const labels = [
  'Demand Creation',
  'AI Matching',
  'Compliance',
  'Order Lock',
  '3PL Quotes',
  'Live Tracking',
  'Delivery & Rating'
];

export default function BuyerDashboard() {
  const router = useRouter();
  const [buyerProfile, setBuyerProfile] = useState<any>({ name: 'Bulk Buyer', location: 'Pune' });
  const [activeTab, setActiveTab] = useState<'procurement' | 'orders'>('procurement');
  const [stage, setStage] = useState<Stage>('demand');
  const [demand, setDemand] = useState(initialDemand);
  const [matches, setMatches] = useState<Match[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [complianceChecks, setComplianceChecks] = useState<ComplianceCheck[]>([]);
  const [quotes, setQuotes] = useState<LogisticsQuote[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<string>('Mini Truck');
  const [logisticsRequestId, setLogisticsRequestId] = useState<string>('lr-demo');
  const [orderId, setOrderId] = useState<string>('');
  const [trackingInfo, setTrackingInfo] = useState<TrackingInfo | null>(null);
  const [analytics, setAnalytics] = useState<BuyerAnalytics | null>(null);
  const [buyerOrders, setBuyerOrders] = useState<BuyerOrder[]>([]);
  const [notice, setNotice] = useState('Connected to FarmDirect platform API. Ready for direct procurement.');
  const [token, setToken] = useState<string>('');

  // Rating state
  const [selectedRating, setSelectedRating] = useState<number>(5);
  const [ratingComment, setRatingComment] = useState('Excellent Grade A produce, well-packaged and delivered on time.');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [selectedFarmerToRate, setSelectedFarmerToRate] = useState<string>('');

  useEffect(() => {
    async function initAuthAndAnalytics() {
      const t = sessionStorage.getItem('farmdirect-token') || '';
      const stored = getStoredUser();
      if (stored) {
        setBuyerProfile((prev: any) => ({ ...prev, ...stored }));
      }
      setToken(t);
      if (!t) return;

      // Load analytics and orders
      const [aRes, oRes] = await Promise.all([
        getBuyerAnalytics(t),
        getBuyerOrders(t)
      ]);
      setAnalytics(aRes.analytics);
      setBuyerOrders(oRes);
    }
    initAuthAndAnalytics();
  }, []);

  const handleLogout = () => {
    logoutUser();
    router.push('/');
  };

  async function handleRunMatch() {
    setNotice(`Submitting requirement for ${demand.quantity_kg} kg ${demand.crop} and executing AI matching…`);
    // 1. Persist demand
    await createDemand(demand, token);
    // 2. Run transparent matching against active listings
    const r = await matchDemand(demand);
    setMatches(r.matches);
    setAllocations(r.allocations);

    const totalAlloc = r.allocations.reduce((a, b) => a + b.quantity_kg, 0);
    if (r.allocations.length > 0) {
      setNotice(`Matching algorithm completed: ${r.allocations.length} farm(s) allocated covering ${totalAlloc} kg of ${demand.quantity_kg} kg demand.`);
    } else {
      setNotice('No compatible listings met the criteria. Check radius and max price.');
    }
    setStage('matches');
  }

  async function handleRunCompliance() {
    setNotice(`Evaluating statutory agricultural marketing regulations for ${demand.crop} direct trade…`);
    const res = await checkCompliance(demand.crop, 'Maharashtra', 'B2B', orderId);
    setComplianceChecks(res.results);
    setNotice('Compliance review completed: Direct-sale framework verified under Maharashtra APMC deregulation.');
    setStage('compliance');
  }

  async function handleCreateOrder() {
    setNotice('Persisting order and committing multi-farm allocations in database…');
    const subtotal = allocations.reduce((sum, a) => sum + a.quantity_kg * a.price_per_kg, 0);
    const res = await createOrder({
      produce_subtotal: subtotal,
      logistics_cost: 1840,
      delivery_location: demand.location,
      allocations: allocations.map(a => ({
        listing_id: a.listing_id,
        farmer_id: a.farmer_id || 'farmer-1',
        farmer_name: a.farmer_name,
        crop: demand.crop,
        quantity_kg: a.quantity_kg,
        unit_price: a.price_per_kg,
        pickup_window: '8:00 AM - 12:00 PM'
      }))
    }, token);

    const newOrderId = res.id;
    setOrderId(newOrderId);
    setNotice(`Order #${newOrderId} confirmed in database! Requesting 3PL multi-stop freight quotes…`);

    const qRes = await requestLogisticsQuotes(demand.quantity_kg, newOrderId);
    setQuotes(qRes.quotes);
    setStage('logistics');

    // Refresh buyer orders list
    const oRes = await getBuyerOrders(token);
    setBuyerOrders(oRes);
  }

  async function handleSelectQuote(vehicle: string, quoteId: string) {
    setSelectedQuote(vehicle);
    setNotice(`Selected ${vehicle}. Confirming logistics partner and initializing live route tracking…`);
    await selectLogisticsQuote(logisticsRequestId, quoteId);
    const tRes = await getTracking(orderId);
    setTrackingInfo(tRes.tracking);
    setStage('tracking');
  }

  async function handleNextTracking() {
    const res = await nextTrackingEvent(orderId);
    const tRes = await getTracking(orderId);
    setTrackingInfo(tRes.tracking);
    setNotice(`Logistics milestone updated: ${res.status.replace(/_/g, ' ')}`);
    if (res.complete) {
      setStage('delivered');
      setNotice(`Order #${orderId} fulfilled! Produce delivered to ${demand.location}.`);
      // Select first allocated farmer for rating
      if (allocations.length > 0) {
        setSelectedFarmerToRate(allocations[0].farmer_id || 'farmer-1');
      }
    }
  }

  async function handleSubmitFeedback() {
    if (!selectedFarmerToRate && allocations.length > 0) {
      setSelectedFarmerToRate(allocations[0].farmer_id || 'farmer-1');
    }
    const targetFarmer = selectedFarmerToRate || (allocations[0]?.farmer_id || 'farmer-1');
    setNotice('Submitting rating to update farmer reliability score in database…');

    // Submit rating for selected farmer
    await submitRating(orderId, targetFarmer, selectedRating, ratingComment, token);
    setFeedbackSubmitted(true);
    setNotice(`Feedback recorded! ${selectedRating}★ review logged and farmer reliability score updated.`);

    // Refresh analytics
    const aRes = await getBuyerAnalytics(token);
    setAnalytics(aRes.analytics);
  }

  async function handleTrackExistingOrder(existingOrderId: string) {
    setActiveTab('procurement');
    setOrderId(existingOrderId);
    const tRes = await getTracking(existingOrderId);
    setTrackingInfo(tRes.tracking);
    if (tRes.tracking.complete) {
      setStage('delivered');
    } else {
      setStage('tracking');
    }
    setNotice(`Loaded live tracking for Order #${existingOrderId}`);
  }

  const totalAllocatedKg = allocations.reduce((sum, a) => sum + a.quantity_kg, 0);
  const produceSubtotal = allocations.reduce((sum, a) => sum + a.quantity_kg * a.price_per_kg, 0);
  const estLogistics = 1840;
  const grandTotal = produceSubtotal + estLogistics;

  // Build dynamic stops for RouteMap
  const dynamicMapStops: RouteStop[] = allocations.map((a, i) => ({
    name: a.farmer_name,
    lat: i === 0 ? 18.738 : i === 1 ? 18.151 : 19.208,
    lng: i === 0 ? 73.846 : i === 1 ? 74.578 : 73.875,
    action: `Pickup ${a.quantity_kg} kg · ₹${a.price_per_kg}/kg`
  }));
  if (allocations.length > 0) {
    dynamicMapStops.push({
      name: demand.location,
      lat: demand.latitude,
      lng: demand.longitude,
      action: `Final Delivery (${totalAllocatedKg} kg)`,
      isBuyer: true
    });
  }

  return (
    <ProtectedRoute allowedRoles={['BUYER']}>
      <main className="app">
        <nav className="nav" style={{ flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div className="brand" onClick={() => router.push('/buyer/dashboard')} style={{ cursor: 'pointer' }}>
              <i />FarmDirect
            </div>
            <span className="portal-badge buyer">
              🏢 Bulk Buyer Workspace
            </span>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="user-welcome-text">
              Welcome, <strong>{buyerProfile.name || 'Bulk Buyer'}</strong>
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

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <button
          className="tag"
          style={{
            background: activeTab === 'procurement' ? 'var(--green)' : '#f1f5f9',
            color: activeTab === 'procurement' ? '#fff' : 'inherit',
            fontSize: 13,
            padding: '8px 16px',
            cursor: 'pointer'
          }}
          onClick={() => setActiveTab('procurement')}
        >
          Procurement Workflow
        </button>
        <button
          className="tag"
          style={{
            background: activeTab === 'orders' ? 'var(--green)' : '#f1f5f9',
            color: activeTab === 'orders' ? '#fff' : 'inherit',
            fontSize: 13,
            padding: '8px 16px',
            cursor: 'pointer'
          }}
          onClick={() => setActiveTab('orders')}
        >
          My Orders ({buyerOrders.length})
        </button>
      </div>

      {activeTab === 'orders' ? (
        <section className="card">
          <h2>My Procurement Orders</h2>
          <p style={{ margin: '4px 0 16px', color: 'var(--muted)' }}>
            All confirmed direct-to-farm orders, allocation responses, and delivery states.
          </p>

          {buyerOrders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, background: '#f8fafc', borderRadius: 8 }}>
              <p>No orders placed yet.</p>
              <button className="button green" onClick={() => setActiveTab('procurement')} style={{ marginTop: 10 }}>
                Start New Procurement →
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {buyerOrders.map(ord => (
                <div key={ord.id} className="card" style={{ border: '1px solid var(--line)', padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <strong style={{ fontSize: 16 }}>Order #{ord.id}</strong>
                      <span className="tag" style={{ marginLeft: 8, background: ord.status === 'DELIVERED' ? '#dcfce7' : '#dbeafe', color: ord.status === 'DELIVERED' ? '#166534' : '#1e40af' }}>
                        {ord.status}
                      </span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--green)' }}>₹{ord.total.toLocaleString()}</span>
                      <small style={{ display: 'block', color: 'var(--muted)' }}>Delivery: {ord.delivery_location}</small>
                    </div>
                  </div>

                  {/* Allocation Items */}
                  <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                    <small style={{ fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                      FARM ALLOCATIONS ({ord.items?.length || 0} FARMS):
                    </small>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {ord.items?.map(it => (
                        <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, background: '#f8fafc', padding: '6px 10px', borderRadius: 6 }}>
                          <span>
                            <b>{it.farmer_name || `Farmer ${it.farmer_id}`}</b>: {it.quantity_kg} kg {it.crop} @ ₹{it.unit_price}/kg
                          </span>
                          <span className="tag" style={{
                            fontSize: 11,
                            background: it.status === 'ACCEPTED' ? '#dcfce7' : it.status === 'REJECTED' ? '#fee2e2' : '#fef3c7',
                            color: it.status === 'ACCEPTED' ? '#166534' : it.status === 'REJECTED' ? '#991b1b' : '#92400e'
                          }}>
                            {it.status === 'ACCEPTED' ? '✓ Accepted by Farmer' : it.status === 'REJECTED' ? '✕ Declined' : '⏳ Awaiting Acceptance'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                    <button
                      className="button green"
                      style={{ padding: '6px 14px', fontSize: 12 }}
                      onClick={() => handleTrackExistingOrder(ord.id)}
                    >
                      Track Live Logistics 📍
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          {/* Header Status & Workflow Stepper */}
          <section className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h1>Direct Farm-to-Buyer Procurement</h1>
                <p>Transparent multi-farm allocation, statutory direct-sale compliance, and 3PL orchestration.</p>
              </div>
              <button className="button" onClick={() => { setStage('demand'); setDemand(initialDemand); setFeedbackSubmitted(false); setMatches([]); setAllocations([]); }}>
                New Procurement ↺
              </button>
            </div>

            <div className="grid" style={{ marginTop: 14 }}>
              {labels.map((stepLabel, idx) => {
                const stepOrder: Stage[] = ['demand', 'matches', 'compliance', 'order', 'logistics', 'tracking', 'delivered'];
                const activeIdx = stepOrder.indexOf(stage);
                const isCompleted = idx < activeIdx;
                const isCurrent = idx === activeIdx;
                return (
                  <article className="metric" key={stepLabel} style={{ borderLeft: isCurrent ? '3px solid var(--green)' : '1px solid var(--line)' }}>
                    <small>STEP {idx + 1}</small>
                    <b style={{ fontSize: 13, color: isCurrent ? 'var(--green)' : isCompleted ? '#333' : 'var(--muted)' }}>
                      {isCompleted ? '✓ ' : ''}{stepLabel}
                    </b>
                  </article>
                );
              })}
            </div>

            <div className="notice" style={{ marginTop: 12 }}>✦ {notice}</div>
          </section>

          {/* Main Content Layout */}
          <section className="content" style={{ marginTop: 14 }}>
            <article className="card">
              {/* STEP 1: CREATE DEMAND */}
              {stage === 'demand' && (
                <>
                  <h2>Create Bulk Buyer Demand</h2>
                  <p>Specify crop requirement, target quantity, maximum acceptable price, and delivery destination.</p>

                  <div className="form" style={{ marginTop: 12 }}>
                    <label className="field">
                      Crop Required
                      <input
                        value={demand.crop}
                        onChange={e => setDemand({ ...demand, crop: e.target.value })}
                        placeholder="e.g. Tomatoes, Onions, Spinach"
                      />
                    </label>

                    <label className="field">
                      Required Quantity (kg)
                      <input
                        type="number"
                        value={demand.quantity_kg}
                        onChange={e => setDemand({ ...demand, quantity_kg: Number(e.target.value) })}
                      />
                    </label>

                    <label className="field">
                      Maximum Price / kg (₹)
                      <input
                        type="number"
                        value={demand.max_price}
                        onChange={e => setDemand({ ...demand, max_price: Number(e.target.value) })}
                      />
                    </label>

                    <label className="field">
                      Target Delivery Date
                      <input
                        type="date"
                        value={demand.delivery_date}
                        onChange={e => setDemand({ ...demand, delivery_date: e.target.value })}
                      />
                    </label>

                    <label className="field" style={{ gridColumn: 'span 2' }}>
                      Delivery Destination Hub
                      <input
                        value={demand.location}
                        onChange={e => setDemand({ ...demand, location: e.target.value })}
                      />
                    </label>
                  </div>

                  <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
                    <button className="button green" onClick={handleRunMatch}>
                      Find Best Matches & Generate Allocation →
                    </button>
                  </div>
                </>
              )}

              {/* STEP 2: AI MATCHES & ALLOCATION */}
              {stage === 'matches' && (
                <>
                  <h2>Transparent Multi-Farm Allocation</h2>
                  <p>
                    Requirement: <b>{demand.quantity_kg} kg {demand.crop}</b> · Total Allocated: <b>{totalAllocatedKg} kg</b> across <b>{allocations.length} farm(s)</b>.
                  </p>

                  {/* Route Map Preview */}
                  <div style={{ margin: '14px 0' }}>
                    <RouteMap height={220} stops={dynamicMapStops} />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {matches.length === 0 ? (
                      <p>No listings matched. Try increasing your search radius or maximum price.</p>
                    ) : (
                      matches.map(m => (
                        <div className="match" key={m.listing.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                            <div className="score" style={{ '--s': `${m.score.overall}%` } as React.CSSProperties}>
                              <span>{Math.round(m.score.overall)}%</span>
                            </div>
                            <div>
                              <strong>{m.listing.farmer_name}</strong>
                              <p style={{ margin: '3px 0' }}>
                                <b>{m.listing.quantity_kg} kg allocated</b> · ₹{m.listing.asking_price}/kg · {m.distance_km} km away · Grade {m.listing.quality_grade}
                              </p>
                              <small style={{ color: 'var(--muted)' }}>
                                {m.explanation || `Distance: ${m.score.distance}% · Price: ${m.score.price}% · Reliability: ${m.score.reliability}%`}
                              </small>
                            </div>
                          </div>
                          <span className="tag" style={{ background: '#dcfce7', color: '#166534' }}>
                            {m.listing.reliability}% Reliable
                          </span>
                        </div>
                      ))
                    )}
                  </div>

                  <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
                    <button className="button green" onClick={handleRunCompliance} disabled={allocations.length === 0}>
                      Proceed to Compliance Verification →
                    </button>
                    <button className="button" onClick={() => setStage('demand')}>Back</button>
                  </div>
                </>
              )}

              {/* STEP 3: COMPLIANCE ASSESSMENT */}
              {stage === 'compliance' && (
                <>
                  <h2>Statutory Compliance Verification</h2>
                  <p>Direct farm-to-buyer marketing verified against Maharashtra State Agricultural Produce rules.</p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '14px 0' }}>
                    {complianceChecks.map(c => (
                      <div key={c.rule} className="status" style={{ borderLeft: c.status === 'PASSED' ? '4px solid #10b981' : '4px solid #f59e0b' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <strong>{c.rule}</strong>
                          <span className="tag" style={{ background: c.status === 'PASSED' ? '#dcfce7' : '#fef3c7' }}>
                            {c.status}
                          </span>
                        </div>
                        <p style={{ margin: '4px 0', fontSize: 13 }}>{c.reason}</p>
                        {c.required_documents?.length > 0 && (
                          <small style={{ color: 'var(--muted)' }}>Required Verification: {c.required_documents.join(', ')}</small>
                        )}
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
                    <button className="button green" onClick={() => setStage('order')}>
                      Lock Compliance & Review Order →
                    </button>
                    <button className="button" onClick={() => setStage('matches')}>Back</button>
                  </div>
                </>
              )}

              {/* STEP 4: ORDER CONFIRMATION */}
              {stage === 'order' && (
                <>
                  <h2>Review & Confirm Direct Order</h2>
                  <p>Zero broker markup. Direct farmer settlement orchestrated with third-party logistics.</p>

                  <div style={{ background: '#f8fafc', padding: 16, borderRadius: 8, margin: '14px 0', border: '1px solid var(--line)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span>Produce Subtotal ({totalAllocatedKg} kg across {allocations.length} farm(s)):</span>
                      <strong>₹{produceSubtotal.toLocaleString()}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span>Estimated 3PL Freight & Handling:</span>
                      <strong>₹{estLogistics.toLocaleString()}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: 8, fontSize: 18 }}>
                      <span><b>Total Order Value:</b></span>
                      <span style={{ color: 'var(--green)', fontWeight: 800 }}>₹{grandTotal.toLocaleString()}</span>
                    </div>
                  </div>

                  <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
                    <button className="button green" onClick={handleCreateOrder}>
                      Confirm Order & Request 3PL Quotes →
                    </button>
                    <button className="button" onClick={() => setStage('compliance')}>Back</button>
                  </div>
                </>
              )}

              {/* STEP 5: 3PL LOGISTICS QUOTES */}
              {stage === 'logistics' && (
                <>
                  <h2>Select 3PL Freight Partner</h2>
                  <p>Independent third-party logistics options for multi-farm pickup circuit to {demand.location}.</p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '14px 0' }}>
                    {quotes.map((q, idx) => (
                      <div
                        key={q.vehicle}
                        className="status"
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          borderLeft: '4px solid var(--green)'
                        }}
                      >
                        <div>
                          <strong>{q.vehicle} — {q.partner}</strong>
                          <p style={{ margin: '3px 0' }}>
                            Capacity: {q.capacity_kg} kg · Transit ETA: {Math.floor(q.eta_minutes / 60)}h {q.eta_minutes % 60}m
                          </p>
                          <small style={{ color: 'var(--muted)' }}>Optimized multi-stop routing compliant with perishables</small>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--green)' }}>₹{q.cost.toLocaleString()}</div>
                          <button
                            className="button green"
                            style={{ marginTop: 6 }}
                            onClick={() => handleSelectQuote(q.vehicle, `lq-${idx + 1}`)}
                          >
                            Book {q.vehicle} →
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* STEP 6: LIVE TRACKING & ROUTE MAP */}
              {stage === 'tracking' && (
                <>
                  <h2>Live Order & Logistics Tracking</h2>
                  <p>Order ID: <b>{orderId}</b> · Assigned Vehicle: <b>{selectedQuote}</b></p>

                  <div style={{ margin: '14px 0' }}>
                    <RouteMap height={240} stops={dynamicMapStops} />
                  </div>

                  {/* Progress Bar */}
                  <div style={{ margin: '14px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <small>Status: <b>{trackingInfo?.current_status?.replace(/_/g, ' ') || 'VEHICLE ASSIGNED'}</b></small>
                      <small>Progress: <b>{trackingInfo?.progress_percent || 37}%</b></small>
                    </div>
                    <div className="bar">
                      <span style={{ width: `${trackingInfo?.progress_percent || 37}%` }} />
                    </div>
                  </div>

                  {/* Route Stops */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '12px 0' }}>
                    {trackingInfo?.route_stops?.map(s => (
                      <div key={s.stop} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', background: '#f8fafc', borderRadius: 6, fontSize: 13 }}>
                        <span><b>Stop {s.stop}:</b> {s.name} ({s.action})</span>
                        <span className="tag" style={{ background: s.status === 'DONE' ? '#dcfce7' : s.status === 'DELIVERED' ? '#dcfce7' : '#f1f5f9' }}>
                          {s.status}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
                    <button className="button green" onClick={handleNextTracking}>
                      Simulate 3PL GPS Transit Event →
                    </button>
                  </div>
                </>
              )}

              {/* STEP 7: DELIVERED & INTERACTIVE FEEDBACK */}
              {stage === 'delivered' && (
                <>
                  <h2>Delivery Fulfilled & Farmer Rating</h2>
                  <div className="status" style={{ borderLeft: '4px solid #10b981', background: '#f0fdf4' }}>
                    <strong>✓ Delivery Confirmed</strong>
                    <p style={{ margin: '3px 0' }}>
                      {totalAllocatedKg} kg Grade A {demand.crop} received at {demand.location}.
                    </p>
                  </div>

                  {!feedbackSubmitted ? (
                    <div style={{ marginTop: 16 }}>
                      <h3>Rate Participating Farms</h3>
                      <p style={{ fontSize: 13, color: 'var(--muted)' }}>
                        Your verified rating directly updates the farmer's reliability score in the marketplace database.
                      </p>

                      {allocations.length > 1 && (
                        <label className="field" style={{ marginTop: 10 }}>
                          Select Farm to Review
                          <select
                            value={selectedFarmerToRate}
                            onChange={e => setSelectedFarmerToRate(e.target.value)}
                          >
                            {allocations.map(a => (
                              <option key={a.farmer_id} value={a.farmer_id}>
                                {a.farmer_name} ({a.quantity_kg} kg)
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      {/* Interactive Star Rating */}
                      <div style={{ margin: '12px 0' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 4 }}>Select Rating:</span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {[1, 2, 3, 4, 5].map(star => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => setSelectedRating(star)}
                              style={{
                                fontSize: 24,
                                background: 'none',
                                color: star <= selectedRating ? '#eab308' : '#d1d5db',
                                padding: 0
                              }}
                            >
                              ★
                            </button>
                          ))}
                          <span style={{ marginLeft: 8, fontSize: 14, fontWeight: 700, alignSelf: 'center' }}>
                            {selectedRating} / 5 Stars
                          </span>
                        </div>
                      </div>

                      <div className="form">
                        <label className="field" style={{ gridColumn: 'span 2' }}>
                          Written Review
                          <input
                            value={ratingComment}
                            onChange={e => setRatingComment(e.target.value)}
                            placeholder="Share notes on crop freshness, grade accuracy, or packaging…"
                          />
                        </label>
                      </div>

                      <button className="button green" style={{ marginTop: 12 }} onClick={handleSubmitFeedback}>
                        Submit Verified Rating ★
                      </button>
                    </div>
                  ) : (
                    <div className="notice" style={{ marginTop: 14 }}>
                      ✓ Rating recorded in database! Participating farmer reliability score has been updated in real-time.
                      <div style={{ marginTop: 10 }}>
                        <button className="button green" onClick={() => setActiveTab('orders')}>
                          View in My Orders →
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </article>

            {/* Sidebar: Buyer Analytics */}
            <aside className="card">
              <h2>Procurement Intelligence</h2>

              <div className="status" style={{ margin: '10px 0' }}>
                <strong>Market Price Intelligence</strong>
                <p style={{ margin: '3px 0' }}>Pune Tomatoes: Avg ₹26–₹28/kg</p>
                <small style={{ color: 'var(--muted)' }}>Direct trade saving ~18% vs mandi wholesale</small>
              </div>

              <div style={{ marginTop: 14 }}>
                <h3>Buyer Analytics</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                  <div className="metric">
                    <small>TOTAL DEMAND</small>
                    <b>{(analytics?.total_demand_kg ?? 0).toLocaleString()} kg</b>
                  </div>
                  <div className="metric">
                    <small>ORDERS PLACED</small>
                    <b>{analytics?.orders_count ?? buyerOrders.length}</b>
                  </div>
                  <div className="metric">
                    <small>TOTAL SPEND</small>
                    <b>₹{(analytics?.total_spend ?? 0).toLocaleString()}</b>
                  </div>
                  <div className="metric">
                    <small>FULFILLMENT</small>
                    <b style={{ color: 'var(--green)' }}>{analytics?.fulfillment_rate ?? 98.2}%</b>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 18, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                <small style={{ color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                  <strong>Platform Principle:</strong> FarmDirect orchestrates farmer-to-buyer transactions directly without inventory ownership.
                </small>
                <button
                  type="button"
                  className="button"
                  style={{ width: '100%' }}
                  onClick={handleLogout}
                >
                  Switch Account (Logout) →
                </button>
              </div>
            </aside>
          </section>
        </>
      )}
      </main>
    </ProtectedRoute>
  );
}
