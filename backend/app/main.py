from uuid import uuid4
from datetime import date
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
from .database import Base, engine, session
from .entities import UserEntity, ListingEntity, DemandEntity, OrderEntity, NotificationEntity, AuditEntity, ComplianceCheckEntity, LogisticsRequestEntity, LogisticsQuoteEntity, TrackingEventEntity, RatingEntity
from .seed_db import seed
from .security import hash_password, verify_password, token, current, role_guard
from .models import DemandRequest, MatchResponse, ComplianceResult, Forecast, LogisticsQuote
from .services import run_matching, compliance_check, forecast, logistics_quotes

app = FastAPI(title='FarmDirect API', version='1.0.0', description='FarmDirect demo API — marketplace and orchestration platform, never an inventory owner.')
app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:3000'], allow_methods=['*'], allow_headers=['*'])
@app.on_event('startup')
def startup():
    Base.metadata.create_all(engine)
    db = next(session()); seed(db); db.close()
def db_session(): yield from session()
def audit(db, actor, action, entity): db.add(AuditEntity(id=str(uuid4()), actor_id=actor, action=action, entity_id=entity))
class Credentials(BaseModel): email: EmailStr; password: str = Field(min_length=8)
class Registration(Credentials): name: str; role: str; location: str; state: str = 'Maharashtra'
class NewOrder(BaseModel): produce_subtotal: float; logistics_cost: float = 0
class NewListing(BaseModel): crop:str; quantity_kg:float; quality_grade:str='A'; asking_price:float; ready_date:str='2026-09-08'; latitude:float=18.738; longitude:float=73.846
class RatingInput(BaseModel): order_id:str; farmer_id:str; score:int=Field(ge=1,le=5); comment:str=''

@app.get('/health')
def health(db: Session = Depends(db_session)): return {'status':'ok','mode':'persistent-demo-data','users':db.query(UserEntity).count()}
@app.post('/auth/register')
def register(input: Registration, db: Session = Depends(db_session)):
    if input.role not in {'FARMER','FPO','BUYER','ADMIN','LOGISTICS_PARTNER'}: raise HTTPException(422,'Unsupported role')
    if db.query(UserEntity).filter_by(email=input.email).first(): raise HTTPException(409,'Email already registered')
    user=UserEntity(id=str(uuid4()),name=input.name,email=input.email,password_hash=hash_password(input.password),role=input.role,location=input.location,state=input.state)
    db.add(user); audit(db,user.id,'REGISTERED',user.id); db.commit()
    return {'access_token':token(user.id,user.role),'token_type':'bearer','user':{'id':user.id,'role':user.role,'name':user.name}}
@app.post('/auth/login')
def login(input: Credentials, db: Session = Depends(db_session)):
    user=db.query(UserEntity).filter_by(email=input.email).first()
    if not user or not verify_password(input.password,user.password_hash): raise HTTPException(401,'Incorrect email or password')
    return {'access_token':token(user.id,user.role),'token_type':'bearer','user':{'id':user.id,'role':user.role,'name':user.name},'demo_password':'FarmDirect2026!'}
@app.get('/auth/me')
def me(payload=Depends(current),db: Session = Depends(db_session)):
    user=db.get(UserEntity,payload['sub'])
    if not user: raise HTTPException(401,'Session user not found')
    return {'id':user.id,'name':user.name,'email':user.email,'role':user.role,'location':user.location,'state':user.state}
@app.get('/produce')
def produce(crop: str|None=None,db: Session = Depends(db_session)):
    q=db.query(ListingEntity)
    if crop:q=q.filter(ListingEntity.crop.ilike(crop))
    return [{'id':x.id,'farmer_id':x.farmer_id,'farmer_name':x.farmer.name,'crop':x.crop,'quantity_kg':x.quantity_kg,'quality_grade':x.quality_grade,'asking_price':x.asking_price,'ready_date':x.ready_date,'latitude':x.latitude,'longitude':x.longitude,'reliability':x.farmer.reliability,'status':x.status} for x in q.all()]
@app.post('/produce')
def create_listing(input:NewListing,payload=Depends(role_guard('FARMER','FPO')),db:Session=Depends(db_session)):
    listing=ListingEntity(id=str(uuid4()),farmer_id=payload['sub'],**input.model_dump());db.add(listing);audit(db,payload['sub'],'LISTING_CREATED',listing.id);db.commit();return {'id':listing.id,'status':listing.status}
@app.get('/farmers/me/listings')
def my_listings(payload=Depends(role_guard('FARMER','FPO')),db:Session=Depends(db_session)):
    return [{'id':x.id,'crop':x.crop,'quantity_kg':x.quantity_kg,'asking_price':x.asking_price,'status':x.status,'ready_date':x.ready_date} for x in db.query(ListingEntity).filter_by(farmer_id=payload['sub']).all()]
@app.get('/farmers/me/demands')
def farmer_demands(payload=Depends(role_guard('FARMER','FPO')),db:Session=Depends(db_session)):
    return [{'id':x.id,'crop':x.crop,'quantity_kg':x.quantity_kg,'max_price':x.max_price,'delivery_date':x.delivery_date,'location':x.location} for x in db.query(DemandEntity).filter_by(status='OPEN').all()]
@app.post('/demands')
def create_demand(demand: DemandRequest,payload=Depends(role_guard('BUYER')),db: Session = Depends(db_session)):
    d=DemandEntity(id=str(uuid4()),buyer_id=payload['sub'],crop=demand.crop,quantity_kg=demand.quantity_kg,quality_requirement=demand.quality_requirement,max_price=demand.max_price,delivery_date=str(demand.delivery_date),location=demand.location,latitude=demand.latitude,longitude=demand.longitude,radius_km=demand.radius_km)
    db.add(d); audit(db,payload['sub'],'DEMAND_CREATED',d.id); db.commit(); return {'id':d.id,'status':d.status}
@app.post('/matching/run',response_model=MatchResponse)
def matching(demand: DemandRequest,db: Session = Depends(db_session)):
    result=run_matching(demand); audit(db,demand.buyer_id,'MATCH_GENERATED',demand.id or 'ad-hoc'); db.commit(); return result
@app.post('/compliance/check',response_model=list[ComplianceResult])
def compliance(state: str='Maharashtra',crop: str='Tomatoes',buyer_type: str='B2B',order_id:str='demo-order',db:Session=Depends(db_session)):
    results=compliance_check(state,crop,buyer_type)
    for result in results: db.add(ComplianceCheckEntity(id=str(uuid4()),order_id=order_id,outcome=result.status,reason=result.reason,required_documents=str(result.required_documents)))
    db.commit(); return results
@app.post('/orders')
def create_order(order: NewOrder,payload=Depends(role_guard('BUYER')),db: Session = Depends(db_session)):
    entry=OrderEntity(id=f'FD-{date.today().year}-{str(uuid4())[:8]}',buyer_id=payload['sub'],produce_subtotal=order.produce_subtotal,logistics_cost=order.logistics_cost,total=order.produce_subtotal+order.logistics_cost)
    db.add(entry); audit(db,payload['sub'],'ORDER_CONFIRMED',entry.id); db.commit(); return {'id':entry.id,'status':entry.status,'total':entry.total}
@app.patch('/orders/{order_id}/status')
def transition(order_id: str,status: str,payload=Depends(current),db: Session = Depends(db_session)):
    order=db.get(OrderEntity,order_id); allowed={'PENDING','CONFIRMED','LOGISTICS_REQUESTED','VEHICLE_ASSIGNED','PICKUP_IN_PROGRESS','PICKED_UP','IN_TRANSIT','NEAR_DESTINATION','DELIVERED','CANCELLED'}
    if not order: raise HTTPException(404,'Order not found')
    if status not in allowed: raise HTTPException(422,'Invalid lifecycle state')
    order.status=status; audit(db,payload['sub'],f'ORDER_{status}',order.id); db.commit(); return {'id':order.id,'status':order.status}
@app.get('/forecast/{crop}/{region}',response_model=Forecast)
def get_forecast(crop: str,region: str): return forecast(crop,region)
@app.post('/logistics/request',response_model=list[LogisticsQuote])
def logistics(weight_kg: float=120,order_id:str='demo-order',db:Session=Depends(db_session)):
    request=LogisticsRequestEntity(id=str(uuid4()),order_id=order_id);db.add(request);quotes=logistics_quotes(weight_kg)
    for quote in quotes: db.add(LogisticsQuoteEntity(id=str(uuid4()),request_id=request.id,provider=quote.partner,vehicle=quote.vehicle,cost=quote.cost,eta_minutes=quote.eta_minutes,selected=quote.selected))
    audit(db,'system','LOGISTICS_REQUESTED',order_id);db.commit();return quotes
@app.post('/logistics/{request_id}/select')
def select_quote(request_id:str,quote_id:str,db:Session=Depends(db_session)):
    quote=db.get(LogisticsQuoteEntity,quote_id);request=db.get(LogisticsRequestEntity,request_id)
    if not quote or not request:raise HTTPException(404,'Logistics request or quote not found')
    request.selected_vehicle=quote.vehicle;request.quote_cost=quote.cost;request.status='VEHICLE_ASSIGNED';quote.selected=True;audit(db,'system','LOGISTICS_BOOKED',request.order_id);db.commit();return {'request_id':request.id,'vehicle':quote.vehicle,'cost':quote.cost}
@app.post('/ratings')
def rate(input:RatingInput,payload=Depends(role_guard('BUYER')),db:Session=Depends(db_session)):
    rating=RatingEntity(id=str(uuid4()),buyer_id=payload['sub'],**input.model_dump());db.add(rating);farmer=db.get(UserEntity,input.farmer_id)
    if farmer: farmer.reliability=round((farmer.reliability*9+input.score*20)/10,1)
    audit(db,payload['sub'],'RATING_SUBMITTED',input.order_id);db.commit();return {'id':rating.id,'farmer_reliability':farmer.reliability if farmer else None}
@app.get('/notifications')
def notifications(payload=Depends(current),db: Session = Depends(db_session)): return [{'id':x.id,'body':x.body,'read':x.read,'created_at':x.created_at} for x in db.query(NotificationEntity).filter_by(user_id=payload['sub']).all()]
@app.patch('/notifications/{notification_id}/read')
def mark_read(notification_id: str,payload=Depends(current),db: Session = Depends(db_session)):
    n=db.get(NotificationEntity,notification_id)
    if not n or n.user_id!=payload['sub']: raise HTTPException(404,'Notification not found')
    n.read=True; db.commit(); return {'id':n.id,'read':True}
@app.get('/tracking/{order_id}')
def tracking(order_id: str,db:Session=Depends(db_session)):
    events=db.query(TrackingEventEntity).filter_by(order_id=order_id).order_by(TrackingEventEntity.created_at).all();return {'order_id':order_id,'label':'Simulated tracking','events':[x.status for x in events] or ['Order confirmed'],'progress':len(events)}
@app.post('/tracking/{order_id}/next')
def next_tracking(order_id:str,db:Session=Depends(db_session)):
    flow=['CONFIRMED','LOGISTICS_REQUESTED','VEHICLE_ASSIGNED','EN_ROUTE_TO_PICKUP','PICKUP_COMPLETED','IN_TRANSIT','NEAR_DESTINATION','DELIVERED'];count=db.query(TrackingEventEntity).filter_by(order_id=order_id).count();status=flow[min(count,len(flow)-1)];db.add(TrackingEventEntity(id=str(uuid4()),order_id=order_id,status=status));audit(db,'system','TRACKING_UPDATED',order_id);db.commit();return {'status':status,'complete':status=='DELIVERED'}
