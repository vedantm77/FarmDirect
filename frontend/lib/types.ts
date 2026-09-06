export type MatchScore = {
  overall: number;
  distance: number;
  price: number;
  quantity: number;
  quality: number;
  readiness: number;
  reliability: number;
};

export type Listing = {
  id: string;
  farmer_id?: string;
  farmer_name: string;
  crop: string;
  quantity_kg: number;
  quality_grade: string;
  asking_price: number;
  reliability: number;
  ready_date?: string;
  latitude?: number;
  longitude?: number;
  status?: string;
};

export type Match = {
  listing: Listing;
  distance_km: number;
  score: MatchScore;
  logistics_feasible?: boolean;
  explanation?: string;
};

export type Allocation = {
  listing_id: string;
  farmer_id?: string;
  farmer_name: string;
  quantity_kg: number;
  price_per_kg: number;
  distance_km: number;
};

export type Demand = {
  id?: string;
  buyer_id?: string;
  crop: string;
  quantity_kg: number;
  quality_requirement: string;
  max_price: number;
  delivery_date: string;
  location: string;
  latitude: number;
  longitude: number;
  radius_km: number;
};

export type ComplianceCheck = {
  rule: string;
  status: 'PASSED' | 'REVIEW' | 'BLOCKED';
  reason: string;
  required_documents: string[];
  source_reference: string;
  checked_at: string;
};

export type LogisticsQuote = {
  partner: string;
  vehicle: string;
  cost: number;
  eta_minutes: number;
  capacity_kg: number;
  selected?: boolean;
};

export type TrackingStop = {
  stop: number;
  name: string;
  action: string;
  status: 'DONE' | 'PENDING' | 'EN_ROUTE' | 'DELIVERED';
};

export type TrackingInfo = {
  order_id: string;
  label: string;
  current_status: string;
  events: string[];
  progress_percent: number;
  complete: boolean;
  route_stops: TrackingStop[];
};

export type OrderItem = {
  id: string;
  order_id: string;
  farmer_id?: string;
  farmer_name?: string;
  crop: string;
  quantity_kg: number;
  unit_price: number;
  total_price?: number;
  status: 'PENDING_ACCEPTANCE' | 'ACCEPTED' | 'REJECTED';
  pickup_window?: string;
  order_status?: string;
  delivery_location?: string;
  created_at?: string;
};

export type BuyerAnalytics = {
  demands_count: number;
  total_demand_kg: number;
  orders_count: number;
  fulfilled_orders_count: number;
  total_spend: number;
  fulfillment_rate: number;
  orders_status_breakdown: Record<string, number>;
};

export type FarmerAnalytics = {
  active_listings_count: number;
  total_listed_kg: number;
  total_allocated_kg: number;
  completed_orders_count: number;
  fulfillment_rate: number;
  total_revenue: number;
  average_rating: number;
  reliability: number;
  ratings_count: number;
  recent_feedback: Array<{
    score: number;
    comment: string;
    created_at: string;
  }>;
};

export type BuyerOrder = {
  id: string;
  status: string;
  produce_subtotal: number;
  logistics_cost: number;
  total: number;
  delivery_location: string;
  created_at: string;
  selected_vehicle?: string;
  items: OrderItem[];
};

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  role: 'FARMER' | 'FPO' | 'BUYER' | 'ADMIN' | 'LOGISTICS_PARTNER';
  location: string;
  state: string;
  reliability: number;
};

