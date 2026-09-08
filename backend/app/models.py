from enum import StrEnum
from pydantic import BaseModel, Field, EmailStr
from datetime import date, datetime
from typing import Literal

class Role(StrEnum):
    FARMER = 'FARMER'
    FPO = 'FPO'
    BUYER = 'BUYER'
    CONSUMER = 'CONSUMER'
    ADMIN = 'ADMIN'
    LOGISTICS_PARTNER = 'LOGISTICS_PARTNER'

class User(BaseModel):
    id: str
    name: str
    email: EmailStr
    role: Role
    location: str
    state: str = 'Maharashtra'
    latitude: float = 18.5204
    longitude: float = 73.8567

# Sensible presets for agricultural crops
PERISHABILITY_PRESETS = {
    'tomatoes': {
        'shelf_life_days': 7,
        'storage_type': 'VENTILATED',
        'temperature_min': 12.0,
        'temperature_max': 18.0,
        'perishability_level': 'MEDIUM'
    },
    'spinach': {
        'shelf_life_days': 2,
        'storage_type': 'REFRIGERATED',
        'temperature_min': 2.0,
        'temperature_max': 6.0,
        'perishability_level': 'CRITICAL'
    },
    'strawberries': {
        'shelf_life_days': 3,
        'storage_type': 'REFRIGERATED',
        'temperature_min': 2.0,
        'temperature_max': 5.0,
        'perishability_level': 'CRITICAL'
    },
    'potatoes': {
        'shelf_life_days': 30,
        'storage_type': 'AMBIENT',
        'temperature_min': 15.0,
        'temperature_max': 25.0,
        'perishability_level': 'LOW'
    },
    'onions': {
        'shelf_life_days': 45,
        'storage_type': 'VENTILATED',
        'temperature_min': 15.0,
        'temperature_max': 25.0,
        'perishability_level': 'LOW'
    }
}

class FreshnessInfo(BaseModel):
    product_age_days: float
    remaining_shelf_life_days: float
    freshness_percentage: float
    urgency_level: Literal['FRESH', 'MODERATE', 'URGENT', 'CRITICAL']

class ProduceListing(BaseModel):
    id: str
    farmer_id: str
    farmer_name: str
    crop: str
    quantity_kg: float
    quality_grade: str
    asking_price: float
    ready_date: date | str
    latitude: float
    longitude: float
    reliability: float = 96
    status: str = 'ACTIVE'
    # Perishable Product Intelligence
    harvest_date: str = ''
    shelf_life_days: int = 7
    storage_type: str = 'VENTILATED'
    temperature_min: float = 12.0
    temperature_max: float = 18.0
    perishability_level: str = 'MEDIUM'
    freshness_percentage: float = 100.0
    remaining_shelf_life_days: float = 7.0
    urgency_level: str = 'FRESH'

class DemandRequest(BaseModel):
    id: str = ''
    buyer_id: str = 'buyer-demo'
    crop: str
    quantity_kg: float = Field(gt=0)
    quality_requirement: str = 'A'
    max_price: float = Field(gt=0)
    delivery_date: date
    location: str
    latitude: float
    longitude: float
    radius_km: float = 100

class MatchScore(BaseModel):
    overall: float
    distance: float
    price: float
    quantity: float
    quality: float
    readiness: float
    reliability: float
    freshness: float = 100.0
    delivery_feasibility: float = 100.0

class Match(BaseModel):
    listing: ProduceListing
    distance_km: float
    score: MatchScore
    logistics_feasible: bool = True
    explanation: str = ''

class Allocation(BaseModel):
    listing_id: str
    farmer_id: str = ''
    farmer_name: str
    quantity_kg: float
    price_per_kg: float
    distance_km: float
    storage_type: str = 'VENTILATED'
    perishability_level: str = 'MEDIUM'

class MatchResponse(BaseModel):
    matches: list[Match]
    allocations: list[Allocation]
    fulfilled: bool
    message: str

class ComplianceResult(BaseModel):
    rule: str
    status: Literal['PASSED', 'REVIEW', 'BLOCKED']
    reason: str
    required_documents: list[str] = []
    source_reference: str
    checked_at: datetime

class LogisticsQuote(BaseModel):
    partner: str
    vehicle: str
    cost: float
    eta_minutes: int
    capacity_kg: float
    selected: bool = False
    requires_cold_chain: bool = False
    spoilage_risk: str = 'LOW'

# ML Demand Forecast Schema
class DemandForecastResponse(BaseModel):
    crop: str
    location: str
    predicted_quantity: float
    historical_average: float
    trend: Literal['Increasing', 'Decreasing', 'Stable']
    forecast_method: str
    data_points_used: int
    active_supply: float
    supply_gap: float
    market_status: Literal['Supply Shortage', 'Surplus Risk', 'Balanced']
    recommendation: str
    model_version: str = 'RandomForestRegressor-v1.0'

# Legacy Forecast for backward-compatibility
class Forecast(BaseModel):
    crop: str
    region: str
    predicted_demand_tonnes: float
    available_supply_tonnes: float
    supply_gap_tonnes: float
    trend_percent: float
    confidence: float
    recommended_action: str
    label: str = 'RandomForestRegressor ML Forecast (Demonstration Seed Data)'

# Real ML Spoilage Risk
class SpoilageRiskResponse(BaseModel):
    crop: str
    risk_level: Literal['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
    risk_score_percent: float
    feasibility_status: Literal['SAFE', 'WARNING', 'HIGH_RISK', 'UNSAFE']
    estimated_transit_hours: float
    remaining_shelf_life_hours: float
    recommended_vehicle: str
    requires_cold_chain: bool
    expected_produce_value: float
    recommendation: str
    method: str = 'RandomForestClassifier (scikit-learn)'

class OrderItemInput(BaseModel):
    listing_id: str | None = None
    farmer_id: str
    farmer_name: str = ''
    crop: str = 'Tomatoes'
    quantity_kg: float
    unit_price: float
    pickup_window: str = '8:00 AM - 11:00 AM'
    storage_type: str = 'VENTILATED'
    perishability_level: str = 'MEDIUM'

# Route Optimization Schemas
class RouteStopInfo(BaseModel):
    stop: int
    stop_type: Literal['PICKUP', 'CROSS_DOCK', 'DELIVERY']
    name: str
    lat: float
    lng: float
    action: str
    quantity_kg: float
    estimated_arrival_mins: int

class RouteOptimizationResult(BaseModel):
    route_id: str
    route_type: Literal['BULK_PICKUP', 'LAST_MILE_HOUSEHOLD']
    stop_sequence: list[RouteStopInfo]
    total_distance_km: float
    baseline_distance_km: float
    distance_saved_km: float
    fuel_cost_saving_inr: float
    estimated_duration_mins: int
    spoilage_risk: str
    vehicle_recommended: str
    is_cold_chain: bool
    perishability_warnings: list[str] = []
    optimization_method: str

# Consumer Portal & Clustering Schemas
class ConsumerCartItem(BaseModel):
    listing_id: str
    crop: str
    quantity_kg: float
    unit_price: float

class ConsumerOrderCreate(BaseModel):
    items: list[ConsumerCartItem]
    delivery_address: str
    latitude: float
    longitude: float
    delivery_window: str = '4:00 PM - 7:00 PM'

class ClusterStop(BaseModel):
    order_id: str
    consumer_name: str
    lat: float
    lng: float
    address: str
    total_kg: float

class ConsumerCluster(BaseModel):
    cluster_id: str
    zone_name: str
    consumer_count: int
    order_count: int
    total_quantity_kg: float
    center_latitude: float
    center_longitude: float
    recommended_hub_id: str
    recommended_hub_name: str
    orders: list[ClusterStop]
    clustering_method: str

class PartnerHubInfo(BaseModel):
    id: str
    name: str
    hub_type: str
    location: str
    latitude: float
    longitude: float
    capacity_kg: float
    has_cold_storage: bool
    temperature_range: str
    distance_km: float
    operational_model: str = 'Asset-Light Short-Duration Cross-Dock'

class SurplusAlert(BaseModel):
    listing_id: str
    crop: str
    farmer_name: str
    quantity_kg: float
    remaining_shelf_life_days: float
    freshness_percentage: float
    urgency_level: str
    suggested_discount_percent: float
    recommended_actions: list[str]
