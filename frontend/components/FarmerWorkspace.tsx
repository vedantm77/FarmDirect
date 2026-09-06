'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getFarmerListings, createProduceListing, updateProduceListing,
  deleteProduceListing, getOpenDemands, getFarmerOrders,
  respondToAllocation, markOrderReady, getFarmerAnalytics,
  logoutUser, getStoredUser, getTracking
} from '../lib/farmdirect-service';
import type { Listing, Demand, OrderItem, FarmerAnalytics, TrackingInfo } from '../lib/types';
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
    ready_date: '2026-09-10'
  });
  const [token, setToken] = useState<string>('');
  const [profile, setProfile] = useState<any>({
    name: 'Khed Farmer Group',
    location: 'Khed, Maharashtra',
    reliability: 96.0,
    role: 'FARMER'
  });

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
      }
      setToken(t);
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

  const handleLogout = () => {
    logoutUser();
    router.push('/');
  };

  async function refreshAllData(authToken: string) {
    const [l, d, o, a] = await Promise.all([
      getFarmerListings(authToken),
      getOpenDemands(authToken),
      getFarmerOrders(authToken),
      getFarmerAnalytics(authToken)
    ]);

    setListings(l);
    setDemands(d);
    setOrders(o);
    setAnalytics(a.analytics);
    setMessage('All supply, demand, and allocation data synchronized in real-time.');
  }

  async function handlePublish() {
    setMessage('Publishing produce listing to database…');
    const ok = await createProduceListing({
      ...form,
      latitude: 18.738,
      longitude: 73.846
    }, token);

    if (ok) {
      setMessage(`Successfully listed ${form.quantity_kg} kg of ${form.crop}. Now active in buyer matching!`);
      const l = await getFarmerListings(token);
      setListings(l);
      const a = await getFarmerAnalytics(token);
      setAnalytics(a.analytics);
    } else {
      setMessage('Failed to publish listing. Please check backend connection.');
    }
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
                        <p style={{ margin: '4px 0' }}>
                          <b>{x.quantity_kg} kg available</b> · <span style={{ color: 'var(--green)', fontWeight: 700 }}>₹{x.asking_price}/kg</span>
                        </p>
                        <small style={{ color: 'var(--muted)' }}>
                          Ready Date: {x.ready_date || 'Immediate'} · Status: <b>{x.status || 'ACTIVE'}</b>
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

          {/* 3. ADD PRODUCE */}
          {view === 'Add Produce' && (
            <>
              <p>Publish harvest supply to participate in direct AI multi-farm matching with verified institutional buyers.</p>
              <div className="form" style={{ marginTop: 12 }}>
                <label className="field">
                  Crop Name
                  <input
                    value={form.crop}
                    onChange={e => setForm({ ...form, crop: e.target.value })}
                    placeholder="e.g. Tomatoes, Onions, Spinach"
                  />
                </label>

                <label className="field">
                  Available Quantity (kg)
                  <input
                    type="number"
                    value={form.quantity_kg}
                    onChange={e => setForm({ ...form, quantity_kg: Number(e.target.value) })}
                  />
                </label>

                <label className="field">
                  Asking Price / kg (₹)
                  <input
                    type="number"
                    value={form.asking_price}
                    onChange={e => setForm({ ...form, asking_price: Number(e.target.value) })}
                  />
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
                </label>

                <label className="field">
                  Ready Date for Pickup
                  <input
                    type="date"
                    value={form.ready_date}
                    onChange={e => setForm({ ...form, ready_date: e.target.value })}
                  />
                </label>

                <label className="field">
                  Pickup Time Window
                  <input value="8:00 AM – 11:00 AM" readOnly />
                </label>
              </div>

              <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
                <button className="button green" onClick={handlePublish}>
                  Publish Produce Listing →
                </button>
                <a href="/farmer/produce" style={{ textDecoration: 'none' }}>
                  <button className="button">View All My Produce</button>
                </a>
              </div>
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
                        setForm({
                          crop: d.crop,
                          quantity_kg: Math.min(d.quantity_kg, 400),
                          asking_price: Math.min(d.max_price, 28),
                          quality_grade: d.quality_requirement || 'A',
                          ready_date: d.delivery_date
                        });
                        window.location.href = '/farmer/produce/new';
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
                  Email: {profile.email || 'farmer@farmdirect.demo'} · District: {profile.location}, {profile.state || 'Maharashtra'} · Role: {profile.role}
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
