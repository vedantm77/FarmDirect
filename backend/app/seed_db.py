from uuid import uuid4
from datetime import date, timedelta, datetime, timezone
from sqlalchemy.orm import Session
from .entities import (
    UserEntity, ListingEntity, DemandEntity, OrderEntity, OrderItemEntity,
    NotificationEntity, AuditEntity, ComplianceCheckEntity,
    LogisticsRequestEntity, LogisticsQuoteEntity, TrackingEventEntity, RatingEntity,
    PartnerHubEntity, ConsumerOrderEntity, ConsumerOrderItemEntity,
    RouteEntity, RouteStopEntity
)
from .security import hash_password, verify_password
from .clustering import PARTNER_HUBS

DEMO_PASSWORD = 'FarmDirect2026!'

def seed(db: Session):
    if db.query(UserEntity).count():
        # Ensure presentation credentials are valid for existing seed users
        farmer = db.get(UserEntity, 'farmer-1')
        if farmer and not verify_password('farmer123', farmer.password_hash):
            farmer.password_hash = hash_password('farmer123')
            db.commit()
        buyer = db.get(UserEntity, 'buyer-demo')
        if buyer and not verify_password('buyer123', buyer.password_hash):
            buyer.password_hash = hash_password('buyer123')
            db.commit()
        consumer = db.get(UserEntity, 'consumer-1')
        if consumer and not verify_password('consumer123', consumer.password_hash):
            consumer.password_hash = hash_password('consumer123')
            db.commit()
        return

    today = date.today()
    yesterday = str(today - timedelta(days=1))
    two_days_ago = str(today - timedelta(days=2))
    five_days_ago = str(today - timedelta(days=5))

    # 1. Users (Farmer, FPO, Buyer, Consumer, Admin, Logistics)
    users = [
        ('buyer-demo', 'Pune Institutional Buyer (Demo)', 'buyer@farmdirect.demo', 'BUYER', 'Pune', 18.5204, 73.8567, 90.0, 'buyer123'),
        ('farmer-1', 'Khed Farmer Group (Demo)', 'farmer@farmdirect.demo', 'FARMER', 'Khed', 18.738, 73.846, 96.0, 'farmer123'),
        ('fpo-1', 'Baramati FPO (Demo)', 'fpo@farmdirect.demo', 'FPO', 'Baramati', 18.151, 74.578, 94.0, 'farmer123'),
        ('farmer-3', 'Junnar Growers Collective (Demo)', 'junnar@farmdirect.demo', 'FARMER', 'Junnar', 19.208, 73.875, 92.0, 'farmer123'),
        ('farmer-4', 'Mulshi Farmer Group (Demo)', 'mulshi@farmdirect.demo', 'FARMER', 'Mulshi', 18.508, 73.513, 97.0, 'farmer123'),
        ('admin-demo', 'FarmDirect Admin (Demo)', 'admin@farmdirect.demo', 'ADMIN', 'Pune', 18.5204, 73.8567, 95.0, DEMO_PASSWORD),
        ('logistics-demo', 'Demo Logistics Partner', 'logistics@farmdirect.demo', 'LOGISTICS_PARTNER', 'Pune', 18.5204, 73.8567, 98.0, DEMO_PASSWORD),
        # Household Consumers (Pune regional clusters for DBSCAN)
        ('consumer-1', 'Priya Sharma (Household)', 'consumer@farmdirect.demo', 'CONSUMER', 'Kothrud, Pune', 18.5074, 73.8077, 98.0, 'consumer123'),
        ('consumer-2', 'Amit Patil (Household)', 'amit@farmdirect.demo', 'CONSUMER', 'Kothrud, Pune', 18.5030, 73.8010, 95.0, 'consumer123'),
        ('consumer-3', 'Sneha Kulkarni (Household)', 'sneha@farmdirect.demo', 'CONSUMER', 'Kothrud, Pune', 18.5110, 73.8140, 97.0, 'consumer123'),
        ('consumer-4', 'Rajesh Deshmukh (Household)', 'rajesh@farmdirect.demo', 'CONSUMER', 'Deccan, Pune', 18.5167, 73.8410, 96.0, 'consumer123')
    ]
    for uid, name, email, role, loc, lat, lng, rel, pwd in users:
        db.add(UserEntity(
            id=uid, name=name, email=email,
            password_hash=hash_password(pwd),
            role=role, location=loc, state='Maharashtra',
            latitude=lat, longitude=lng, reliability=rel
        ))
    db.flush()

    # 2. Asset-Light Partner Hubs (No FarmDirect-owned warehouses)
    for hub_data in PARTNER_HUBS:
        db.add(PartnerHubEntity(
            id=hub_data['id'],
            name=hub_data['name'],
            hub_type=hub_data['hub_type'],
            location=hub_data['location'],
            latitude=hub_data['latitude'],
            longitude=hub_data['longitude'],
            capacity_kg=hub_data['capacity_kg'],
            has_cold_storage=hub_data['has_cold_storage'],
            temperature_min=2.0 if hub_data['has_cold_storage'] else 15.0,
            temperature_max=8.0 if hub_data['has_cold_storage'] else 25.0,
            handling_fee_per_kg=1.5,
            operational_model=hub_data['operational_model']
        ))
    db.flush()

    # 3. Produce Listings with Rich Perishability Attributes
    listings = [
        # id, fid, crop, qty, grade, price, ready_date, lat, lng, harvest_date, shelf_life, storage, t_min, t_max, perishability
        ('l1', 'farmer-1', 'Tomatoes', 420.0, 'A', 27.0, str(today + timedelta(days=1)), 18.738, 73.846, yesterday, 7, 'VENTILATED', 12.0, 18.0, 'MEDIUM'),
        ('l2', 'fpo-1', 'Tomatoes', 330.0, 'A', 26.0, str(today + timedelta(days=1)), 18.151, 74.578, yesterday, 7, 'VENTILATED', 12.0, 18.0, 'MEDIUM'),
        ('l3', 'farmer-3', 'Tomatoes', 250.0, 'A', 25.0, str(today + timedelta(days=2)), 19.208, 73.875, two_days_ago, 7, 'VENTILATED', 12.0, 18.0, 'MEDIUM'),
        ('l4', 'fpo-1', 'Onions', 500.0, 'A', 24.0, str(today), 18.117, 75.026, five_days_ago, 45, 'VENTILATED', 15.0, 25.0, 'LOW'),
        ('l5', 'farmer-4', 'Strawberries', 120.0, 'A', 180.0, str(today), 18.508, 73.513, str(today), 3, 'REFRIGERATED', 2.0, 5.0, 'CRITICAL'),
        ('l6', 'farmer-1', 'Spinach', 80.0, 'A', 35.0, str(today), 18.738, 73.846, str(today), 2, 'REFRIGERATED', 2.0, 6.0, 'CRITICAL'),
        ('l7', 'farmer-3', 'Potatoes', 600.0, 'A', 22.0, str(today), 19.208, 73.875, five_days_ago, 30, 'AMBIENT', 15.0, 25.0, 'LOW'),
    ]
    for lid, fid, crop, qty, grade, price, rdate, lat, lng, hdate, slife, stype, tmin, tmax, plvl in listings:
        db.add(ListingEntity(
            id=lid, farmer_id=fid, crop=crop, quantity_kg=qty,
            quality_grade=grade, asking_price=price, ready_date=rdate,
            latitude=lat, longitude=lng, status='ACTIVE',
            harvest_date=hdate, shelf_life_days=slife, storage_type=stype,
            temperature_min=tmin, temperature_max=tmax, perishability_level=plvl
        ))
    db.flush()

    # 4. Seeded Bulk Demand Request (1,000 kg Tomatoes for Pune Institutional Buyer)
    demand = DemandEntity(
        id='d1', buyer_id='buyer-demo', crop='Tomatoes', quantity_kg=1000.0,
        quality_requirement='A', max_price=30.0, delivery_date=str(today + timedelta(days=3)),
        location='Pune', latitude=18.5204, longitude=73.8567, radius_km=120.0, status='OPEN'
    )
    db.add(demand)

    # 5. Seeded Order (Deterministic 420 + 330 + 250 = 1,000 kg allocation)
    order_id = 'FD-2026-DEMO01'
    order = OrderEntity(
        id=order_id, buyer_id='buyer-demo', status='CONFIRMED',
        produce_subtotal=26170.0, logistics_cost=1840.0, total=28010.0,
        delivery_location='Pune'
    )
    db.add(order)
    db.flush()

    # 6. Order Items / Allocations with storage attributes
    allocations = [
        ('oi-1', order_id, 'l1', 'farmer-1', 'Khed Farmer Group (Demo)', 'Tomatoes', 420.0, 27.0, 'ACCEPTED', '8:00 AM - 11:00 AM', 'VENTILATED', 'MEDIUM'),
        ('oi-2', order_id, 'l2', 'fpo-1', 'Baramati FPO (Demo)', 'Tomatoes', 330.0, 26.0, 'ACCEPTED', '9:00 AM - 12:00 PM', 'VENTILATED', 'MEDIUM'),
        ('oi-3', order_id, 'l3', 'farmer-3', 'Junnar Growers Collective (Demo)', 'Tomatoes', 250.0, 25.0, 'PENDING_ACCEPTANCE', '10:00 AM - 1:00 PM', 'VENTILATED', 'MEDIUM'),
    ]
    for oi_id, o_id, l_id, f_id, f_name, crop, qty, price, status, window, stype, plvl in allocations:
        db.add(OrderItemEntity(
            id=oi_id, order_id=o_id, listing_id=l_id, farmer_id=f_id,
            farmer_name=f_name, crop=crop, quantity_kg=qty, unit_price=price,
            status=status, pickup_window=window, storage_type=stype, perishability_level=plvl
        ))

    # 7. Compliance Checks
    db.add(ComplianceCheckEntity(
        id='cc-1', order_id=order_id, outcome='PASSED',
        reason='Configured Maharashtra direct-sale pathway confirmed. Farmer/FPO verified.',
        required_documents='["Farmer Land Record/7-12 extract", "FPO Registration Certificate"]'
    ))

    # 8. Logistics Request and Quotes
    logistics_req = LogisticsRequestEntity(
        id='lr-demo', order_id=order_id, selected_vehicle='Mini Truck',
        quote_cost=1840.0, status='VEHICLE_ASSIGNED'
    )
    db.add(logistics_req)
    db.flush()

    db.add(LogisticsQuoteEntity(
        id='lq-1', request_id=logistics_req.id, provider='Demo Logistics Partner',
        vehicle='Mini Truck', cost=1840.0, eta_minutes=135, selected=True
    ))
    db.add(LogisticsQuoteEntity(
        id='lq-2', request_id=logistics_req.id, provider='Pune Route Network',
        vehicle='Tempo', cost=2200.0, eta_minutes=110, selected=False
    ))

    # 9. Tracking Events
    tracking_statuses = ['CONFIRMED', 'LOGISTICS_REQUESTED', 'VEHICLE_ASSIGNED']
    for idx, st in enumerate(tracking_statuses):
        db.add(TrackingEventEntity(id=f'te-{idx+1}', order_id=order_id, status=st))

    # 10. Past Ratings / Feedback
    db.add(RatingEntity(
        id='r-1', order_id=order_id, buyer_id='buyer-demo', farmer_id='farmer-1',
        score=5, comment='Superb Grade A tomatoes, timely pickup coordination.'
    ))
    db.add(RatingEntity(
        id='r-2', order_id=order_id, buyer_id='buyer-demo', farmer_id='fpo-1',
        score=5, comment='Very consistent quality and reliable bulk packaging.'
    ))

    # 11. Seeded Consumer Orders (Scenario C: Aggregation of Small Household Orders via Partner Cross-Dock)
    c_orders = [
        ('co-1', 'consumer-1', 'cluster-kothrud', 'hub-3', 'AGGREGATED', 80.0, 30.0, 110.0, 'Flat 402, Mayur Colony, Kothrud, Pune', 18.5074, 73.8077),
        ('co-2', 'consumer-2', 'cluster-kothrud', 'hub-3', 'AGGREGATED', 125.0, 30.0, 155.0, 'B-12, Dahanukar Colony, Kothrud, Pune', 18.5030, 73.8010),
        ('co-3', 'consumer-3', 'cluster-kothrud', 'hub-3', 'AGGREGATED', 198.0, 30.0, 228.0, 'Plot 8, Ideal Colony, Kothrud, Pune', 18.5110, 73.8140),
        ('co-4', 'consumer-4', None, 'hub-3', 'PLACED', 135.0, 30.0, 165.0, 'Prabhat Road, Deccan Gymkhana, Pune', 18.5167, 73.8410),
    ]
    for co_id, cid, clus_id, hid, st, sub, fee, tot, addr, lat, lng in c_orders:
        db.add(ConsumerOrderEntity(
            id=co_id, consumer_id=cid, cluster_id=clus_id, hub_id=hid,
            status=st, subtotal=sub, delivery_fee=fee, total=tot,
            delivery_address=addr, latitude=lat, longitude=lng,
            delivery_window='4:00 PM - 7:00 PM'
        ))
    db.flush()

    # Consumer Order Items (Demonstrating Multi-Crop Basket Consolidation)
    c_items = [
        ('coi-1', 'co-1', 'l1', 'farmer-1', 'Khed Farmer Group (Demo)', 'Tomatoes', 2.0, 27.0, 'VENTILATED', 'MEDIUM'),
        ('coi-2', 'co-1', 'l4', 'fpo-1', 'Baramati FPO (Demo)', 'Onions', 1.0, 26.0, 'VENTILATED', 'LOW'),
        ('coi-3', 'co-2', 'l1', 'farmer-1', 'Khed Farmer Group (Demo)', 'Tomatoes', 3.0, 27.0, 'VENTILATED', 'MEDIUM'),
        ('coi-4', 'co-2', 'l7', 'farmer-3', 'Junnar Growers Collective (Demo)', 'Potatoes', 2.0, 22.0, 'AMBIENT', 'LOW'),
        ('coi-5', 'co-3', 'l1', 'farmer-1', 'Khed Farmer Group (Demo)', 'Tomatoes', 4.0, 27.0, 'VENTILATED', 'MEDIUM'),
        ('coi-6', 'co-3', 'l5', 'farmer-4', 'Mulshi Farmer Group (Demo)', 'Strawberries', 0.5, 180.0, 'REFRIGERATED', 'CRITICAL'),
        ('coi-7', 'co-4', 'l1', 'farmer-1', 'Khed Farmer Group (Demo)', 'Tomatoes', 5.0, 27.0, 'VENTILATED', 'MEDIUM'),
    ]
    for coi_id, co_id, lid, fid, fname, crop, qty, price, stype, plvl in c_items:
        db.add(ConsumerOrderItemEntity(
            id=coi_id, consumer_order_id=co_id, listing_id=lid, farmer_id=fid,
            farmer_name=fname, crop=crop, quantity_kg=qty, unit_price=price,
            storage_type=stype, perishability_level=plvl
        ))

    # 12. Seeded Notifications
    db.add(NotificationEntity(
        id='n1', user_id='buyer-demo',
        body='Your demand for 1,000 kg Tomatoes has been matched with 3 farms (420 kg, 330 kg, 250 kg).'
    ))
    db.add(NotificationEntity(
        id='n2', user_id='farmer-1',
        body='Order FD-2026-DEMO01 confirmed: 420 kg Tomatoes allocated for pickup window 8:00 AM - 11:00 AM.'
    ))
    db.add(NotificationEntity(
        id='n3', user_id='consumer-1',
        body='Order co-1 aggregated at Kothrud Cooperative Collection Point. Dispatched via EV Last-Mile delivery.'
    ))

    # 13. Audit logs
    db.add(AuditEntity(id=str(uuid4()), actor_id='system', action='SEED_DATA_INITIALIZED', entity_id='system'))
    db.commit()
