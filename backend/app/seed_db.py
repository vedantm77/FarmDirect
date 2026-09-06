from uuid import uuid4
from datetime import date, timedelta
from sqlalchemy.orm import Session
from .entities import (
    UserEntity, ListingEntity, DemandEntity, OrderEntity, OrderItemEntity,
    NotificationEntity, AuditEntity, ComplianceCheckEntity,
    LogisticsRequestEntity, LogisticsQuoteEntity, TrackingEventEntity, RatingEntity
)
from .security import hash_password, verify_password

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
        return
    
    # 1. Users
    users = [
        ('buyer-demo', 'Pune Institutional Buyer (Demo)', 'buyer@farmdirect.demo', 'BUYER', 'Pune', 90, 'buyer123'),
        ('farmer-1', 'Khed Farmer Group (Demo)', 'farmer@farmdirect.demo', 'FARMER', 'Khed', 96, 'farmer123'),
        ('fpo-1', 'Baramati FPO (Demo)', 'fpo@farmdirect.demo', 'FPO', 'Baramati', 94, 'farmer123'),
        ('farmer-3', 'Junnar Growers Collective (Demo)', 'junnar@farmdirect.demo', 'FARMER', 'Junnar', 92, 'farmer123'),
        ('admin-demo', 'FarmDirect Admin (Demo)', 'admin@farmdirect.demo', 'ADMIN', 'Pune', 95, DEMO_PASSWORD),
        ('logistics-demo', 'Demo Logistics Partner', 'logistics@farmdirect.demo', 'LOGISTICS_PARTNER', 'Pune', 98, DEMO_PASSWORD),
    ]
    for uid, name, email, role, loc, rel, pwd in users:
        db.add(UserEntity(
            id=uid, name=name, email=email,
            password_hash=hash_password(pwd),
            role=role, location=loc, state='Maharashtra', reliability=rel
        ))
    db.flush()

    # 2. Produce Listings
    today = date.today()
    listings = [
        ('l1', 'farmer-1', 'Tomatoes', 420.0, 'A', 27.0, str(today + timedelta(days=1)), 18.738, 73.846),
        ('l2', 'fpo-1', 'Tomatoes', 330.0, 'A', 26.0, str(today + timedelta(days=1)), 18.151, 74.578),
        ('l3', 'farmer-3', 'Tomatoes', 250.0, 'A', 25.0, str(today + timedelta(days=2)), 19.208, 73.875),
        ('l4', 'fpo-1', 'Onions', 500.0, 'A', 24.0, str(today), 18.117, 75.026),
    ]
    for lid, fid, crop, qty, grade, price, rdate, lat, lng in listings:
        db.add(ListingEntity(
            id=lid, farmer_id=fid, crop=crop, quantity_kg=qty,
            quality_grade=grade, asking_price=price, ready_date=rdate,
            latitude=lat, longitude=lng, status='ACTIVE'
        ))
    db.flush()

    # 3. Seeded Demand Request (1,000 kg Tomatoes for Pune)
    demand = DemandEntity(
        id='d1', buyer_id='buyer-demo', crop='Tomatoes', quantity_kg=1000.0,
        quality_requirement='A', max_price=30.0, delivery_date=str(today + timedelta(days=3)),
        location='Pune', latitude=18.5204, longitude=73.8567, radius_km=120.0, status='OPEN'
    )
    db.add(demand)

    # 4. Seeded Order (Demonstrating deterministic 420 + 330 + 250 = 1,000 kg allocation)
    order_id = 'FD-2026-DEMO01'
    order = OrderEntity(
        id=order_id, buyer_id='buyer-demo', status='CONFIRMED',
        produce_subtotal=26170.0, logistics_cost=1840.0, total=28010.0,
        delivery_location='Pune'
    )
    db.add(order)
    db.flush()

    # 5. Order Items / Allocations
    allocations = [
        ('oi-1', order_id, 'l1', 'farmer-1', 'Khed Farmer Group (Demo)', 'Tomatoes', 420.0, 27.0, 'ACCEPTED', '8:00 AM - 11:00 AM'),
        ('oi-2', order_id, 'l2', 'fpo-1', 'Baramati FPO (Demo)', 'Tomatoes', 330.0, 26.0, 'ACCEPTED', '9:00 AM - 12:00 PM'),
        ('oi-3', order_id, 'l3', 'farmer-3', 'Junnar Growers Collective (Demo)', 'Tomatoes', 250.0, 25.0, 'PENDING_ACCEPTANCE', '10:00 AM - 1:00 PM'),
    ]
    for oi_id, o_id, l_id, f_id, f_name, crop, qty, price, status, window in allocations:
        db.add(OrderItemEntity(
            id=oi_id, order_id=o_id, listing_id=l_id, farmer_id=f_id,
            farmer_name=f_name, crop=crop, quantity_kg=qty, unit_price=price,
            status=status, pickup_window=window
        ))

    # 6. Compliance Checks
    db.add(ComplianceCheckEntity(
        id='cc-1', order_id=order_id, outcome='PASSED',
        reason='Configured Maharashtra direct-sale pathway confirmed. Farmer/FPO verified.',
        required_documents='["Farmer Land Record/7-12 extract", "FPO Registration Certificate"]'
    ))

    # 7. Logistics Request and Quotes
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

    # 8. Tracking Events
    tracking_statuses = ['CONFIRMED', 'LOGISTICS_REQUESTED', 'VEHICLE_ASSIGNED']
    for idx, st in enumerate(tracking_statuses):
        db.add(TrackingEventEntity(id=f'te-{idx+1}', order_id=order_id, status=st))

    # 9. Past Ratings / Feedback
    db.add(RatingEntity(
        id='r-1', order_id=order_id, buyer_id='buyer-demo', farmer_id='farmer-1',
        score=5, comment='Superb Grade A tomatoes, timely pickup coordination.'
    ))
    db.add(RatingEntity(
        id='r-2', order_id=order_id, buyer_id='buyer-demo', farmer_id='fpo-1',
        score=5, comment='Very consistent quality and reliable bulk packaging.'
    ))

    # 10. Notifications
    db.add(NotificationEntity(
        id='n1', user_id='buyer-demo',
        body='Your demand for 1,000 kg Tomatoes has been matched with 3 farms (420 kg, 330 kg, 250 kg).'
    ))
    db.add(NotificationEntity(
        id='n2', user_id='farmer-1',
        body='Order FD-2026-DEMO01 confirmed: 420 kg Tomatoes allocated for pickup window 8:00 AM - 11:00 AM.'
    ))
    db.add(NotificationEntity(
        id='n3', user_id='fpo-1',
        body='Order FD-2026-DEMO01 confirmed: 330 kg Tomatoes allocated for pickup window 9:00 AM - 12:00 PM.'
    ))
    db.add(NotificationEntity(
        id='n4', user_id='farmer-3',
        body='New allocation request: 250 kg Tomatoes for Order FD-2026-DEMO01. Please review and accept.'
    ))

    # 11. Audit logs
    db.add(AuditEntity(id=str(uuid4()), actor_id='system', action='SEED_DATA_INITIALIZED', entity_id='system'))
    db.commit()
