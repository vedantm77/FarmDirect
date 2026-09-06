from datetime import datetime
from sqlalchemy import String, Float, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base

class UserEntity(Base):
  __tablename__='users'; id:Mapped[str]=mapped_column(String,primary_key=True); name:Mapped[str]=mapped_column(String); email:Mapped[str]=mapped_column(String,unique=True,index=True); password_hash:Mapped[str]=mapped_column(String); role:Mapped[str]=mapped_column(String,index=True); location:Mapped[str]=mapped_column(String); state:Mapped[str]=mapped_column(String,default='Maharashtra'); reliability:Mapped[float]=mapped_column(Float,default=90); created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)
class ListingEntity(Base):
  __tablename__='produce_listings'; id:Mapped[str]=mapped_column(String,primary_key=True); farmer_id:Mapped[str]=mapped_column(ForeignKey('users.id')); crop:Mapped[str]=mapped_column(String,index=True); quantity_kg:Mapped[float]=mapped_column(Float); quality_grade:Mapped[str]=mapped_column(String); asking_price:Mapped[float]=mapped_column(Float); ready_date:Mapped[str]=mapped_column(String); latitude:Mapped[float]=mapped_column(Float); longitude:Mapped[float]=mapped_column(Float); status:Mapped[str]=mapped_column(String,default='ACTIVE'); farmer:Mapped[UserEntity]=relationship()
class DemandEntity(Base):
  __tablename__='demand_requests'; id:Mapped[str]=mapped_column(String,primary_key=True); buyer_id:Mapped[str]=mapped_column(ForeignKey('users.id')); crop:Mapped[str]=mapped_column(String); quantity_kg:Mapped[float]=mapped_column(Float); quality_requirement:Mapped[str]=mapped_column(String); max_price:Mapped[float]=mapped_column(Float); delivery_date:Mapped[str]=mapped_column(String); location:Mapped[str]=mapped_column(String); latitude:Mapped[float]=mapped_column(Float); longitude:Mapped[float]=mapped_column(Float); radius_km:Mapped[float]=mapped_column(Float,default=100); status:Mapped[str]=mapped_column(String,default='OPEN')
class OrderEntity(Base):
  __tablename__='orders'; id:Mapped[str]=mapped_column(String,primary_key=True); buyer_id:Mapped[str]=mapped_column(ForeignKey('users.id')); status:Mapped[str]=mapped_column(String,default='PENDING'); produce_subtotal:Mapped[float]=mapped_column(Float); logistics_cost:Mapped[float]=mapped_column(Float,default=0); total:Mapped[float]=mapped_column(Float); created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)
class NotificationEntity(Base):
  __tablename__='notifications'; id:Mapped[str]=mapped_column(String,primary_key=True); user_id:Mapped[str]=mapped_column(ForeignKey('users.id')); body:Mapped[str]=mapped_column(Text); read:Mapped[bool]=mapped_column(Boolean,default=False); created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)
class AuditEntity(Base):
  __tablename__='audit_logs'; id:Mapped[str]=mapped_column(String,primary_key=True); actor_id:Mapped[str]=mapped_column(String); action:Mapped[str]=mapped_column(String); entity_id:Mapped[str]=mapped_column(String); created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)
class ComplianceCheckEntity(Base):
  __tablename__='compliance_checks'; id:Mapped[str]=mapped_column(String,primary_key=True); order_id:Mapped[str]=mapped_column(ForeignKey('orders.id'),index=True); outcome:Mapped[str]=mapped_column(String); reason:Mapped[str]=mapped_column(Text); required_documents:Mapped[str]=mapped_column(Text,default='[]'); created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)
class LogisticsRequestEntity(Base):
  __tablename__='logistics_requests'; id:Mapped[str]=mapped_column(String,primary_key=True); order_id:Mapped[str]=mapped_column(ForeignKey('orders.id'),index=True); selected_vehicle:Mapped[str|None]=mapped_column(String,nullable=True); quote_cost:Mapped[float|None]=mapped_column(Float,nullable=True); status:Mapped[str]=mapped_column(String,default='REQUESTED'); created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)
class LogisticsQuoteEntity(Base):
  __tablename__='logistics_quotes'; id:Mapped[str]=mapped_column(String,primary_key=True); request_id:Mapped[str]=mapped_column(ForeignKey('logistics_requests.id'),index=True); provider:Mapped[str]=mapped_column(String); vehicle:Mapped[str]=mapped_column(String); cost:Mapped[float]=mapped_column(Float); eta_minutes:Mapped[int]=mapped_column(); selected:Mapped[bool]=mapped_column(Boolean,default=False)
class TrackingEventEntity(Base):
  __tablename__='tracking_events'; id:Mapped[str]=mapped_column(String,primary_key=True); order_id:Mapped[str]=mapped_column(ForeignKey('orders.id'),index=True); status:Mapped[str]=mapped_column(String); created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)
class RatingEntity(Base):
  __tablename__='ratings'; id:Mapped[str]=mapped_column(String,primary_key=True); order_id:Mapped[str]=mapped_column(ForeignKey('orders.id'),index=True); buyer_id:Mapped[str]=mapped_column(ForeignKey('users.id')); farmer_id:Mapped[str]=mapped_column(ForeignKey('users.id')); score:Mapped[int]=mapped_column(); comment:Mapped[str]=mapped_column(Text,default=''); created_at:Mapped[datetime]=mapped_column(DateTime,default=datetime.utcnow)
