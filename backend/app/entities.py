from datetime import datetime, timezone
from sqlalchemy import String, Float, DateTime, ForeignKey, Text, Boolean, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base

def utc_now():
    return datetime.now(timezone.utc)

class UserEntity(Base):
    __tablename__ = 'users'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String)
    role: Mapped[str] = mapped_column(String, index=True) # FARMER, FPO, BUYER, CONSUMER, ADMIN, LOGISTICS_PARTNER
    location: Mapped[str] = mapped_column(String)
    state: Mapped[str] = mapped_column(String, default='Maharashtra')
    latitude: Mapped[float] = mapped_column(Float, default=18.5204)
    longitude: Mapped[float] = mapped_column(Float, default=73.8567)
    reliability: Mapped[float] = mapped_column(Float, default=90.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

class ListingEntity(Base):
    __tablename__ = 'produce_listings'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    farmer_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    crop: Mapped[str] = mapped_column(String, index=True)
    quantity_kg: Mapped[float] = mapped_column(Float)
    quality_grade: Mapped[str] = mapped_column(String)
    asking_price: Mapped[float] = mapped_column(Float)
    ready_date: Mapped[str] = mapped_column(String)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String, default='ACTIVE')
    # Perishable Product Intelligence
    harvest_date: Mapped[str] = mapped_column(String, default='')
    shelf_life_days: Mapped[int] = mapped_column(Integer, default=7)
    storage_type: Mapped[str] = mapped_column(String, default='VENTILATED') # AMBIENT, VENTILATED, REFRIGERATED, FROZEN
    temperature_min: Mapped[float] = mapped_column(Float, default=12.0)
    temperature_max: Mapped[float] = mapped_column(Float, default=18.0)
    perishability_level: Mapped[str] = mapped_column(String, default='MEDIUM') # LOW, MEDIUM, HIGH, CRITICAL
    farmer: Mapped[UserEntity] = relationship()

class DemandEntity(Base):
    __tablename__ = 'demand_requests'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    buyer_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    crop: Mapped[str] = mapped_column(String)
    quantity_kg: Mapped[float] = mapped_column(Float)
    quality_requirement: Mapped[str] = mapped_column(String)
    max_price: Mapped[float] = mapped_column(Float)
    delivery_date: Mapped[str] = mapped_column(String)
    location: Mapped[str] = mapped_column(String)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    radius_km: Mapped[float] = mapped_column(Float, default=100)
    status: Mapped[str] = mapped_column(String, default='OPEN')

class OrderItemEntity(Base):
    __tablename__ = 'order_items'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    order_id: Mapped[str] = mapped_column(ForeignKey('orders.id'), index=True)
    listing_id: Mapped[str | None] = mapped_column(ForeignKey('produce_listings.id'), nullable=True)
    farmer_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    farmer_name: Mapped[str] = mapped_column(String, default='')
    crop: Mapped[str] = mapped_column(String, default='Tomatoes')
    quantity_kg: Mapped[float] = mapped_column(Float)
    unit_price: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String, default='PENDING_ACCEPTANCE')
    pickup_window: Mapped[str] = mapped_column(String, default='8:00 AM - 11:00 AM')
    storage_type: Mapped[str] = mapped_column(String, default='VENTILATED')
    perishability_level: Mapped[str] = mapped_column(String, default='MEDIUM')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    order: Mapped['OrderEntity'] = relationship(back_populates='items')

class OrderEntity(Base):
    __tablename__ = 'orders'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    buyer_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    status: Mapped[str] = mapped_column(String, default='PENDING')
    produce_subtotal: Mapped[float] = mapped_column(Float)
    logistics_cost: Mapped[float] = mapped_column(Float, default=0)
    total: Mapped[float] = mapped_column(Float)
    delivery_location: Mapped[str] = mapped_column(String, default='Pune')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    items: Mapped[list[OrderItemEntity]] = relationship(back_populates='order', cascade='all, delete-orphan')

class NotificationEntity(Base):
    __tablename__ = 'notifications'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    body: Mapped[str] = mapped_column(Text)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

class AuditEntity(Base):
    __tablename__ = 'audit_logs'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    actor_id: Mapped[str] = mapped_column(String)
    action: Mapped[str] = mapped_column(String)
    entity_id: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

class ComplianceCheckEntity(Base):
    __tablename__ = 'compliance_checks'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    order_id: Mapped[str | None] = mapped_column(ForeignKey('orders.id'), nullable=True, index=True)
    outcome: Mapped[str] = mapped_column(String)
    reason: Mapped[str] = mapped_column(Text)
    required_documents: Mapped[str] = mapped_column(Text, default='[]')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

class LogisticsRequestEntity(Base):
    __tablename__ = 'logistics_requests'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    order_id: Mapped[str | None] = mapped_column(ForeignKey('orders.id'), nullable=True, index=True)
    selected_vehicle: Mapped[str | None] = mapped_column(String, nullable=True)
    quote_cost: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String, default='REQUESTED')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

class LogisticsQuoteEntity(Base):
    __tablename__ = 'logistics_quotes'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    request_id: Mapped[str] = mapped_column(ForeignKey('logistics_requests.id'), index=True)
    provider: Mapped[str] = mapped_column(String)
    vehicle: Mapped[str] = mapped_column(String)
    cost: Mapped[float] = mapped_column(Float)
    eta_minutes: Mapped[int] = mapped_column()
    selected: Mapped[bool] = mapped_column(Boolean, default=False)

class TrackingEventEntity(Base):
    __tablename__ = 'tracking_events'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    order_id: Mapped[str | None] = mapped_column(ForeignKey('orders.id'), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

class RatingEntity(Base):
    __tablename__ = 'ratings'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    order_id: Mapped[str | None] = mapped_column(ForeignKey('orders.id'), nullable=True, index=True)
    buyer_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    farmer_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    score: Mapped[int] = mapped_column()
    comment: Mapped[str] = mapped_column(Text, default='')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

# Asset-light Partner Hub / Collection Center (No FarmDirect-owned warehouse)
class PartnerHubEntity(Base):
    __tablename__ = 'partner_hubs'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    hub_type: Mapped[str] = mapped_column(String, default='FPO_COLLECTION_CENTER') # FPO_COLLECTION_CENTER, PARTNER_STORE, COLD_STORAGE_PARTNER
    location: Mapped[str] = mapped_column(String)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    capacity_kg: Mapped[float] = mapped_column(Float, default=5000.0)
    has_cold_storage: Mapped[bool] = mapped_column(Boolean, default=False)
    temperature_min: Mapped[float] = mapped_column(Float, default=2.0)
    temperature_max: Mapped[float] = mapped_column(Float, default=8.0)
    handling_fee_per_kg: Mapped[float] = mapped_column(Float, default=1.5)
    operational_model: Mapped[str] = mapped_column(String, default='ASSET_LIGHT_CROSS_DOCK')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)

# Household Consumer Orders
class ConsumerOrderEntity(Base):
    __tablename__ = 'consumer_orders'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    consumer_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    cluster_id: Mapped[str | None] = mapped_column(String, nullable=True)
    hub_id: Mapped[str | None] = mapped_column(ForeignKey('partner_hubs.id'), nullable=True)
    status: Mapped[str] = mapped_column(String, default='PLACED') # PLACED, AGGREGATED, IN_TRANSIT, DELIVERED, CANCELLED
    subtotal: Mapped[float] = mapped_column(Float)
    delivery_fee: Mapped[float] = mapped_column(Float, default=30.0)
    total: Mapped[float] = mapped_column(Float)
    delivery_address: Mapped[str] = mapped_column(String)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    delivery_window: Mapped[str] = mapped_column(String, default='4:00 PM - 7:00 PM')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    items: Mapped[list['ConsumerOrderItemEntity']] = relationship(back_populates='order', cascade='all, delete-orphan')
    consumer: Mapped[UserEntity] = relationship()
    hub: Mapped[PartnerHubEntity | None] = relationship()

class ConsumerOrderItemEntity(Base):
    __tablename__ = 'consumer_order_items'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    consumer_order_id: Mapped[str] = mapped_column(ForeignKey('consumer_orders.id'), index=True)
    listing_id: Mapped[str | None] = mapped_column(ForeignKey('produce_listings.id'), nullable=True)
    farmer_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    farmer_name: Mapped[str] = mapped_column(String, default='')
    crop: Mapped[str] = mapped_column(String)
    quantity_kg: Mapped[float] = mapped_column(Float)
    unit_price: Mapped[float] = mapped_column(Float)
    storage_type: Mapped[str] = mapped_column(String, default='VENTILATED')
    perishability_level: Mapped[str] = mapped_column(String, default='MEDIUM')
    order: Mapped[ConsumerOrderEntity] = relationship(back_populates='items')

# Real Route Optimization Persistence
class RouteEntity(Base):
    __tablename__ = 'optimized_routes'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    route_type: Mapped[str] = mapped_column(String) # 'BULK_PICKUP' or 'LAST_MILE_HOUSEHOLD'
    reference_id: Mapped[str | None] = mapped_column(String, nullable=True) # Order ID or Cluster ID
    hub_id: Mapped[str | None] = mapped_column(ForeignKey('partner_hubs.id'), nullable=True)
    vehicle_type: Mapped[str] = mapped_column(String)
    is_cold_chain: Mapped[bool] = mapped_column(Boolean, default=False)
    total_distance_km: Mapped[float] = mapped_column(Float)
    baseline_distance_km: Mapped[float] = mapped_column(Float)
    distance_saved_km: Mapped[float] = mapped_column(Float)
    fuel_cost_saving_inr: Mapped[float] = mapped_column(Float)
    estimated_duration_mins: Mapped[int] = mapped_column(Integer)
    spoilage_risk_level: Mapped[str] = mapped_column(String, default='LOW')
    status: Mapped[str] = mapped_column(String, default='OPTIMIZED')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    stops: Mapped[list['RouteStopEntity']] = relationship(back_populates='route', cascade='all, delete-orphan')

class RouteStopEntity(Base):
    __tablename__ = 'optimized_route_stops'
    id: Mapped[str] = mapped_column(String, primary_key=True)
    route_id: Mapped[str] = mapped_column(ForeignKey('optimized_routes.id'), index=True)
    sequence: Mapped[int] = mapped_column(Integer)
    stop_type: Mapped[str] = mapped_column(String) # 'PICKUP', 'CROSS_DOCK', 'DELIVERY'
    entity_id: Mapped[str] = mapped_column(String)
    name: Mapped[str] = mapped_column(String)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    action: Mapped[str] = mapped_column(String)
    quantity_kg: Mapped[float] = mapped_column(Float)
    estimated_arrival_mins: Mapped[int] = mapped_column(Integer, default=0)
    route: Mapped[RouteEntity] = relationship(back_populates='stops')
