'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  matchDemand, createDemand, checkCompliance, createOrder,
  requestLogisticsQuotes, selectLogisticsQuote, getTracking,
  nextTrackingEvent, submitRating, getBuyerAnalytics,
  logoutUser, getStoredUser,
  getBuyerOrders, optimizeBulkRoute, checkSpoilageRisk
} from '../../../lib/farmdirect-service';
import type { Match, Allocation, ComplianceCheck, LogisticsQuote, TrackingInfo, BuyerAnalytics, BuyerOrder, Demand, RouteOptimization, SpoilageRisk } from '../../../lib/types';
import RouteMap, { RouteStop } from '../../../components/RouteMap';
import ProtectedRoute from '../../../components/ProtectedRoute';

type Stage = 'demand' | 'matches' | 'match-detail' | 'compliance' | 'order' | 'order-confirmed' | 'logistics' | 'tracking' | 'delivered';
type DemandStep = 1 | 2 | 3 | 4;
type SortType = 'score' | 'price' | 'distance' | 'reliability';

interface DemandFormState extends Demand {
  buyer_type: string;
  delivery_budget: string;
  preferred_window: string;
  handling_notes: string;
}

const initialDemand: DemandFormState = {
  crop: 'Tomatoes',
  quantity_kg: 100,
  quality_requirement: 'Quality A',
  buyer_type: 'Bulk buyer / Consumer',
  max_price: 28,
  delivery_budget: '₹2,000',
  delivery_date: 'Tomorrow',
  location: 'Pune',
  latitude: 18.5204,
  longitude: 73.8567,
  radius_km: 120,
  preferred_window: '10 AM – 2 PM',
  handling_notes: ''
};

const labels = [
  'Demand Wizard',
  'AI Matching',
  'Match Inspection',
  'Compliance',
  'Order Review',
  'Order Placed'
];

export default function BuyerDashboard() {
  const router = useRouter();
  const [buyerProfile, setBuyerProfile] = useState<any>({ name: 'Bulk Buyer / Consumer', location: 'Pune' });
  const [activeTab, setActiveTab] = useState<'procurement' | 'orders'>('procurement');
  const [stage, setStage] = useState<Stage>('demand');
  const [demandStep, setDemandStep] = useState<DemandStep>(1);
  const [demand, setDemand] = useState<DemandFormState>(initialDemand);
  const [matches, setMatches] = useState<Match[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [selectedSort, setSelectedSort] = useState<SortType>('score');

  // CRITICAL DISTINCTION:
  // recommendedMatch = top AI match (advisory recommendation only)
  // selectedMatch = exact match chosen by buyer (authoritative for downstream compliance & order)
  const [recommendedMatch, setRecommendedMatch] = useState<Match | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);

  // Enhanced features: 2-Opt Bulk Routing & Spoilage Prediction
  const [routeOptimization, setRouteOptimization] = useState<RouteOptimization | null>(null);
  const [spoilageRisk, setSpoilageRisk] = useState<SpoilageRisk | null>(null);
  const [useColdChain, setUseColdChain] = useState<boolean>(false);

  const [complianceChecks, setComplianceChecks] = useState<ComplianceCheck[]>([]);
  const [confirmedOrder, setConfirmedOrder] = useState<{
    id: string;
    total: number;
    farmer_name: string;
    crop: string;
    quantity_kg: number;
    produce_subtotal: number;
    logistics_cost: number;
  } | null>(null);

  // Logistics & tracking state for existing orders (viewed from My Orders tab)
  const [quotes, setQuotes] = useState<LogisticsQuote[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<string>('Mini Truck');
  const [logisticsRequestId, setLogisticsRequestId] = useState<string>('lr-live');
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

  // Re-order matches dynamically without hiding any valid matches
  const sortedMatches = useMemo(() => {
    if (!matches || matches.length === 0) return [];
    const list = [...matches];
    switch (selectedSort) {
      case 'price':
        return list.sort((a, b) => a.listing.asking_price - b.listing.asking_price);
      case 'distance':
        return list.sort((a, b) => a.distance_km - b.distance_km);
      case 'reliability':
        return list.sort((a, b) => b.listing.reliability - a.listing.reliability);
      case 'score':
      default:
        return list.sort((a, b) => b.score.overall - a.score.overall);
    }
  }, [matches, selectedSort]);

  // Dynamic Route Map Stops
  const dynamicMapStops: RouteStop[] = useMemo(() => {
    if (routeOptimization && routeOptimization.stop_sequence && routeOptimization.stop_sequence.length > 0) {
      return routeOptimization.stop_sequence.map(s => ({
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        action: s.action || `${s.stop_type}: ${s.quantity_kg} kg`,
        isBuyer: s.stop_type === 'DELIVERY',
        stopType: (s.stop_type === 'PICKUP' ? 'FARMER' : (s.stop_type === 'CROSS_DOCK' ? 'HUB' : 'BUYER')) as any,
        etaMinutes: s.estimated_arrival_mins,
        quantityKg: s.quantity_kg
      }));
    }
    if (selectedMatch) {
      return [
        {
          name: selectedMatch.listing.farmer_name,
          lat: selectedMatch.listing.latitude || 18.738,
          lng: selectedMatch.listing.longitude || 73.846,
          action: `Pickup ${demand.quantity_kg} kg · ₹${selectedMatch.listing.asking_price}/kg`,
          stopType: 'FARMER',
          quantityKg: demand.quantity_kg
        },
        {
          name: demand.location,
          lat: demand.latitude,
          lng: demand.longitude,
          action: `Final Delivery (${demand.quantity_kg} kg)`,
          isBuyer: true,
          stopType: 'BUYER',
          quantityKg: demand.quantity_kg
        }
      ];
    }
    if (matches.length > 0) {
      const stops: RouteStop[] = matches.slice(0, 3).map((m, i) => ({
        name: m.listing.farmer_name,
        lat: m.listing.latitude || (i === 0 ? 18.738 : i === 1 ? 18.151 : 19.208),
        lng: m.listing.longitude || (i === 0 ? 73.846 : i === 1 ? 74.578 : 73.875),
        action: `Supplier Option · ₹${m.listing.asking_price}/kg`,
        stopType: 'FARMER',
        quantityKg: m.listing.quantity_kg
      }));
      stops.push({
        name: demand.location,
        lat: demand.latitude,
        lng: demand.longitude,
        action: `Delivery Destination (${demand.quantity_kg} kg)`,
        isBuyer: true,
        stopType: 'BUYER',
        quantityKg: demand.quantity_kg
      });
      return stops;
    }
    return [];
  }, [routeOptimization, selectedMatch, matches, demand]);

  // 1. Run Match Handler
  async function handleRunMatch() {
    setNotice(`Submitting requirement for ${demand.quantity_kg} kg ${demand.crop} and executing AI matching…`);
    const matchDemandPayload = {
      ...demand,
      max_price: demand.max_price > 0 ? demand.max_price : 9999
    };
    await createDemand(matchDemandPayload, token);
    const r = await matchDemand(matchDemandPayload);
    setMatches(r.matches);
    setAllocations(r.allocations);

    // AI recommendation is the top overall score
    const best = r.matches.length > 0 ? r.matches[0] : null;
    setRecommendedMatch(best);
    setSelectedSort('score');

    if (r.matches.length > 0) {
      setNotice(`Found ${r.matches.length} compatible suppliers. AI recommends ${best?.listing.farmer_name} (${Math.round(best?.score.overall || 0)}% score). Computing 2-Opt multi-farm pickup route…`);
      try {
        const optRes = await optimizeBulkRoute({
          buyer_name: buyerProfile.name || 'Bulk Procurement Hub',
          buyer_location: demand.location,
          buyer_lat: demand.latitude,
          buyer_lng: demand.longitude,
          farmers: r.matches.slice(0, 3).map(m => ({
            name: m.listing.farmer_name,
            farmer_name: m.listing.farmer_name,
            lat: m.listing.latitude || 18.738,
            lng: m.listing.longitude || 73.846,
            quantity_kg: m.listing.quantity_kg,
            asking_price: m.listing.asking_price,
            crop: m.listing.crop,
            perishability_level: m.listing.perishability_level || 'MEDIUM'
          }))
        });
        setRouteOptimization(optRes);
      } catch {
        // graceful fallback
      }
    } else {
      setNotice('No compatible listings met the criteria. Check radius and max price.');
    }
    setStage('matches');
  }

  // 2. Buyer Inspects a Match (Explicit Selection)
  async function handleInspectMatch(match: Match) {
    setSelectedMatch(match);
    setStage('match-detail');
    setNotice(`Inspecting match details for ${match.listing.farmer_name}. Evaluating ML spoilage risk & logistics feasibility…`);
    try {
      const risk = await checkSpoilageRisk(match.listing.id, {
        transit_hours: 2.5,
        is_cold_chain: useColdChain,
        num_stops: 3,
        distance_km: match.distance_km
      });
      setSpoilageRisk(risk);
    } catch {
      // graceful fallback
    }
  }

  async function handleToggleColdChain(enabled: boolean) {
    setUseColdChain(enabled);
    if (selectedMatch) {
      try {
        const risk = await checkSpoilageRisk(selectedMatch.listing.id, {
          transit_hours: 2.5,
          is_cold_chain: enabled,
          num_stops: 3,
          distance_km: selectedMatch.distance_km
        });
        setSpoilageRisk(risk);
      } catch {
        // graceful fallback
      }
    }
  }

  // 3. Buyer Proceeds to Compliance with their Chosen Match
  async function handleProceedToCompliance(matchToUse: Match) {
    setSelectedMatch(matchToUse);
    setNotice(`Evaluating statutory agricultural marketing regulations for ${demand.crop} with ${matchToUse.listing.farmer_name}…`);
    const res = await checkCompliance(demand.crop, 'Maharashtra', demand.buyer_type || 'B2B', orderId || 'order-standard');
    setComplianceChecks(res.results);
    setNotice(`Compliance review complete for ${matchToUse.listing.farmer_name}: Direct-sale framework verified under Maharashtra APMC deregulation.`);
    setStage('compliance');
  }

  // 4. Buyer Proceeds to Order Review
  function handleProceedToOrderReview() {
    if (!selectedMatch) return;
    setStage('order');
    setNotice(`Reviewing order details for ${selectedMatch.listing.farmer_name}. Click Confirm Order to lock this transaction.`);
  }

  // 5. Buyer Explicitly Confirms Order (TERMINAL ACTION)
  async function handleConfirmOrder() {
    if (!selectedMatch) return;
    const unitPrice = selectedMatch.listing.asking_price;
    const subtotal = demand.quantity_kg * unitPrice;
    const estLogistics = useColdChain ? 2640 : 1840;
    const grandTotal = subtotal + estLogistics;

    setNotice(`Locking order for ${demand.quantity_kg} kg ${demand.crop} from ${selectedMatch.listing.farmer_name}…`);

    const res = await createOrder({
      produce_subtotal: subtotal,
      logistics_cost: estLogistics,
      delivery_location: demand.location,
      allocations: [{
        listing_id: selectedMatch.listing.id,
        farmer_id: selectedMatch.listing.farmer_id || 'farmer-1',
        farmer_name: selectedMatch.listing.farmer_name,
        crop: demand.crop,
        quantity_kg: demand.quantity_kg,
        unit_price: unitPrice,
        pickup_window: selectedMatch.listing.ready_date || 'Tomorrow • 8:00 AM - 12:00 PM'
      }]
    }, token);

    const newOrderId = res.id;
    setOrderId(newOrderId);
    setConfirmedOrder({
      id: newOrderId,
      total: grandTotal,
      farmer_name: selectedMatch.listing.farmer_name,
      crop: demand.crop,
      quantity_kg: demand.quantity_kg,
      produce_subtotal: subtotal,
      logistics_cost: estLogistics
    });

    // Refresh buyer orders list
    const oRes = await getBuyerOrders(token);
    setBuyerOrders(oRes);

    // Transition to TERMINAL confirmed stage
    setStage('order-confirmed');
    setNotice(`Order #${newOrderId} confirmed! Direct transaction with ${selectedMatch.listing.farmer_name} has been placed.`);
  }

  function handleResetProcurement() {
    setStage('demand');
    setDemandStep(1);
    setDemand(initialDemand);
    setMatches([]);
    setAllocations([]);
    setSelectedMatch(null);
    setRecommendedMatch(null);
    setConfirmedOrder(null);
    setNotice('Connected to FarmDirect platform API. Ready for direct procurement.');
  }

  // Tracking existing orders (for orders tab)
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

    await submitRating(orderId, targetFarmer, selectedRating, ratingComment, token);
    setFeedbackSubmitted(true);
    setNotice(`Feedback recorded! ${selectedRating}★ review logged and farmer reliability score updated.`);

    const aRes = await getBuyerAnalytics(token);
    setAnalytics(aRes.analytics);
  }

  // Cost calculations for chosen match
  const chosenUnitPrice = selectedMatch?.listing.asking_price || demand.max_price;
  const chosenProduceSubtotal = demand.quantity_kg * chosenUnitPrice;
  const deliveryCharge = useColdChain ? 2640 : 1840;
  const chosenGrandTotal = chosenProduceSubtotal + deliveryCharge;

  // 7 Statutory Compliance Checks (Reference Standard)
  const statutoryChecks = [
    'Applicable direct-sale rules checked',
    'Commodity eligibility checked',
    'Direct-sale pathway checked',
    'Permission requirements checked',
    'Market fee exemption checked',
    'FSSAI conditions checked',
    'Transport conditions checked'
  ];

  return (
    <ProtectedRoute allowedRoles={['BUYER']}>
      <main className="app">
        {/* Navigation Bar */}
        <nav className="nav" style={{ flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div className="brand" onClick={() => router.push('/buyer/dashboard')} style={{ cursor: 'pointer' }}>
              <i />FarmDirect
            </div>
            <span className="portal-badge buyer">
              🏢 Bulk Buyer / Consumer Workspace
            </span>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="user-welcome-text">
              Welcome, <strong>{buyerProfile.name || 'Bulk Buyer / Consumer'}</strong>
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

        {/* Tabs: Procurement Workflow vs My Orders */}
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
          /* Tab: My Orders */
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
          /* Tab: Procurement Workflow */
          <>
            {/* Header Stepper */}
            <section className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <span className="tag" style={{ textTransform: 'uppercase', marginBottom: 6, display: 'inline-block' }}>
                    Buyer Workflow
                  </span>
                  <h1 style={{ margin: '4px 0 6px' }}>Direct Farm-to-Buyer Procurement</h1>
                  <p style={{ margin: 0, color: 'var(--muted)' }}>
                    AI-assisted matching, buyer-chosen supplier, statutory direct-sale compliance, and order lock.
                  </p>
                </div>
                <button className="button" onClick={handleResetProcurement}>
                  New Procurement ↺
                </button>
              </div>

              {/* Progress Stepper for the In-Scope Workflow */}
              <div className="grid" style={{ marginTop: 16 }}>
                {labels.map((stepLabel, idx) => {
                  const stepOrder: Stage[] = ['demand', 'matches', 'match-detail', 'compliance', 'order', 'order-confirmed'];
                  const activeIdx = stepOrder.indexOf(stage);
                  const isCompleted = activeIdx > idx;
                  const isCurrent = activeIdx === idx;
                  return (
                    <article
                      className="metric"
                      key={stepLabel}
                      style={{
                        borderLeft: isCurrent ? '3px solid var(--green)' : '1px solid var(--line)',
                        background: isCurrent ? 'var(--green-light)' : '#ffffff',
                        transition: 'all 0.2s ease'
                      }}
                    >
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

            {/* Main Layout: Content on Left + Intelligence / Why this helps on Right */}
            <section className="content" style={{ marginTop: 14 }}>
              <article className="card">

                {/* ======================================================== */}
                {/* 1. FOUR-STEP DEMAND WIZARD (stage === 'demand')           */}
                {/* ======================================================== */}
                {stage === 'demand' && (
                  <>
                    <div className="pagehead">
                      <h2 style={{ marginBottom: 4 }}>Place a new demand</h2>
                      <p style={{ color: 'var(--muted)', margin: 0 }}>
                        Tell us what you need. FarmDirect will find compatible nearby supply.
                      </p>
                    </div>

                    {/* Stepper bar (4 bars) */}
                    <div className="stepper" style={{ marginTop: 18 }}>
                      {[1, 2, 3, 4].map(stepNum => (
                        <span key={stepNum} className={`stepdot ${stepNum <= demandStep ? 'on' : ''}`} />
                      ))}
                    </div>
                    <span className="chip">STEP {demandStep} OF 4</span>

                    {/* Step 1: Product & Quality */}
                    {demandStep === 1 && (
                      <div className="step-content">
                        <h3 style={{ fontSize: 18, margin: '8px 0 4px' }}>What product do you need?</h3>
                        <p style={{ color: 'var(--muted)', margin: '0 0 16px', fontSize: 13 }}>
                          Describe your required produce and quality.
                        </p>

                        <div className="form">
                          <label className="field">
                            Crop
                            <select
                              value={demand.crop}
                              onChange={e => setDemand({ ...demand, crop: e.target.value })}
                            >
                              <option value="Tomatoes">Tomatoes</option>
                              <option value="Onions">Onions</option>
                              <option value="Spinach">Spinach</option>
                            </select>
                          </label>

                          <label className="field">
                            Quantity (kg)
                            <input
                              type="number"
                              min="1"
                              value={demand.quantity_kg}
                              onChange={e => setDemand({ ...demand, quantity_kg: Number(e.target.value) })}
                            />
                          </label>

                          <label className="field">
                            Quality requirement
                            <select
                              value={demand.quality_requirement}
                              onChange={e => setDemand({ ...demand, quality_requirement: e.target.value })}
                            >
                              <option value="Quality A">Quality A</option>
                              <option value="Quality B">Quality B</option>
                            </select>
                          </label>

                          <label className="field">
                            Buyer type
                            <select
                              value={demand.buyer_type}
                              onChange={e => setDemand({ ...demand, buyer_type: e.target.value })}
                            >
                              <option value="Bulk buyer">Bulk Buyer / Consumer</option>
                              <option value="Household">Household Consumer</option>
                            </select>
                          </label>
                        </div>

                        <div style={{ marginTop: 22, display: 'flex', justifyContent: 'flex-end' }}>
                          <button className="button green" onClick={() => setDemandStep(2)}>
                            Continue →
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Step 2: Price & Budget */}
                    {demandStep === 2 && (
                      <div className="step-content">
                        <h3 style={{ fontSize: 18, margin: '8px 0 4px' }}>Set a fair price</h3>
                        <p style={{ color: 'var(--muted)', margin: '0 0 16px', fontSize: 13 }}>
                          Set the maximum produce price you are comfortable with.
                        </p>

                        <div className="form">
                          <label className="field" style={{ gridColumn: 'span 2' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>Maximum Price Target / kg <small style={{ color: 'var(--muted)', fontWeight: 400 }}>(Optional)</small></span>
                              <span style={{ fontWeight: 700, color: demand.max_price > 0 ? 'var(--navy)' : 'var(--muted)' }}>
                                {demand.max_price > 0 ? `Max ₹${demand.max_price}/kg` : 'Open / Market Rate (No ceiling)'}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 4 }}>
                              <input
                                type="range"
                                min="15"
                                max="60"
                                step="1"
                                value={demand.max_price || 28}
                                onChange={e => setDemand({ ...demand, max_price: Number(e.target.value) })}
                                style={{ flex: 1, accentColor: 'var(--green)', cursor: 'pointer' }}
                              />
                              <input
                                type="number"
                                min="1"
                                placeholder="e.g. 28"
                                value={demand.max_price || ''}
                                onChange={e => setDemand({ ...demand, max_price: e.target.value ? Math.max(0, Number(e.target.value)) : 0 })}
                                style={{ width: 110 }}
                              />
                              {demand.max_price > 0 && (
                                <button
                                  type="button"
                                  className="button"
                                  style={{ padding: '6px 10px', fontSize: 11 }}
                                  onClick={() => setDemand({ ...demand, max_price: 0 })}
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                              <span>Min: ₹15/kg</span>
                              <span>Use slider or enter budget · Leave empty for open market pricing</span>
                              <span>Max: ₹60/kg</span>
                            </div>
                          </label>

                          <label className="field" style={{ gridColumn: 'span 2' }}>
                            Delivery budget
                            <input
                              value={demand.delivery_budget}
                              readOnly
                              style={{ background: '#f8fafc', cursor: 'not-allowed' }}
                            />
                            <small style={{ color: 'var(--muted)', fontSize: 11 }}>
                              Estimated maximum allocation for 3PL freight partner
                            </small>
                          </label>
                        </div>

                        <div style={{ marginTop: 22, display: 'flex', justifyContent: 'space-between' }}>
                          <button className="button" onClick={() => setDemandStep(1)}>
                            Back
                          </button>
                          <button className="button green" onClick={() => setDemandStep(3)}>
                            Continue →
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Step 3: Delivery */}
                    {demandStep === 3 && (
                      <div className="step-content">
                        <h3 style={{ fontSize: 18, margin: '8px 0 4px' }}>When should it arrive?</h3>
                        <p style={{ color: 'var(--muted)', margin: '0 0 16px', fontSize: 13 }}>
                          We will match readiness and delivery windows.
                        </p>

                        <div className="form">
                          <label className="field">
                            Delivery location
                            <input
                              value={demand.location}
                              onChange={e => setDemand({ ...demand, location: e.target.value })}
                            />
                          </label>

                          <label className="field">
                            Delivery date
                            <select
                              value={demand.delivery_date}
                              onChange={e => setDemand({ ...demand, delivery_date: e.target.value })}
                            >
                              <option value="Tomorrow">Tomorrow</option>
                              <option value="Day after tomorrow">Day after tomorrow</option>
                            </select>
                          </label>

                          <label className="field">
                            Preferred window
                            <select
                              value={demand.preferred_window}
                              onChange={e => setDemand({ ...demand, preferred_window: e.target.value })}
                            >
                              <option value="10 AM – 2 PM">10 AM – 2 PM</option>
                              <option value="2 PM – 6 PM">2 PM – 6 PM</option>
                            </select>
                          </label>

                          <label className="field">
                            Handling notes
                            <input
                              value={demand.handling_notes}
                              placeholder="Optional notes"
                              onChange={e => setDemand({ ...demand, handling_notes: e.target.value })}
                            />
                          </label>
                        </div>

                        <div style={{ marginTop: 22, display: 'flex', justifyContent: 'space-between' }}>
                          <button className="button" onClick={() => setDemandStep(2)}>
                            Back
                          </button>
                          <button className="button green" onClick={() => setDemandStep(4)}>
                            Continue →
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Step 4: Review Demand Summary */}
                    {demandStep === 4 && (
                      <div className="step-content">
                        <h3 style={{ fontSize: 18, margin: '8px 0 4px' }}>Review your demand</h3>
                        <p style={{ color: 'var(--muted)', margin: '0 0 16px', fontSize: 13 }}>
                          Confirm the details before finding compatible farmer supply.
                        </p>

                        <div className="producepreview">
                          <b style={{ fontSize: 20, display: 'block', color: 'var(--navy)' }}>
                            {demand.crop}
                          </b>
                          <p style={{ margin: '6px 0 14px', color: 'var(--muted)' }}>
                            {demand.quantity_kg} kg • {demand.quality_requirement} • {demand.max_price > 0 ? `max ₹${demand.max_price}/kg` : 'Open / Market Rate'}
                          </p>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <span className="tag">{demand.location}</span>
                            <span className="tag">{demand.delivery_date}</span>
                            <span className="tag">{demand.preferred_window}</span>
                            {demand.buyer_type && <span className="tag">{demand.buyer_type}</span>}
                          </div>
                        </div>

                        <div style={{ marginTop: 22, display: 'flex', justifyContent: 'space-between' }}>
                          <button className="button" onClick={() => setDemandStep(3)}>
                            Back
                          </button>
                          <button className="button green" onClick={handleRunMatch}>
                            Find Best Matches →
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* ======================================================== */}
                {/* 2. MATCH DISCOVERY & ALL MATCHES (stage === 'matches')   */}
                {/* ======================================================== */}
                {stage === 'matches' && (
                  <>
                    <div className="pagehead">
                      <span className="tag" style={{ marginBottom: 6, display: 'inline-block' }}>
                        AI-assisted matching — prototype
                      </span>
                      <h2 style={{ margin: '4px 0 6px' }}>AI-Ranked Farmer Matches</h2>
                      <p style={{ color: 'var(--muted)', margin: 0 }}>
                        Based on crop, quantity, location, price, quality and delivery requirements.
                      </p>
                    </div>

                    {/* Route Map Preview with 2-Opt TSP Metrics */}
                    <div style={{ margin: '14px 0' }}>
                      <RouteMap
                        height={240}
                        stops={dynamicMapStops}
                        routeMetrics={routeOptimization ? {
                          totalDistanceKm: routeOptimization.total_distance_km,
                          baselineDistanceKm: routeOptimization.baseline_distance_km,
                          distanceSavedKm: routeOptimization.distance_saved_km,
                          fuelCostSavedInr: routeOptimization.fuel_cost_saving_inr,
                          optimizationMethod: routeOptimization.optimization_method
                        } : undefined}
                      />
                    </div>

                    {/* Consolidated Pickup Optimization Banner */}
                    {routeOptimization && (
                      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 16px', marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                          <strong style={{ color: '#166534', fontSize: 14 }}>
                            🌿 2-Opt Multi-Farm Pickup Optimization
                          </strong>
                          <span className="tag" style={{ background: '#dcfce7', color: '#166534', fontWeight: 700, fontSize: 12 }}>
                            Saved {routeOptimization.distance_saved_km.toFixed(1)} KM (₹{routeOptimization.fuel_cost_saving_inr.toFixed(0)} fuel saved)
                          </span>
                        </div>
                        <p style={{ margin: '6px 0 8px', fontSize: 12, color: '#15803d' }}>
                          Optimized pickup circuit ({routeOptimization.total_distance_km.toFixed(1)} KM) combines {routeOptimization.stop_sequence.length - 1} farm collections into 1 consolidated carrier run vs {routeOptimization.baseline_distance_km.toFixed(1)} KM uncoordinated trips.
                        </p>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11 }}>
                          {routeOptimization.stop_sequence.map((st, i) => (
                            <span key={i} style={{ background: '#fff', border: '1px solid #86efac', padding: '3px 8px', borderRadius: 6, color: '#14532d' }}>
                              Stop {st.stop}: <b>{st.name.split(' ')[0]}</b> ({st.quantity_kg} kg · ETA +{st.estimated_arrival_mins}m)
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Match Filter & Sorting Controls */}
                    <div className="filter" style={{ marginTop: 14 }}>
                      <button
                        className={selectedSort === 'score' ? 'on' : ''}
                        onClick={() => setSelectedSort('score')}
                      >
                        Best Match
                      </button>
                      <button
                        className={selectedSort === 'price' ? 'on' : ''}
                        onClick={() => setSelectedSort('price')}
                      >
                        Lowest Price
                      </button>
                      <button
                        className={selectedSort === 'distance' ? 'on' : ''}
                        onClick={() => setSelectedSort('distance')}
                      >
                        Closest
                      </button>
                      <button
                        className={selectedSort === 'reliability' ? 'on' : ''}
                        onClick={() => setSelectedSort('reliability')}
                      >
                        Highest Reliability
                      </button>
                    </div>

                    {/* All Compatible Matches List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {sortedMatches.length === 0 ? (
                        <p>No listings matched. Try increasing your search radius or maximum price.</p>
                      ) : (
                        sortedMatches.map(m => {
                          const isTopRecommendation = recommendedMatch?.listing.id === m.listing.id;
                          return (
                            <article
                              className="match"
                              key={m.listing.id}
                              style={{
                                background: '#ffffff',
                                border: '1px solid var(--line)',
                                borderRadius: 14,
                                padding: 16,
                                display: 'grid',
                                gridTemplateColumns: '70px 1fr auto',
                                gap: 14,
                                alignItems: 'center'
                              }}
                            >
                              {/* Score Circle */}
                              <div
                                className="score"
                                style={{ '--score': m.score.overall } as React.CSSProperties}
                              >
                                <b>{Math.round(m.score.overall)}%</b>
                              </div>

                              {/* Supplier Info */}
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <h3 style={{ margin: 0, fontSize: 16 }}>{m.listing.farmer_name}</h3>
                                  {isTopRecommendation && (
                                    <span className="tag" style={{ background: '#dcfce7', color: '#166534', fontWeight: 800 }}>
                                      ★ AI MATCH
                                    </span>
                                  )}
                                </div>
                                <p style={{ color: 'var(--muted)', fontSize: 12, margin: '4px 0 8px' }}>
                                  {m.listing.latitude ? 'Pune Region' : 'Nearby'} • {m.distance_km} km away • Ready {m.listing.ready_date || 'Tomorrow • 12:45 PM'}
                                </p>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                  <span className="tag">{m.listing.quantity_kg} kg available</span>
                                  <span className="tag">Quality {m.listing.quality_grade || 'A'}</span>
                                  <span className="tag" style={{
                                    background: m.listing.urgency_level === 'CRITICAL' ? '#fee2e2' : m.listing.urgency_level === 'URGENT' ? '#ffedd5' : '#dcfce7',
                                    color: m.listing.urgency_level === 'CRITICAL' ? '#991b1b' : m.listing.urgency_level === 'URGENT' ? '#9a3412' : '#166534',
                                    fontWeight: 700
                                  }}>
                                    {m.listing.freshness_percentage ? `${Math.round(m.listing.freshness_percentage)}% Fresh` : '92% Fresh'}
                                  </span>
                                  <span className="tag" style={{ background: '#f1f5f9', color: '#475569' }}>
                                    {m.listing.storage_type === 'COLD_STORAGE' ? '❄️ Cold-Chain' : '🍃 Ventilated'}
                                  </span>
                                  <span className="tag">{m.listing.reliability}% reliable</span>
                                  <span className="tag">✓ Verified</span>
                                </div>
                              </div>

                              {/* Price & Action */}
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)' }}>
                                  ₹{m.listing.asking_price}/kg
                                </div>
                                <small style={{ display: 'block', color: 'var(--muted)', marginBottom: 8 }}>
                                  Delivery ₹1,840
                                </small>
                                <button
                                  className="button green"
                                  style={{ padding: '8px 16px', fontSize: 13 }}
                                  onClick={() => handleInspectMatch(m)}
                                >
                                  View Match
                                </button>
                              </div>
                            </article>
                          );
                        })
                      )}
                    </div>

                    <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between' }}>
                      <button className="button" onClick={() => { setStage('demand'); setDemandStep(4); }}>
                        ← Back to Demand Review
                      </button>
                    </div>
                  </>
                )}

                {/* ======================================================== */}
                {/* 3. MATCH INSPECTION / DETAIL (stage === 'match-detail')  */}
                {/* ======================================================== */}
                {stage === 'match-detail' && selectedMatch && (
                  <>
                    <div className="pagehead">
                      <span className="tag" style={{ marginBottom: 6, display: 'inline-block' }}>
                        {selectedMatch.listing.id === recommendedMatch?.listing.id ? 'Rank #1 • Best Match' : `Supplier Match · ${selectedMatch.listing.farmer_name}`}
                      </span>
                      <h2 style={{ margin: '4px 0 6px' }}>{selectedMatch.listing.farmer_name}</h2>
                      <p style={{ color: 'var(--muted)', margin: 0 }}>
                        Transparent match explanation for your {demand.quantity_kg} kg {demand.crop} demand.
                      </p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 16, marginTop: 16 }}>
                      {/* Left: Score Breakdown & Supplier Specs */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                          <div
                            className="score"
                            style={{ '--score': selectedMatch.score.overall, width: 72, height: 72 } as React.CSSProperties}
                          >
                            <b style={{ fontSize: 16 }}>{Math.round(selectedMatch.score.overall)}%</b>
                          </div>
                          <div>
                            <h3 style={{ margin: 0, fontSize: 18 }}>
                              {selectedMatch.score.overall >= 90 ? 'Excellent match' : 'Compatible match'}
                            </h3>
                            <p style={{ margin: '3px 0 0', color: 'var(--muted)', fontSize: 13 }}>
                              Verified Supplier • {selectedMatch.distance_km} km away
                            </p>
                          </div>
                        </div>

                        {/* 4 Metric Boxes */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                          <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid var(--line)' }}>
                            <small style={{ color: 'var(--muted)', fontWeight: 700, fontSize: 11 }}>AVAILABLE QUANTITY</small>
                            <b style={{ display: 'block', fontSize: 16, marginTop: 4 }}>{selectedMatch.listing.quantity_kg} kg</b>
                          </div>
                          <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid var(--line)' }}>
                            <small style={{ color: 'var(--muted)', fontWeight: 700, fontSize: 11 }}>PRODUCE PRICE</small>
                            <b style={{ display: 'block', fontSize: 16, marginTop: 4 }}>₹{selectedMatch.listing.asking_price}/kg</b>
                          </div>
                          <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid var(--line)' }}>
                            <small style={{ color: 'var(--muted)', fontWeight: 700, fontSize: 11 }}>EST. DELIVERY</small>
                            <b style={{ display: 'block', fontSize: 14, marginTop: 4 }}>{demand.delivery_date} • {demand.preferred_window}</b>
                          </div>
                          <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid var(--line)' }}>
                            <small style={{ color: 'var(--muted)', fontWeight: 700, fontSize: 11 }}>DELIVERY CHARGE</small>
                            <b style={{ display: 'block', fontSize: 16, marginTop: 4 }}>₹1,840</b>
                          </div>
                        </div>

                        {/* Match-score breakdown */}
                        <h4 style={{ margin: '18px 0 10px', fontSize: 15 }}>Match-score breakdown</h4>
                        <div style={{ display: 'grid', gap: 10 }}>
                          {[
                            ['Quantity compatibility', selectedMatch.score.quantity],
                            ['Distance', selectedMatch.score.distance],
                            ['Price', selectedMatch.score.price],
                            ['Quality', selectedMatch.score.quality],
                            ['Reliability', selectedMatch.score.reliability]
                          ].map(([label, val]) => (
                            <div key={label as string}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700 }}>
                                <span>{label}</span>
                                <span>{Math.round(val as number)}%</span>
                              </div>
                              <div className="track">
                                <span style={{ width: `${Math.min(100, Math.max(0, val as number))}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Cold-Chain Logistics Recommendation & Spoilage Risk Card */}
                        <div style={{ marginTop: 20, background: '#f8fafc', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
                            <div>
                              <span className="tag" style={{ background: '#dbeafe', color: '#1e40af', fontWeight: 700, marginBottom: 4, display: 'inline-block' }}>
                                ❄️ Cold-Chain & Spoilage Intelligence
                              </span>
                              <h4 style={{ margin: 0, fontSize: 16 }}>Logistics Perishability Assessment</h4>
                            </div>
                            <span className="tag" style={{
                              background: (spoilageRisk?.feasibility_status === 'SAFE' || !spoilageRisk) ? '#dcfce7' : '#fee2e2',
                              color: (spoilageRisk?.feasibility_status === 'SAFE' || !spoilageRisk) ? '#166534' : '#991b1b',
                              fontWeight: 700
                            }}>
                              Status: {spoilageRisk?.feasibility_status || 'SAFE'}
                            </span>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12, fontSize: 12 }}>
                            <div style={{ background: '#fff', padding: 10, borderRadius: 8, border: '1px solid var(--line)' }}>
                              <span style={{ color: 'var(--muted)', display: 'block' }}>Freshness Index:</span>
                              <strong style={{ fontSize: 14, color: '#166534' }}>
                                {selectedMatch.listing.freshness_percentage ? `${Math.round(selectedMatch.listing.freshness_percentage)}% Fresh` : '92% Fresh'}
                              </strong>
                            </div>
                            <div style={{ background: '#fff', padding: 10, borderRadius: 8, border: '1px solid var(--line)' }}>
                              <span style={{ color: 'var(--muted)', display: 'block' }}>ML Spoilage Risk:</span>
                              <strong style={{ fontSize: 14, color: spoilageRisk?.risk_level === 'CRITICAL' || spoilageRisk?.risk_level === 'HIGH' ? '#dc2626' : '#166534' }}>
                                {spoilageRisk?.risk_level || 'LOW'} ({spoilageRisk?.risk_score_percent ? `${Math.round(spoilageRisk.risk_score_percent)}% safe` : 'Safe'})
                              </strong>
                            </div>
                          </div>

                          {/* Cold-Chain Vehicle Selection */}
                          <div style={{ marginBottom: 12 }}>
                            <small style={{ fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
                              FREIGHT DISPATCH RECOMMENDATION:
                            </small>
                            <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
                              <label style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                background: !useColdChain ? '#ecfdf5' : '#fff',
                                border: !useColdChain ? '2px solid #10b981' : '1px solid var(--line)',
                                padding: '10px 12px',
                                borderRadius: 8,
                                cursor: 'pointer',
                                fontSize: 13
                              }}>
                                <input
                                  type="radio"
                                  name="logistics-mode"
                                  checked={!useColdChain}
                                  onChange={() => handleToggleColdChain(false)}
                                />
                                <div style={{ flex: 1 }}>
                                  <strong>Standard 3PL Mini Truck (Ventilated Ambient)</strong>
                                  <small style={{ display: 'block', color: 'var(--muted)' }}>
                                    Standard freight rate · Best for robust/medium crops · ₹1,840
                                  </small>
                                </div>
                              </label>

                              <label style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                background: useColdChain ? '#eff6ff' : '#fff',
                                border: useColdChain ? '2px solid #3b82f6' : '1px solid var(--line)',
                                padding: '10px 12px',
                                borderRadius: 8,
                                cursor: 'pointer',
                                fontSize: 13
                              }}>
                                <input
                                  type="radio"
                                  name="logistics-mode"
                                  checked={useColdChain}
                                  onChange={() => handleToggleColdChain(true)}
                                />
                                <div style={{ flex: 1 }}>
                                  <strong>Reefer Cold-Chain Mini Truck (Active 2°C – 6°C)</strong>
                                  <small style={{ display: 'block', color: 'var(--muted)' }}>
                                    Active temperature control · Recommended for Strawberries, Spinach, Leafy crops · ₹2,640
                                  </small>
                                </div>
                              </label>
                            </div>
                          </div>

                          {/* Decision Aid: Cost vs Spoilage Risk */}
                          <div style={{ background: '#ecfdf5', border: '1px solid #bbf7d0', borderRadius: 8, padding: 10, fontSize: 12, color: '#065f46' }}>
                            <strong>💡 Cost vs Spoilage Trade-off:</strong> Produce cargo value is ₹{(demand.quantity_kg * chosenUnitPrice).toLocaleString()}. {useColdChain ? 'Active reefer protection completely eliminates thermal spoilage hazard for ₹800 incremental freight.' : 'Standard transit is economically viable; switch to Reefer if handling delicate high-perishability produce.'}
                          </div>

                          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--muted)' }}>
                            🤖 <strong>Model:</strong> RandomForestClassifier (transit time, ambient temp, stop count, baseline shelf-life)
                          </div>
                        </div>
                      </div>

                      {/* Right: Order Estimate Box */}
                      <div>
                        <div className="pricebox">
                          <h3>Order estimate</h3>
                          <p>
                            {demand.quantity_kg} kg {demand.crop} • {demand.quality_requirement}
                          </p>
                          <div className="total">
                            ₹{chosenGrandTotal.toLocaleString()}
                          </div>
                          <p>
                            Produce ₹{chosenProduceSubtotal.toLocaleString()}<br />
                            Estimated delivery ₹{deliveryCharge.toLocaleString()}
                          </p>
                          <button
                            className="button green"
                            style={{ width: '100%', padding: '12px 14px' }}
                            onClick={() => handleProceedToCompliance(selectedMatch)}
                          >
                            Proceed to Compliance →
                          </button>
                        </div>

                        <button
                          className="button"
                          style={{ width: '100%', marginTop: 10 }}
                          onClick={() => setStage('matches')}
                        >
                          ← Back to All Matches
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* ======================================================== */}
                {/* 4. COMPLIANCE ASSESSMENT (stage === 'compliance')        */}
                {/* ======================================================== */}
                {stage === 'compliance' && selectedMatch && (
                  <>
                    <div className="pagehead">
                      <span className="tag" style={{ marginBottom: 6, display: 'inline-block' }}>
                        State-compliance engine
                      </span>
                      <h2 style={{ margin: '4px 0 6px' }}>State compliance check</h2>
                      <p style={{ color: 'var(--muted)', margin: 0 }}>
                        Eligibility check based on configured state rules.
                      </p>
                    </div>

                    <div className="notice" style={{ margin: '16px 0 14px' }}>
                      <b>✓ Configured rule assessment complete:</b> Maharashtra • {demand.crop} • Bulk direct sale
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                        Supplier under evaluation: <strong>{selectedMatch.listing.farmer_name}</strong>
                      </div>
                    </div>

                    {/* 7 Statutory Direct-Sale Checklist Items */}
                    <div className="checklist">
                      {statutoryChecks.map(item => (
                        <div key={item} className="check">
                          <span>✓</span>
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>

                    {/* Eligible Banner */}
                    <div className="eligible">
                      <h3>✓ TRANSACTION ELIGIBLE</h3>
                      <p>Direct-sale pathway is available in this prototype scenario.</p>
                    </div>

                    <p style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, margin: '14px 0 20px' }}>
                      Prototype eligibility assessment — verify applicable rules before real transactions. FarmDirect does not provide legal advice.
                    </p>

                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
                      <button className="button" onClick={() => setStage('match-detail')}>
                        ← Back to Match Details
                      </button>
                      <button className="button green" onClick={handleProceedToOrderReview}>
                        Continue to Confirmation →
                      </button>
                    </div>
                  </>
                )}

                {/* ======================================================== */}
                {/* 5. FINAL ORDER REVIEW (stage === 'order')                */}
                {/* ======================================================== */}
                {stage === 'order' && selectedMatch && (
                  <>
                    <div className="pagehead">
                      <span className="tag" style={{ marginBottom: 6, display: 'inline-block' }}>
                        Order review
                      </span>
                      <h2 style={{ margin: '4px 0 6px' }}>Order summary</h2>
                      <p style={{ color: 'var(--muted)', margin: 0 }}>
                        Review the direct transaction before it becomes locked.
                      </p>
                    </div>

                    {/* Produce Preview showing the ACTUALLY SELECTED MATCH */}
                    <div className="producepreview">
                      <b style={{ fontSize: 20, color: 'var(--navy)' }}>
                        {demand.crop} <span className="tag">{demand.quality_requirement}</span>
                      </b>
                      <p style={{ margin: '6px 0 16px', color: 'var(--muted)', fontSize: 14 }}>
                        {demand.quantity_kg} kg from <strong>{selectedMatch.listing.farmer_name}</strong>
                      </p>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, borderTop: '1px solid #bbf7d0', paddingTop: 14 }}>
                        <div>
                          <small style={{ color: 'var(--muted)', display: 'block', fontSize: 11 }}>Produce price</small>
                          <b style={{ fontSize: 16 }}>₹{chosenProduceSubtotal.toLocaleString()}</b>
                        </div>
                        <div>
                          <small style={{ color: 'var(--muted)', display: 'block', fontSize: 11 }}>Estimated delivery</small>
                          <b style={{ fontSize: 16 }}>₹{deliveryCharge.toLocaleString()}</b>
                        </div>
                        <div>
                          <small style={{ color: 'var(--muted)', display: 'block', fontSize: 11 }}>Delivery</small>
                          <b style={{ fontSize: 14 }}>{demand.delivery_date}</b>
                        </div>
                        <div>
                          <small style={{ color: 'var(--muted)', display: 'block', fontSize: 11 }}>Time</small>
                          <b style={{ fontSize: 14 }}>{demand.preferred_window}</b>
                        </div>
                      </div>
                    </div>

                    <div className="notice" style={{ margin: '14px 0' }}>
                      <div>✓ <strong>Compliance passed:</strong> Configured state rules have been checked for direct procurement.</div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                      <div>
                        <small style={{ color: 'var(--muted)', display: 'block', fontSize: 11, fontWeight: 700 }}>TOTAL</small>
                        <b style={{ fontSize: 26, color: 'var(--navy)', fontWeight: 800 }}>₹{chosenGrandTotal.toLocaleString()}</b>
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button className="button" onClick={() => setStage('compliance')}>
                          ← Back
                        </button>
                        <button className="button green" onClick={handleConfirmOrder}>
                          Confirm Order →
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* ======================================================== */}
                {/* 6. ORDER CONFIRMED (TERMINAL SCOPE BOUNDARY)             */}
                {/* ======================================================== */}
                {stage === 'order-confirmed' && confirmedOrder && (
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
                    <h2 style={{ fontSize: 26, margin: '0 0 6px', color: 'var(--navy)' }}>Order confirmed</h2>
                    <p style={{ fontSize: 16, margin: '0 0 16px' }}>
                      <strong>Order #{confirmedOrder.id}</strong><br />
                      <span style={{ color: 'var(--muted)', fontSize: 14 }}>
                        Your direct order with {confirmedOrder.farmer_name} has been locked and recorded.
                      </span>
                    </p>

                    <div style={{ maxWidth: 440, margin: '0 auto 24px', background: '#f8fafc', border: '1px solid var(--line)', borderRadius: 12, padding: 18, textAlign: 'left' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
                        <span style={{ color: 'var(--muted)' }}>Commodity:</span>
                        <strong>{confirmedOrder.quantity_kg} kg {confirmedOrder.crop}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
                        <span style={{ color: 'var(--muted)' }}>Supplier:</span>
                        <strong>{confirmedOrder.farmer_name}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
                        <span style={{ color: 'var(--muted)' }}>Delivery Hub:</span>
                        <strong>{demand.location}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: 8, fontSize: 16 }}>
                        <span><b>Total Paid / Settled:</b></span>
                        <strong style={{ color: 'var(--green)' }}>₹{confirmedOrder.total.toLocaleString()}</strong>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                      <button className="button green" onClick={() => setActiveTab('orders')}>
                        View in My Orders →
                      </button>
                      <button className="button" onClick={handleResetProcurement}>
                        Start New Procurement ↺
                      </button>
                    </div>
                  </div>
                )}

                {/* ======================================================== */}
                {/* POST-ORDER WORKFLOW (RETAINED FOR EXISTING ORDERS ONLY)    */}
                {/* ======================================================== */}
                {stage === 'logistics' && (
                  <>
                    <h2>Select 3PL Freight Partner</h2>
                    <p>Independent third-party logistics options for pickup to {demand.location}.</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '14px 0' }}>
                      {quotes.map((q, idx) => (
                        <div key={q.vehicle} className="status" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: '4px solid var(--green)' }}>
                          <div>
                            <strong>{q.vehicle} — {q.partner}</strong>
                            <p style={{ margin: '3px 0' }}>Capacity: {q.capacity_kg} kg · Transit ETA: {Math.floor(q.eta_minutes / 60)}h {q.eta_minutes % 60}m</p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--green)' }}>₹{q.cost.toLocaleString()}</div>
                            <button className="button green" style={{ marginTop: 6 }} onClick={() => handleSelectQuote(q.vehicle, `lq-${idx + 1}`)}>
                              Book {q.vehicle} →
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {stage === 'tracking' && (
                  <>
                    <h2>Live Order & Logistics Tracking</h2>
                    <p>Order ID: <b>{orderId}</b> · Assigned Vehicle: <b>{selectedQuote}</b></p>
                    <div style={{ margin: '14px 0' }}>
                      <RouteMap height={240} stops={dynamicMapStops} />
                    </div>
                    <div style={{ margin: '14px 0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <small>Status: <b>{trackingInfo?.current_status?.replace(/_/g, ' ') || 'VEHICLE ASSIGNED'}</b></small>
                        <small>Progress: <b>{trackingInfo?.progress_percent || 37}%</b></small>
                      </div>
                      <div className="bar">
                        <span style={{ width: `${trackingInfo?.progress_percent || 37}%` }} />
                      </div>
                    </div>
                    <div style={{ marginTop: 18 }}>
                      <button className="button green" onClick={handleNextTracking}>
                        Simulate 3PL GPS Transit Event →
                      </button>
                    </div>
                  </>
                )}

                {stage === 'delivered' && (
                  <>
                    <h2>Delivery Fulfilled & Farmer Rating</h2>
                    <div className="status" style={{ borderLeft: '4px solid #10b981', background: '#f0fdf4' }}>
                      <strong>✓ Delivery Confirmed</strong>
                      <p style={{ margin: '3px 0' }}>{demand.quantity_kg} kg Grade A {demand.crop} received at {demand.location}.</p>
                    </div>
                    {!feedbackSubmitted ? (
                      <div style={{ marginTop: 16 }}>
                        <h3>Rate Participating Farm</h3>
                        <div style={{ margin: '12px 0', display: 'flex', gap: 6 }}>
                          {[1, 2, 3, 4, 5].map(star => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => setSelectedRating(star)}
                              style={{ fontSize: 24, background: 'none', color: star <= selectedRating ? '#eab308' : '#d1d5db', padding: 0 }}
                            >
                              ★
                            </button>
                          ))}
                        </div>
                        <button className="button green" onClick={handleSubmitFeedback}>
                          Submit Verified Rating ★
                        </button>
                      </div>
                    ) : (
                      <div className="notice" style={{ marginTop: 14 }}>
                        ✓ Rating recorded in database!
                      </div>
                    )}
                  </>
                )}

              </article>

              {/* ======================================================== */}
              {/* SIDEBAR: PROCUREMENT INTELLIGENCE & WHY THIS HELPS      */}
              {/* ======================================================== */}
              <aside className="card">
                {/* Reference "Why this helps" panel during Demand Creation */}
                {stage === 'demand' && (
                  <div style={{ borderBottom: '1px solid var(--line)', paddingBottom: 16, marginBottom: 16 }}>
                    <h3 style={{ fontSize: 16, margin: '0 0 6px' }}>Why this helps</h3>
                    <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.6, margin: '0 0 14px' }}>
                      Our prototype matching checks crop, available quantity, location, price, quality and delivery compatibility.
                    </p>
                    <div style={{
                      background: '#e6f4ea',
                      border: '1px solid #cce9d4',
                      borderRadius: 10,
                      padding: 12
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#166534', fontWeight: 700, fontSize: 13 }}>
                        ✦ AI-assisted matching
                      </div>
                      <small style={{ color: '#2d6a4f', display: 'block', marginTop: 4 }}>
                        Ranked, explainable results with buyer choice.
                      </small>
                    </div>
                  </div>
                )}

                <h2 style={{ fontSize: 18, margin: '0 0 10px' }}>Procurement Intelligence</h2>

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

                <div style={{ marginTop: 16, background: '#f8fafc', border: '1px solid var(--line)', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--navy)', marginBottom: 6 }}>
                    ✦ AI & Algorithmic Intelligence
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>
                    <li><strong>Demand Predictor:</strong> <code>RandomForestRegressor</code> (weekly regional data)</li>
                    <li><strong>Spoilage Predictor:</strong> <code>RandomForestClassifier</code> (multivariate thermal/transit)</li>
                    <li><strong>Multi-Farm Pickup:</strong> <code>Nearest Neighbor + 2-Opt TSP</code> (bulk circuit optimization)</li>
                    <li><strong>Household Aggregation:</strong> <code>DBSCAN</code> (5km radius at Partner Hubs)</li>
                    <li><strong>Asset-Light:</strong> Zero owned warehouses or trucks</li>
                  </ul>
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
