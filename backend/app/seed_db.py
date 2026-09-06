from uuid import uuid4
from sqlalchemy.orm import Session
from .entities import UserEntity,ListingEntity,NotificationEntity
from .security import hash_password
DEMO_PASSWORD='FarmDirect2026!'
def seed(db:Session):
 if db.query(UserEntity).count(): return
 users=[('buyer-demo','Pune Institutional Buyer (Demo)','buyer@farmdirect.demo','BUYER','Pune'),('farmer-1','Khed Farmer Group (Demo)','farmer@farmdirect.demo','FARMER','Khed'),('fpo-1','Baramati FPO (Demo)','fpo@farmdirect.demo','FPO','Baramati'),('admin-demo','FarmDirect Admin (Demo)','admin@farmdirect.demo','ADMIN','Pune'),('logistics-demo','Demo Logistics Partner','logistics@farmdirect.demo','LOGISTICS_PARTNER','Pune')]
 for i,n,e,r,l in users: db.add(UserEntity(id=i,name=n,email=e,password_hash=hash_password(DEMO_PASSWORD),role=r,location=l,reliability=96 if r in ['FARMER','FPO'] else 90))
 listings=[('l1','farmer-1','Tomatoes',420,27,18.738,73.846),('l2','fpo-1','Tomatoes',330,26,18.151,74.578),('l3','farmer-1','Tomatoes',250,25,19.208,73.875),('l4','fpo-1','Onions',500,24,18.117,75.026)]
 for i,f,c,q,p,lat,lng in listings: db.add(ListingEntity(id=i,farmer_id=f,crop=c,quantity_kg=q,quality_grade='A',asking_price=p,ready_date='2026-09-08',latitude=lat,longitude=lng))
 db.add(NotificationEntity(id='n1',user_id='buyer-demo',body='Demo data: 3 farms can fulfil your tomato demand.'))
 db.commit()
