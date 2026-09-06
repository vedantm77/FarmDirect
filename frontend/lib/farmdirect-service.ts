import type {
  Demand, Match, Allocation, ComplianceCheck, LogisticsQuote,
  TrackingInfo, OrderItem, BuyerAnalytics, FarmerAnalytics, Listing,
  BuyerOrder, UserProfile
} from './types';

const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8000';

const deterministicAllocations: Allocation[] = [
  { listing_id: 'l1', farmer_id: 'farmer-1', farmer_name: 'Khed Farmer Group', quantity_kg: 420, price_per_kg: 27, distance_km: 24.8 },
  { listing_id: 'l2', farmer_id: 'fpo-1', farmer_name: 'Baramati FPO', quantity_kg: 330, price_per_kg: 26, distance_km: 85.2 },
  { listing_id: 'l3', farmer_id: 'farmer-3', farmer_name: 'Junnar Growers Collective', quantity_kg: 250, price_per_kg: 25, distance_km: 76.4 }
];

const fallbackMatches: Match[] = [
  {
    listing: { id: 'l1', farmer_id: 'farmer-1', farmer_name: 'Khed Farmer Group', crop: 'Tomatoes', quantity_kg: 420, quality_grade: 'A', asking_price: 27, reliability: 96 },
    distance_km: 24.8,
    score: { overall: 96.2, distance: 95.0, price: 90.0, quantity: 100.0, quality: 100.0, readiness: 100.0, reliability: 96.0 },
    explanation: 'Score 96.2%: 24.8km away (95%), ₹27/kg (90%), Quality A, 96% reliability.'
  },
  {
    listing: { id: 'l2', farmer_id: 'fpo-1', farmer_name: 'Baramati FPO', crop: 'Tomatoes', quantity_kg: 330, quality_grade: 'A', asking_price: 26, reliability: 94 },
    distance_km: 85.2,
    score: { overall: 92.4, distance: 82.0, price: 93.3, quantity: 100.0, quality: 100.0, readiness: 100.0, reliability: 94.0 },
    explanation: 'Score 92.4%: 85.2km away (82%), ₹26/kg (93.3%), Quality A, 94% reliability.'
  },
  {
    listing: { id: 'l3', farmer_id: 'farmer-3', farmer_name: 'Junnar Growers Collective', crop: 'Tomatoes', quantity_kg: 250, quality_grade: 'A', asking_price: 25, reliability: 92 },
    distance_km: 76.4,
    score: { overall: 91.8, distance: 84.0, price: 96.7, quantity: 100.0, quality: 100.0, readiness: 100.0, reliability: 92.0 },
    explanation: 'Score 91.8%: 76.4km away (84%), ₹25/kg (96.7%), Quality A, 92% reliability.'
  },
  {
    listing: { id: 'l4', farmer_id: 'farmer-4', farmer_name: 'Mulshi Farmer Group', crop: 'Tomatoes', quantity_kg: 180, quality_grade: 'A', asking_price: 29, reliability: 97 },
    distance_km: 34.2,
    score: { overall: 89.5, distance: 93.0, price: 86.7, quantity: 100.0, quality: 100.0, readiness: 100.0, reliability: 97.0 },
    explanation: 'Score 89.5%: 34.2km away (93%), ₹29/kg (86.7%), Quality A, 97% reliability.'
  }
];

export async function matchDemand(demand: Demand): Promise<{
  matches: Match[];
  allocations: Allocation[];
  fulfilled: boolean;
  message: string;
  fallback: boolean;
}> {
  const normalizedDemand = {
    ...demand,
    max_price: (demand.max_price && demand.max_price > 0) ? demand.max_price : 9999
  };
  try {
    const res = await fetch(`${base}/matching/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(normalizedDemand)
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    return { ...data, fallback: false };
  } catch {
    return {
      matches: fallbackMatches.filter(m => (!demand.max_price || demand.max_price <= 0) ? true : m.listing.asking_price <= demand.max_price),
      allocations: deterministicAllocations,
      fulfilled: true,
      message: 'Fulfilled by 3 farms using prototype allocation (fallback mode).',
      fallback: true
    };
  }
}

export async function createDemand(demand: Demand, token?: string): Promise<{ id: string; status: string; fallback: boolean }> {
  try {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${base}/demands`, {
      method: 'POST',
      headers,
      body: JSON.stringify(demand)
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    return { ...data, fallback: false };
  } catch {
    return { id: `d-demo-${Date.now()}`, status: 'OPEN', fallback: true };
  }
}

export async function checkCompliance(
  crop: string = 'Tomatoes',
  state: string = 'Maharashtra',
  buyerType: string = 'B2B',
  orderId?: string
): Promise<{ results: ComplianceCheck[]; fallback: boolean }> {
  try {
    const url = new URL(`${base}/compliance/check`);
    url.searchParams.set('state', state);
    url.searchParams.set('crop', crop);
    url.searchParams.set('buyer_type', buyerType);
    if (orderId) url.searchParams.set('order_id', orderId);

    const res = await fetch(url.toString(), { method: 'POST' });
    if (!res.ok) throw new Error();
    const results = await res.json();
    return { results, fallback: false };
  } catch {
    return {
      results: [
        {
          rule: 'Applicable Maharashtra direct-sale rule',
          status: 'PASSED',
          reason: 'Configured rule allows direct farm-to-buyer transaction without intermediary APMC mandi cess.',
          required_documents: [],
          source_reference: 'Maharashtra APMC Direct Marketing Exemption Framework',
          checked_at: new Date().toISOString()
        },
        {
          rule: 'Commodity eligibility',
          status: 'PASSED',
          reason: `${crop} is explicitly designated for direct marketing facilitation.`,
          required_documents: [],
          source_reference: 'State Horticulture Marketing Notification',
          checked_at: new Date().toISOString()
        },
        {
          rule: 'Documents & Quality Verification',
          status: 'REVIEW',
          reason: 'Verify farmer registration or FPO 7-12 record prior to vehicle dispatch.',
          required_documents: ['Farmer 7-12 Land Extract or FPO Certificate', 'Horticulture Quality Report'],
          source_reference: 'FarmDirect Compliance Protocol v1',
          checked_at: new Date().toISOString()
        }
      ],
      fallback: true
    };
  }
}

export async function createOrder(
  payload: {
    produce_subtotal: number;
    logistics_cost: number;
    delivery_location: string;
    allocations: Array<{
      listing_id?: string;
      farmer_id: string;
      farmer_name: string;
      crop: string;
      quantity_kg: number;
      unit_price: number;
      pickup_window?: string;
    }>;
  },
  token?: string
): Promise<{ id: string; status: string; total: number; fallback: boolean }> {
  try {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${base}/orders`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    return { ...data, fallback: false };
  } catch {
    return {
      id: `FD-${new Date().getFullYear()}-DEMO01`,
      status: 'CONFIRMED',
      total: payload.produce_subtotal + payload.logistics_cost,
      fallback: true
    };
  }
}

export async function requestLogisticsQuotes(
  weightKg: number = 1000,
  orderId?: string
): Promise<{ quotes: LogisticsQuote[]; fallback: boolean }> {
  try {
    const url = new URL(`${base}/logistics/request`);
    url.searchParams.set('weight_kg', String(weightKg));
    if (orderId) url.searchParams.set('order_id', orderId);
    const res = await fetch(url.toString(), { method: 'POST' });
    if (!res.ok) throw new Error();
    const quotes = await res.json();
    return { quotes, fallback: false };
  } catch {
    return {
      quotes: [
        { partner: 'Express Agri Logistics', vehicle: 'Mini Truck', cost: 1840, eta_minutes: 135, capacity_kg: 1500, selected: true },
        { partner: 'Pune Route Network', vehicle: 'Tempo', cost: 2200, eta_minutes: 110, capacity_kg: 900, selected: false }
      ],
      fallback: true
    };
  }
}

export async function selectLogisticsQuote(
  requestId: string = 'lr-demo',
  quoteId: string = 'lq-1'
): Promise<{ success: boolean; vehicle: string; cost: number; fallback: boolean }> {
  try {
    const res = await fetch(`${base}/logistics/${requestId}/select`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quote_id: quoteId })
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    return { success: true, vehicle: data.vehicle, cost: data.cost, fallback: false };
  } catch {
    return { success: true, vehicle: 'Mini Truck', cost: 1840, fallback: true };
  }
}

export async function getTracking(orderId: string = 'FD-2026-DEMO01'): Promise<{ tracking: TrackingInfo; fallback: boolean }> {
  try {
    const res = await fetch(`${base}/tracking/${orderId}`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    return { tracking: data, fallback: false };
  } catch {
    return {
      tracking: {
        order_id: orderId,
        label: 'Simulated multi-farm pickup tracking',
        current_status: 'VEHICLE_ASSIGNED',
        events: ['CONFIRMED', 'LOGISTICS_REQUESTED', 'VEHICLE_ASSIGNED'],
        progress_percent: 37,
        complete: false,
        route_stops: [
          { stop: 1, name: 'Khed Farmer Group', action: 'Pickup 420 kg', status: 'PENDING' },
          { stop: 2, name: 'Baramati FPO', action: 'Pickup 330 kg', status: 'PENDING' },
          { stop: 3, name: 'Junnar Collective', action: 'Pickup 250 kg', status: 'PENDING' },
          { stop: 4, name: 'Pune Institutional Buyer', action: 'Final Delivery 1,000 kg', status: 'EN_ROUTE' }
        ]
      },
      fallback: true
    };
  }
}

export async function nextTrackingEvent(orderId: string = 'FD-2026-DEMO01'): Promise<{
  status: string;
  complete: boolean;
  progress_percent: number;
  fallback: boolean;
}> {
  try {
    const res = await fetch(`${base}/tracking/${orderId}/next`, { method: 'POST' });
    if (!res.ok) throw new Error();
    const data = await res.json();
    return { ...data, fallback: false };
  } catch {
    return { status: 'DELIVERED', complete: true, progress_percent: 100, fallback: true };
  }
}

export async function submitRating(
  orderId: string,
  farmerId: string,
  score: number,
  comment: string,
  token?: string
): Promise<{ success: boolean; farmer_reliability: number; fallback: boolean }> {
  try {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${base}/ratings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ order_id: orderId, farmer_id: farmerId, score, comment })
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    return { success: true, farmer_reliability: data.farmer_reliability, fallback: false };
  } catch {
    return { success: true, farmer_reliability: 97.2, fallback: true };
  }
}

export async function getBuyerAnalytics(token?: string): Promise<{ analytics: BuyerAnalytics; fallback: boolean }> {
  try {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${base}/analytics/buyer`, { headers });
    if (!res.ok) throw new Error();
    const data = await res.json();
    return { analytics: data, fallback: false };
  } catch {
    return {
      analytics: {
        demands_count: 3,
        total_demand_kg: 2400,
        orders_count: 2,
        fulfilled_orders_count: 2,
        total_spend: 56020,
        fulfillment_rate: 98.2,
        orders_status_breakdown: { CONFIRMED: 1, DELIVERED: 1 }
      },
      fallback: true
    };
  }
}

export async function getFarmerAnalytics(token?: string): Promise<{ analytics: FarmerAnalytics; fallback: boolean }> {
  try {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${base}/analytics/farmer`, { headers });
    if (!res.ok) throw new Error();
    const data = await res.json();
    return { analytics: data, fallback: false };
  } catch {
    return {
      analytics: {
        active_listings_count: 2,
        total_listed_kg: 670,
        total_allocated_kg: 420,
        completed_orders_count: 1,
        fulfillment_rate: 96.5,
        total_revenue: 11340,
        average_rating: 4.9,
        reliability: 96.8,
        ratings_count: 4,
        recent_feedback: [
          { score: 5, comment: 'Exceptional tomatoes, uniform grade A sorting.', created_at: new Date().toISOString() }
        ]
      },
      fallback: true
    };
  }
}

export async function getFarmerOrders(token?: string): Promise<OrderItem[]> {
  try {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${base}/farmers/me/orders`, { headers });
    if (!res.ok) throw new Error();
    return await res.json();
  } catch {
    return [
      {
        id: 'oi-1',
        order_id: 'FD-2026-DEMO01',
        crop: 'Tomatoes',
        quantity_kg: 420,
        unit_price: 27,
        total_price: 11340,
        status: 'ACCEPTED',
        pickup_window: '8:00 AM - 11:00 AM',
        order_status: 'CONFIRMED',
        delivery_location: 'Pune',
        created_at: new Date().toISOString()
      }
    ];
  }
}

export async function respondToAllocation(
  itemId: string,
  action: 'ACCEPT' | 'REJECT',
  token?: string
): Promise<{ status: string; fallback: boolean }> {
  try {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${base}/farmers/me/allocations/${itemId}/respond`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action })
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    return { status: data.status, fallback: false };
  } catch {
    return { status: action === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED', fallback: true };
  }
}

export async function markOrderReady(orderId: string, token?: string): Promise<boolean> {
  try {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${base}/farmers/me/orders/${orderId}/ready`, {
      method: 'POST',
      headers
    });
    return res.ok;
  } catch {
    return true;
  }
}

export async function getFarmerListings(token?: string): Promise<Listing[]> {
  try {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${base}/farmers/me/listings`, { headers });
    if (!res.ok) throw new Error();
    return await res.json();
  } catch {
    return [
      { id: 'l1', farmer_name: 'Khed Farmer Group', crop: 'Tomatoes', quantity_kg: 420, quality_grade: 'A', asking_price: 27, ready_date: '2026-09-08', reliability: 96, status: 'ACTIVE' }
    ];
  }
}

export async function createProduceListing(payload: any, token?: string): Promise<boolean> {
  try {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${base}/produce`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    return res.ok;
  } catch {
    return true;
  }
}

export async function getOpenDemands(token?: string): Promise<Demand[]> {
  try {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${base}/farmers/me/demands`, { headers });
    if (!res.ok) throw new Error();
    return await res.json();
  } catch {
    return [
      {
        id: 'd1',
        crop: 'Tomatoes',
        quantity_kg: 1000,
        quality_requirement: 'A',
        max_price: 30,
        delivery_date: '2026-09-08',
        location: 'Pune',
        latitude: 18.5204,
        longitude: 73.8567,
        radius_km: 120
      }
    ];
  }
}

export async function authenticateUser(
  identifier: string,
  password: string
): Promise<{ access_token: string; user: any; error?: string }> {
  try {
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: identifier, password })
    });
    const data = await res.json();
    if (!res.ok) {
      return {
        access_token: '',
        user: null,
        error: data.detail || 'Incorrect user ID or password'
      };
    }
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('farmdirect-token', data.access_token);
      sessionStorage.setItem('farmdirect-user', JSON.stringify(data.user));
    }
    return { access_token: data.access_token, user: data.user };
  } catch (err: any) {
    return {
      access_token: '',
      user: null,
      error: err.message || 'Unable to connect to authentication server'
    };
  }
}

export function logoutUser(): void {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem('farmdirect-token');
    sessionStorage.removeItem('farmdirect-user');
  }
}

export function getStoredUser(): any | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem('farmdirect-user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('farmdirect-token');
}

export async function loginDemo(email: string = 'buyer@farmdirect.demo', password: string = 'FarmDirect2026!'): Promise<string | null> {
  try {
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('farmdirect-token', data.access_token);
      sessionStorage.setItem('farmdirect-user', JSON.stringify(data.user));
    }
    return data.access_token;
  } catch {
    return null;
  }
}

export async function registerUser(payload: {
  name: string;
  email: string;
  password: string;
  role: string;
  location: string;
  state?: string;
}): Promise<{ access_token: string; user: any; error?: string }> {
  try {
    const res = await fetch(`${base}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: 'Maharashtra', ...payload })
    });
    const data = await res.json();
    if (!res.ok) {
      return { access_token: '', user: null, error: data.detail || 'Registration failed' };
    }
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('farmdirect-token', data.access_token);
      sessionStorage.setItem('farmdirect-user', JSON.stringify(data.user));
    }
    return data;
  } catch (err: any) {
    return { access_token: '', user: null, error: err.message || 'Network error connecting to backend' };
  }
}

export async function updateProduceListing(id: string, payload: any, token?: string): Promise<boolean> {
  try {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${base}/produce/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload)
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteProduceListing(id: string, token?: string): Promise<boolean> {
  try {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${base}/produce/${id}`, {
      method: 'DELETE',
      headers
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getBuyerOrders(token?: string): Promise<BuyerOrder[]> {
  try {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${base}/buyers/me/orders`, { headers });
    if (!res.ok) throw new Error();
    return await res.json();
  } catch {
    return [];
  }
}

export async function getOrderDetails(orderId: string, token?: string): Promise<BuyerOrder | null> {
  try {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${base}/orders/${orderId}`, { headers });
    if (!res.ok) throw new Error();
    return await res.json();
  } catch {
    return null;
  }
}

export async function getUserProfile(token?: string): Promise<UserProfile | null> {
  try {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${base}/auth/me`, { headers });
    if (!res.ok) throw new Error();
    return await res.json();
  } catch {
    return null;
  }
}
