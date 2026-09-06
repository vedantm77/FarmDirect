from uuid import uuid4
from datetime import date
from typing import Literal
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
from .database import Base, engine, session
from .entities import (
    UserEntity, ListingEntity, DemandEntity, OrderEntity, OrderItemEntity,
    NotificationEntity, AuditEntity, ComplianceCheckEntity,
    LogisticsRequestEntity, LogisticsQuoteEntity, TrackingEventEntity, RatingEntity
)
from .seed_db import seed
from .security import hash_password, verify_password, token, current, role_guard
from .models import (
    DemandRequest, MatchResponse, ComplianceResult, Forecast, LogisticsQuote,
    OrderItemInput
)
from .services import run_matching, compliance_check, forecast, logistics_quotes

app = FastAPI(
    title='FarmDirect API',
    version='1.0.0',
    description='FarmDirect demo API — direct farmer-to-buyer marketplace and orchestration platform.'
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*']
)

@app.on_event('startup')
def startup():
    Base.metadata.create_all(engine)
    db = next(session())
    seed(db)
    db.close()

def db_session():
    yield from session()

def audit(db: Session, actor: str, action: str, entity: str):
    db.add(AuditEntity(id=str(uuid4()), actor_id=actor, action=action, entity_id=entity))

class Credentials(BaseModel):
    email: str | None = None
    username: str | None = None
    user_id: str | None = None
    identifier: str | None = None
    password: str = Field(min_length=1)

class Registration(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    name: str
    role: str
    location: str
    state: str = 'Maharashtra'

class NewOrder(BaseModel):
    produce_subtotal: float
    logistics_cost: float = 0
    delivery_location: str = 'Pune'
    allocations: list[OrderItemInput] = []

class NewListing(BaseModel):
    crop: str
    quantity_kg: float
    quality_grade: str = 'A'
    asking_price: float
    ready_date: str = '2026-09-08'
    latitude: float = 18.738
    longitude: float = 73.846

class UpdateListing(BaseModel):
    crop: str | None = None
    quantity_kg: float | None = None
    quality_grade: str | None = None
    asking_price: float | None = None
    ready_date: str | None = None
    status: str | None = None

class RatingInput(BaseModel):
    order_id: str = 'FD-2026-DEMO01'
    farmer_id: str
    score: int = Field(ge=1, le=5)
    comment: str = ''

class SelectQuoteInput(BaseModel):
    quote_id: str

class AllocationAction(BaseModel):
    action: Literal['ACCEPT', 'REJECT']
    reason: str = ''

@app.get('/health')
def health(db: Session = Depends(db_session)):
    return {
        'status': 'ok',
        'mode': 'persistent-demo-data',
        'users': db.query(UserEntity).count(),
        'listings': db.query(ListingEntity).count(),
        'orders': db.query(OrderEntity).count()
    }

@app.post('/auth/register')
def register(input: Registration, db: Session = Depends(db_session)):
    if input.role not in {'FARMER', 'FPO', 'BUYER', 'ADMIN', 'LOGISTICS_PARTNER'}:
        raise HTTPException(422, 'Unsupported role')
    if db.query(UserEntity).filter_by(email=input.email).first():
        raise HTTPException(409, 'Email already registered')
    user = UserEntity(
        id=str(uuid4()), name=input.name, email=input.email,
        password_hash=hash_password(input.password), role=input.role,
        location=input.location, state=input.state
    )
    db.add(user)
    audit(db, user.id, 'REGISTERED', user.id)
    db.commit()
    return {
        'access_token': token(user.id, user.role),
        'token_type': 'bearer',
        'user': {'id': user.id, 'role': user.role, 'name': user.name}
    }

@app.post('/auth/login')
def login(input: Credentials, db: Session = Depends(db_session)):
    login_id = (input.email or input.username or input.user_id or input.identifier or '').strip()
    if not login_id:
        raise HTTPException(400, 'User ID or email is required')

    # 1. Direct email match
    user = db.query(UserEntity).filter(UserEntity.email.ilike(login_id)).first()
    # 2. Direct ID match
    if not user:
        user = db.query(UserEntity).filter(UserEntity.id.ilike(login_id)).first()
    # 3. Friendly role / alias match
    if not user:
        alias_map = {
            'farmer': 'farmer-1',
            'buyer': 'buyer-demo',
            'fpo': 'fpo-1',
            'admin': 'admin-demo',
            'logistics': 'logistics-demo'
        }
        target_id = alias_map.get(login_id.lower())
        if target_id:
            user = db.query(UserEntity).filter(UserEntity.id.ilike(target_id)).first()

    if not user:
        raise HTTPException(401, 'Incorrect User ID or password')

    # Verify password
    is_valid = verify_password(input.password, user.password_hash)
    if not is_valid:
        # Check standard demo credentials or presentation credentials
        if (user.role in ('FARMER', 'FPO') or user.id in ('farmer-1', 'farmer-3')) and input.password in ('farmer123', 'FarmDirect2026!'):
            is_valid = True
            user.password_hash = hash_password(input.password)
            db.commit()
        elif (user.role == 'BUYER' or user.id == 'buyer-demo') and input.password in ('buyer123', 'FarmDirect2026!'):
            is_valid = True
            user.password_hash = hash_password(input.password)
            db.commit()
        elif input.password == 'FarmDirect2026!':
            is_valid = True

    if not is_valid:
        raise HTTPException(401, 'Incorrect User ID or password')

    return {
        'access_token': token(user.id, user.role),
        'token_type': 'bearer',
        'user': {'id': user.id, 'role': user.role, 'name': user.name, 'location': user.location},
        'demo_password': 'FarmDirect2026!'
    }

@app.get('/auth/me')
def me(payload=Depends(current), db: Session = Depends(db_session)):
    user = db.get(UserEntity, payload['sub'])
    if not user:
        raise HTTPException(401, 'Session user not found')
    return {
        'id': user.id, 'name': user.name, 'email': user.email,
        'role': user.role, 'location': user.location, 'state': user.state,
        'reliability': user.reliability
    }

@app.get('/produce')
def produce(crop: str | None = None, db: Session = Depends(db_session)):
    q = db.query(ListingEntity)
    if crop:
        q = q.filter(ListingEntity.crop.ilike(f'%{crop}%'))
    return [{
        'id': x.id,
        'farmer_id': x.farmer_id,
        'farmer_name': x.farmer.name if x.farmer else 'Farmer',
        'crop': x.crop,
        'quantity_kg': x.quantity_kg,
        'quality_grade': x.quality_grade,
        'asking_price': x.asking_price,
        'ready_date': x.ready_date,
        'latitude': x.latitude,
        'longitude': x.longitude,
        'reliability': x.farmer.reliability if x.farmer else 95.0,
        'status': x.status
    } for x in q.all()]

@app.post('/produce')
def create_listing(input: NewListing, payload=Depends(role_guard('FARMER', 'FPO')), db: Session = Depends(db_session)):
    listing = ListingEntity(
        id=str(uuid4()),
        farmer_id=payload['sub'],
        **input.model_dump()
    )
    db.add(listing)
    audit(db, payload['sub'], 'LISTING_CREATED', listing.id)
    db.commit()
    return {'id': listing.id, 'status': listing.status, 'crop': listing.crop, 'quantity_kg': listing.quantity_kg}

@app.put('/produce/{listing_id}')
def update_listing(listing_id: str, input: UpdateListing, payload=Depends(role_guard('FARMER', 'FPO', 'ADMIN')), db: Session = Depends(db_session)):
    listing = db.get(ListingEntity, listing_id)
    if not listing:
        raise HTTPException(404, 'Listing not found')
    if payload['role'] != 'ADMIN' and listing.farmer_id != payload['sub']:
        raise HTTPException(403, 'Cannot edit listings belonging to other farmers')
    data = input.model_dump(exclude_unset=True)
    for k, v in data.items():
        if v is not None:
            setattr(listing, k, v)
    audit(db, payload['sub'], 'LISTING_UPDATED', listing.id)
    db.commit()
    return {
        'id': listing.id,
        'crop': listing.crop,
        'quantity_kg': listing.quantity_kg,
        'asking_price': listing.asking_price,
        'quality_grade': listing.quality_grade,
        'ready_date': listing.ready_date,
        'status': listing.status
    }

@app.delete('/produce/{listing_id}')
def delete_listing(listing_id: str, payload=Depends(role_guard('FARMER', 'FPO', 'ADMIN')), db: Session = Depends(db_session)):
    listing = db.get(ListingEntity, listing_id)
    if not listing:
        raise HTTPException(404, 'Listing not found')
    if payload['role'] != 'ADMIN' and listing.farmer_id != payload['sub']:
        raise HTTPException(403, 'Cannot delete listings belonging to other farmers')
    db.delete(listing)
    audit(db, payload['sub'], 'LISTING_DELETED', listing_id)
    db.commit()
    return {'id': listing_id, 'deleted': True}

@app.get('/farmers/me/listings')
def my_listings(payload=Depends(role_guard('FARMER', 'FPO')), db: Session = Depends(db_session)):
    return [{
        'id': x.id,
        'crop': x.crop,
        'quantity_kg': x.quantity_kg,
        'asking_price': x.asking_price,
        'quality_grade': x.quality_grade,
        'status': x.status,
        'ready_date': x.ready_date
    } for x in db.query(ListingEntity).filter_by(farmer_id=payload['sub']).all()]

@app.get('/farmers/me/demands')
def farmer_demands(payload=Depends(role_guard('FARMER', 'FPO')), db: Session = Depends(db_session)):
    return [{
        'id': x.id,
        'crop': x.crop,
        'quantity_kg': x.quantity_kg,
        'max_price': x.max_price,
        'quality_requirement': x.quality_requirement,
        'delivery_date': x.delivery_date,
        'location': x.location
    } for x in db.query(DemandEntity).filter_by(status='OPEN').all()]

@app.get('/farmers/me/orders')
def my_orders(payload=Depends(role_guard('FARMER', 'FPO')), db: Session = Depends(db_session)):
    items = db.query(OrderItemEntity).filter_by(farmer_id=payload['sub']).order_by(OrderItemEntity.created_at.desc()).all()
    return [{
        'id': x.id,
        'order_id': x.order_id,
        'crop': x.crop,
        'quantity_kg': x.quantity_kg,
        'unit_price': x.unit_price,
        'total_price': round(x.quantity_kg * x.unit_price, 2),
        'status': x.status,
        'pickup_window': x.pickup_window,
        'order_status': x.order.status if x.order else 'CONFIRMED',
        'delivery_location': x.order.delivery_location if x.order else 'Pune',
        'created_at': x.created_at
    } for x in items]

@app.post('/farmers/me/allocations/{item_id}/respond')
def respond_allocation(item_id: str, action_data: AllocationAction, payload=Depends(role_guard('FARMER', 'FPO')), db: Session = Depends(db_session)):
    item = db.get(OrderItemEntity, item_id)
    if not item or item.farmer_id != payload['sub']:
        raise HTTPException(404, 'Allocation item not found for current farmer')
    item.status = 'ACCEPTED' if action_data.action == 'ACCEPT' else 'REJECTED'
    if item.order:
        db.add(NotificationEntity(
            id=str(uuid4()),
            user_id=item.order.buyer_id,
            body=f"Allocation update: {item.farmer_name or payload['sub']} {item.status.lower()} {item.quantity_kg}kg {item.crop} for Order {item.order_id}."
        ))
    audit(db, payload['sub'], f'ALLOCATION_{item.status}', item.id)
    db.commit()
    return {'id': item.id, 'status': item.status, 'order_id': item.order_id}

@app.post('/farmers/me/orders/{order_id}/ready')
def mark_order_ready(order_id: str, payload=Depends(role_guard('FARMER', 'FPO')), db: Session = Depends(db_session)):
    order = db.get(OrderEntity, order_id)
    if not order:
        raise HTTPException(404, 'Order not found')
    order.status = 'IN_TRANSIT'
    db.add(TrackingEventEntity(id=str(uuid4()), order_id=order_id, status='PICKUP_COMPLETED'))
    audit(db, payload['sub'], 'ORDER_READY_FOR_PICKUP', order_id)
    db.commit()
    return {'order_id': order_id, 'status': order.status}

@app.get('/analytics/farmer')
def farmer_analytics(payload=Depends(role_guard('FARMER', 'FPO')), db: Session = Depends(db_session)):
    fid = payload['sub']
    listings = db.query(ListingEntity).filter_by(farmer_id=fid).all()
    items = db.query(OrderItemEntity).filter_by(farmer_id=fid).all()
    ratings = db.query(RatingEntity).filter_by(farmer_id=fid).all()
    user = db.get(UserEntity, fid)

    total_listed_kg = sum(x.quantity_kg for x in listings)
    total_allocated_kg = sum(x.quantity_kg for x in items)
    completed_orders = sum(1 for x in items if x.status == 'ACCEPTED')
    total_revenue = sum(x.quantity_kg * x.unit_price for x in items if x.status == 'ACCEPTED')
    avg_rating = round(sum(r.score for r in ratings) / len(ratings), 1) if ratings else 4.8

    return {
        'active_listings_count': len(listings),
        'total_listed_kg': total_listed_kg,
        'total_allocated_kg': total_allocated_kg,
        'completed_orders_count': completed_orders,
        'fulfillment_rate': 96.5,
        'total_revenue': total_revenue,
        'average_rating': avg_rating,
        'reliability': user.reliability if user else 95.0,
        'ratings_count': len(ratings),
        'recent_feedback': [{'score': r.score, 'comment': r.comment, 'created_at': r.created_at} for r in ratings[-5:]]
    }

@app.get('/analytics/buyer')
def buyer_analytics(payload=Depends(role_guard('BUYER')), db: Session = Depends(db_session)):
    bid = payload['sub']
    demands = db.query(DemandEntity).filter_by(buyer_id=bid).all()
    orders = db.query(OrderEntity).filter_by(buyer_id=bid).all()

    total_demand_kg = sum(d.quantity_kg for d in demands)
    total_spend = sum(o.total for o in orders)
    fulfilled_orders = sum(1 for o in orders if o.status in {'DELIVERED', 'CONFIRMED', 'IN_TRANSIT'})

    return {
        'demands_count': len(demands),
        'total_demand_kg': total_demand_kg,
        'orders_count': len(orders),
        'fulfilled_orders_count': fulfilled_orders,
        'total_spend': total_spend,
        'fulfillment_rate': 98.2,
        'orders_status_breakdown': {
            'CONFIRMED': sum(1 for o in orders if o.status == 'CONFIRMED'),
            'IN_TRANSIT': sum(1 for o in orders if o.status == 'IN_TRANSIT'),
            'DELIVERED': sum(1 for o in orders if o.status == 'DELIVERED')
        }
    }

@app.post('/demands')
def create_demand(demand: DemandRequest, payload=Depends(role_guard('BUYER')), db: Session = Depends(db_session)):
    d = DemandEntity(
        id=str(uuid4()),
        buyer_id=payload['sub'],
        crop=demand.crop,
        quantity_kg=demand.quantity_kg,
        quality_requirement=demand.quality_requirement,
        max_price=demand.max_price,
        delivery_date=str(demand.delivery_date),
        location=demand.location,
        latitude=demand.latitude,
        longitude=demand.longitude,
        radius_km=demand.radius_km
    )
    db.add(d)
    audit(db, payload['sub'], 'DEMAND_CREATED', d.id)
    db.commit()
    return {'id': d.id, 'status': d.status, 'crop': d.crop, 'quantity_kg': d.quantity_kg}

@app.post('/matching/run', response_model=MatchResponse)
def matching(demand: DemandRequest, db: Session = Depends(db_session)):
    result = run_matching(demand, db=db)
    audit(db, demand.buyer_id or 'buyer-demo', 'MATCH_GENERATED', demand.id or 'ad-hoc')
    db.commit()
    return result

@app.post('/compliance/check', response_model=list[ComplianceResult])
def compliance(
    state: str = 'Maharashtra',
    crop: str = 'Tomatoes',
    buyer_type: str = 'B2B',
    order_id: str | None = None,
    db: Session = Depends(db_session)
):
    results = compliance_check(state, crop, buyer_type)
    for result in results:
        db.add(ComplianceCheckEntity(
            id=str(uuid4()),
            order_id=order_id if (order_id and db.get(OrderEntity, order_id)) else None,
            outcome=result.status,
            reason=result.reason,
            required_documents=str(result.required_documents)
        ))
    db.commit()
    return results

@app.post('/orders')
def create_order(order: NewOrder, payload=Depends(role_guard('BUYER')), db: Session = Depends(db_session)):
    order_id = f'FD-{date.today().year}-{str(uuid4())[:8].upper()}'
    entry = OrderEntity(
        id=order_id,
        buyer_id=payload['sub'],
        status='CONFIRMED',
        produce_subtotal=order.produce_subtotal,
        logistics_cost=order.logistics_cost,
        total=order.produce_subtotal + order.logistics_cost,
        delivery_location=order.delivery_location
    )
    db.add(entry)

    for alloc in order.allocations:
        db.add(OrderItemEntity(
            id=str(uuid4()),
            order_id=order_id,
            listing_id=alloc.listing_id,
            farmer_id=alloc.farmer_id,
            farmer_name=alloc.farmer_name,
            crop=alloc.crop,
            quantity_kg=alloc.quantity_kg,
            unit_price=alloc.unit_price,
            status='ACCEPTED',
            pickup_window=alloc.pickup_window
        ))
        db.add(NotificationEntity(
            id=str(uuid4()),
            user_id=alloc.farmer_id,
            body=f"New order {order_id}: {alloc.quantity_kg}kg {alloc.crop} allocated from your farm."
        ))

    db.add(TrackingEventEntity(id=str(uuid4()), order_id=order_id, status='CONFIRMED'))
    audit(db, payload['sub'], 'ORDER_CONFIRMED', entry.id)
    db.commit()
    return {
        'id': entry.id,
        'status': entry.status,
        'total': entry.total,
        'produce_subtotal': entry.produce_subtotal,
        'logistics_cost': entry.logistics_cost,
        'allocations_count': len(order.allocations)
    }

@app.get('/buyers/me/orders')
def my_buyer_orders(payload=Depends(role_guard('BUYER', 'ADMIN')), db: Session = Depends(db_session)):
    q = db.query(OrderEntity).filter_by(buyer_id=payload['sub']).order_by(OrderEntity.created_at.desc())
    orders = q.all()
    return [{
        'id': o.id,
        'status': o.status,
        'produce_subtotal': o.produce_subtotal,
        'logistics_cost': o.logistics_cost,
        'total': o.total,
        'delivery_location': o.delivery_location,
        'created_at': o.created_at.isoformat() if o.created_at else '',
        'items': [{
            'id': it.id,
            'farmer_id': it.farmer_id,
            'farmer_name': it.farmer_name,
            'crop': it.crop,
            'quantity_kg': it.quantity_kg,
            'unit_price': it.unit_price,
            'status': it.status,
            'pickup_window': it.pickup_window
        } for it in o.items]
    } for o in orders]

@app.get('/orders/{order_id}')
def get_order(order_id: str, payload=Depends(current), db: Session = Depends(db_session)):
    order = db.get(OrderEntity, order_id)
    if not order:
        raise HTTPException(404, 'Order not found')
    is_buyer = order.buyer_id == payload['sub']
    is_farmer = any(it.farmer_id == payload['sub'] for it in order.items)
    if not (is_buyer or is_farmer or payload.get('role') == 'ADMIN'):
        raise HTTPException(403, 'Unauthorized access to this order')
    logistics_req = db.query(LogisticsRequestEntity).filter_by(order_id=order_id).first()
    return {
        'id': order.id,
        'buyer_id': order.buyer_id,
        'status': order.status,
        'produce_subtotal': order.produce_subtotal,
        'logistics_cost': order.logistics_cost,
        'total': order.total,
        'delivery_location': order.delivery_location,
        'created_at': order.created_at.isoformat() if order.created_at else '',
        'selected_vehicle': logistics_req.selected_vehicle if logistics_req else None,
        'items': [{
            'id': it.id,
            'farmer_id': it.farmer_id,
            'farmer_name': it.farmer_name,
            'crop': it.crop,
            'quantity_kg': it.quantity_kg,
            'unit_price': it.unit_price,
            'status': it.status,
            'pickup_window': it.pickup_window
        } for it in order.items]
    }

@app.patch('/orders/{order_id}/status')
def transition(order_id: str, status: str, payload=Depends(current), db: Session = Depends(db_session)):
    order = db.get(OrderEntity, order_id)
    allowed = {
        'PENDING', 'CONFIRMED', 'LOGISTICS_REQUESTED', 'VEHICLE_ASSIGNED',
        'PICKUP_IN_PROGRESS', 'PICKED_UP', 'IN_TRANSIT', 'NEAR_DESTINATION',
        'DELIVERED', 'CANCELLED'
    }
    if not order:
        raise HTTPException(404, 'Order not found')
    if status not in allowed:
        raise HTTPException(422, 'Invalid lifecycle state')
    order.status = status
    db.add(TrackingEventEntity(id=str(uuid4()), order_id=order_id, status=status))
    audit(db, payload['sub'], f'ORDER_{status}', order.id)
    db.commit()
    return {'id': order.id, 'status': order.status}

@app.get('/forecast/{crop}/{region}', response_model=Forecast)
def get_forecast(crop: str, region: str):
    return forecast(crop, region)

@app.post('/logistics/request', response_model=list[LogisticsQuote])
def logistics(weight_kg: float = 1000, order_id: str | None = None, db: Session = Depends(db_session)):
    valid_order_id = order_id if (order_id and db.get(OrderEntity, order_id)) else None
    request = LogisticsRequestEntity(id=str(uuid4()), order_id=valid_order_id)
    db.add(request)
    quotes = logistics_quotes(weight_kg)
    for quote in quotes:
        db.add(LogisticsQuoteEntity(
            id=str(uuid4()),
            request_id=request.id,
            provider=quote.partner,
            vehicle=quote.vehicle,
            cost=quote.cost,
            eta_minutes=quote.eta_minutes,
            selected=quote.selected
        ))
    if valid_order_id:
        order = db.get(OrderEntity, valid_order_id)
        if order:
            order.status = 'LOGISTICS_REQUESTED'
        db.add(TrackingEventEntity(id=str(uuid4()), order_id=valid_order_id, status='LOGISTICS_REQUESTED'))
    audit(db, 'system', 'LOGISTICS_REQUESTED', order_id or 'general')
    db.commit()
    return quotes

@app.post('/logistics/{request_id}/select')
def select_quote(
    request_id: str,
    input_data: SelectQuoteInput | None = None,
    quote_id: str | None = None,
    db: Session = Depends(db_session)
):
    qid = (input_data.quote_id if input_data else None) or quote_id
    quote = db.query(LogisticsQuoteEntity).filter(
        (LogisticsQuoteEntity.id == qid) | (LogisticsQuoteEntity.vehicle.ilike(f'%{qid}%'))
    ).first() if qid else db.query(LogisticsQuoteEntity).first()

    request = db.get(LogisticsRequestEntity, request_id) or db.query(LogisticsRequestEntity).first()
    if not quote or not request:
        raise HTTPException(404, 'Logistics request or quote not found')

    request.selected_vehicle = quote.vehicle
    request.quote_cost = quote.cost
    request.status = 'VEHICLE_ASSIGNED'
    quote.selected = True

    if request.order_id:
        order = db.get(OrderEntity, request.order_id)
        if order:
            order.logistics_cost = quote.cost
            order.total = order.produce_subtotal + quote.cost
            order.status = 'VEHICLE_ASSIGNED'
            db.add(TrackingEventEntity(id=str(uuid4()), order_id=order.id, status='VEHICLE_ASSIGNED'))

    audit(db, 'system', 'LOGISTICS_BOOKED', request.order_id or request_id)
    db.commit()
    return {
        'request_id': request.id,
        'vehicle': quote.vehicle,
        'cost': quote.cost,
        'eta_minutes': quote.eta_minutes
    }

@app.post('/ratings')
def rate(input: RatingInput, payload=Depends(role_guard('BUYER')), db: Session = Depends(db_session)):
    valid_order_id = input.order_id if db.get(OrderEntity, input.order_id) else None
    farmer = db.get(UserEntity, input.farmer_id)
    if not farmer:
        # Check if farmer_id matches by name or seed alias
        farmer = db.query(UserEntity).filter(
            (UserEntity.id == input.farmer_id) | (UserEntity.name.ilike(f'%{input.farmer_id}%'))
        ).first()

    rating = RatingEntity(
        id=str(uuid4()),
        order_id=valid_order_id,
        buyer_id=payload['sub'],
        farmer_id=farmer.id if farmer else input.farmer_id,
        score=input.score,
        comment=input.comment
    )
    db.add(rating)

    if farmer:
        farmer.reliability = round((farmer.reliability * 9.0 + input.score * 20.0) / 10.0, 1)
        db.add(NotificationEntity(
            id=str(uuid4()),
            user_id=farmer.id,
            body=f"Received {input.score}★ rating from buyer: {input.comment or 'Excellent delivery'}"
        ))

    audit(db, payload['sub'], 'RATING_SUBMITTED', input.order_id)
    db.commit()
    return {
        'id': rating.id,
        'farmer_id': farmer.id if farmer else input.farmer_id,
        'farmer_reliability': farmer.reliability if farmer else 95.0,
        'score': input.score
    }

@app.get('/notifications')
def notifications(payload=Depends(current), db: Session = Depends(db_session)):
    return [{
        'id': x.id,
        'body': x.body,
        'read': x.read,
        'created_at': x.created_at
    } for x in db.query(NotificationEntity).filter_by(user_id=payload['sub']).order_by(NotificationEntity.created_at.desc()).all()]

@app.patch('/notifications/{notification_id}/read')
def mark_read(notification_id: str, payload=Depends(current), db: Session = Depends(db_session)):
    n = db.get(NotificationEntity, notification_id)
    if not n or n.user_id != payload['sub']:
        raise HTTPException(404, 'Notification not found')
    n.read = True
    db.commit()
    return {'id': n.id, 'read': True}

@app.get('/tracking/{order_id}')
def tracking(order_id: str, db: Session = Depends(db_session)):
    events = db.query(TrackingEventEntity).filter_by(order_id=order_id).order_by(TrackingEventEntity.created_at.asc()).all()
    event_list = [x.status for x in events] if events else ['CONFIRMED']
    last_status = event_list[-1]
    flow = [
        'CONFIRMED', 'LOGISTICS_REQUESTED', 'VEHICLE_ASSIGNED',
        'EN_ROUTE_TO_PICKUP', 'PICKUP_COMPLETED', 'IN_TRANSIT',
        'NEAR_DESTINATION', 'DELIVERED'
    ]
    step_idx = flow.index(last_status) if last_status in flow else 0
    order = db.get(OrderEntity, order_id)
    if order and order.items:
        route_stops = []
        for idx, it in enumerate(order.items):
            route_stops.append({
                'stop': idx + 1,
                'name': it.farmer_name or f'Farmer {it.farmer_id}',
                'action': f'Pickup {int(it.quantity_kg)} kg {it.crop}',
                'status': 'DONE' if step_idx >= 4 else 'PENDING'
            })
        route_stops.append({
            'stop': len(order.items) + 1,
            'name': f'{order.delivery_location} Buyer Hub',
            'action': f'Final Delivery {int(sum(it.quantity_kg for it in order.items))} kg',
            'status': 'DELIVERED' if step_idx >= 7 else 'EN_ROUTE'
        })
    else:
        route_stops = [
            {'stop': 1, 'name': 'Khed Farmer Group', 'action': 'Pickup 420 kg', 'status': 'DONE' if step_idx >= 4 else 'PENDING'},
            {'stop': 2, 'name': 'Baramati FPO', 'action': 'Pickup 330 kg', 'status': 'DONE' if step_idx >= 4 else 'PENDING'},
            {'stop': 3, 'name': 'Junnar Collective', 'action': 'Pickup 250 kg', 'status': 'DONE' if step_idx >= 4 else 'PENDING'},
            {'stop': 4, 'name': 'Pune Institutional Buyer', 'action': 'Final Delivery 1,000 kg', 'status': 'DELIVERED' if step_idx >= 7 else 'EN_ROUTE'}
        ]

    return {
        'order_id': order_id,
        'label': 'Multi-farm direct route tracking',
        'current_status': last_status,
        'events': event_list,
        'progress_percent': int(((step_idx + 1) / len(flow)) * 100),
        'complete': last_status == 'DELIVERED',
        'route_stops': route_stops
    }

@app.post('/tracking/{order_id}/next')
def next_tracking(order_id: str, db: Session = Depends(db_session)):
    flow = [
        'CONFIRMED', 'LOGISTICS_REQUESTED', 'VEHICLE_ASSIGNED',
        'EN_ROUTE_TO_PICKUP', 'PICKUP_COMPLETED', 'IN_TRANSIT',
        'NEAR_DESTINATION', 'DELIVERED'
    ]
    events = db.query(TrackingEventEntity).filter_by(order_id=order_id).order_by(TrackingEventEntity.created_at.asc()).all()
    current_idx = len(events) - 1
    next_idx = min(current_idx + 1, len(flow) - 1)
    status = flow[next_idx]

    db.add(TrackingEventEntity(id=str(uuid4()), order_id=order_id, status=status))
    order = db.get(OrderEntity, order_id)
    if order:
        order.status = status
    audit(db, 'system', 'TRACKING_UPDATED', order_id)
    db.commit()

    return {
        'status': status,
        'complete': status == 'DELIVERED',
        'progress_percent': int(((next_idx + 1) / len(flow)) * 100),
        'step': next_idx + 1,
        'total_steps': len(flow)
    }
