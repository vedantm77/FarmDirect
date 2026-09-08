export type MatchScore = {
  overall: number;
  distance: number;
  price: number;
  quantity: number;
  quality: number;
  readiness: number;
  reliability: number;
  freshness?: number;
  delivery_feasibility?: number;
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
  // Perishability & Freshness
  harvest_date?: string;
  shelf_life_days?: number;
  storage_type?: string;
  temperature_min?: number;
  temperature_max?: number;
  perishability_level?: string;
  freshness_percentage?: number;
  remaining_shelf_life_days?: number;
  urgency_level?: 'FRESH' | 'MODERATE' | 'URGENT' | 'CRITICAL';
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
  storage_type?: string;
  perishability_level?: string;
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
  buyer_type?: string;
  delivery_budget?: number | string;
  preferred_window?: string;
  handling_notes?: string;
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
  requires_cold_chain?: boolean;
  spoilage_risk?: string;
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
  storage_type?: string;
  perishability_level?: string;
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
  role: 'FARMER' | 'FPO' | 'BUYER' | 'CONSUMER' | 'ADMIN' | 'LOGISTICS_PARTNER';
  location: string;
  state: string;
  reliability: number;
  latitude?: number;
  longitude?: number;
};

// Real ML Demand Forecasting
export type DemandForecast = {
  crop: string;
  location: string;
  predicted_quantity: number;
  historical_average: number;
  trend: 'Increasing' | 'Decreasing' | 'Stable';
  forecast_method: string;
  data_points_used: number;
  active_supply: number;
  supply_gap: number;
  market_status: 'Supply Shortage' | 'Surplus Risk' | 'Balanced';
  recommendation: string;
  model_version?: string;
};

// Real ML Spoilage Risk
export type SpoilageRisk = {
  crop: string;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  risk_score_percent: number;
  feasibility_status: 'SAFE' | 'WARNING' | 'HIGH_RISK' | 'UNSAFE';
  estimated_transit_hours: number;
  remaining_shelf_life_hours: number;
  recommended_vehicle: string;
  requires_cold_chain: boolean;
  expected_produce_value: number;
  recommendation: string;
  method: string;
};

// Real Route Optimization
export type RouteStopDetail = {
  stop: number;
  stop_type: 'PICKUP' | 'CROSS_DOCK' | 'DELIVERY';
  name: string;
  lat: number;
  lng: number;
  action: string;
  quantity_kg: number;
  estimated_arrival_mins: number;
};

export type RouteOptimization = {
  route_id: string;
  route_type: 'BULK_PICKUP' | 'LAST_MILE_HOUSEHOLD';
  stop_sequence: RouteStopDetail[];
  total_distance_km: number;
  baseline_distance_km: number;
  distance_saved_km: number;
  fuel_cost_saving_inr: number;
  estimated_duration_mins: number;
  spoilage_risk: string;
  vehicle_recommended: string;
  is_cold_chain: boolean;
  perishability_warnings: string[];
  optimization_method: string;
};

// Household Consumer Marketplace & Small Order Aggregation
export type ConsumerProduct = {
  id: string;
  farmer_id: string;
  farmer_name: string;
  crop: string;
  available_kg: number;
  quality_grade: string;
  price_per_kg: number;
  harvest_date: string;
  storage_type: string;
  perishability_level: string;
  freshness_percentage: number;
  remaining_shelf_life_days: number;
  urgency_level: 'FRESH' | 'MODERATE' | 'URGENT' | 'CRITICAL';
  location: string;
  latitude: number;
  longitude: number;
};

export type ConsumerOrderItem = {
  crop: string;
  quantity_kg: number;
  unit_price: number;
  farmer_name?: string;
  storage_type?: string;
  perishability_level?: string;
};

export type ConsumerOrder = {
  order_id: string;
  status: 'PLACED' | 'AGGREGATED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';
  subtotal: number;
  delivery_fee: number;
  total: number;
  delivery_address: string;
  delivery_window: string;
  created_at: string;
  hub_name?: string;
  items: ConsumerOrderItem[];
};

export type ClusterStop = {
  order_id: string;
  consumer_name: string;
  lat: number;
  lng: number;
  address: string;
  total_kg: number;
};

export type ConsumerCluster = {
  cluster_id: string;
  zone_name: string;
  consumer_count: number;
  order_count: number;
  total_quantity_kg: number;
  center_latitude: number;
  center_longitude: number;
  recommended_hub_id: string;
  recommended_hub_name: string;
  orders: ClusterStop[];
  clustering_method: string;
};

export type PartnerHub = {
  id: string;
  name: string;
  hub_type: string;
  location: string;
  latitude: number;
  longitude: number;
  capacity_kg: number;
  has_cold_storage: boolean;
  temperature_min?: number;
  temperature_max?: number;
  temperature_range?: string;
  operational_model?: string;
};

export type SurplusAlert = {
  listing_id: string;
  crop: string;
  farmer_name: string;
  quantity_kg: number;
  remaining_shelf_life_days: number;
  freshness_percentage: number;
  urgency_level: string;
  suggested_discount_percent: number;
  recommended_actions: string[];
};
