from enum import StrEnum
from pydantic import BaseModel, Field, EmailStr
from datetime import date, datetime
from typing import Literal

class Role(StrEnum): FARMER='FARMER'; FPO='FPO'; BUYER='BUYER'; ADMIN='ADMIN'; LOGISTICS_PARTNER='LOGISTICS_PARTNER'
class User(BaseModel): id:str; name:str; email:EmailStr; role:Role; location:str; state:str='Maharashtra'
class ProduceListing(BaseModel):
    id:str; farmer_id:str; farmer_name:str; crop:str; quantity_kg:float; quality_grade:str; asking_price:float; ready_date:date; latitude:float; longitude:float; reliability:float=96; status:str='ACTIVE'
class DemandRequest(BaseModel):
    id:str=''; buyer_id:str='buyer-demo'; crop:str; quantity_kg:float=Field(gt=0); quality_requirement:str='A'; max_price:float=Field(gt=0); delivery_date:date; location:str; latitude:float; longitude:float; radius_km:float=100
class MatchScore(BaseModel): overall:float; distance:float; price:float; quantity:float; quality:float; readiness:float; reliability:float
class Match(BaseModel): listing:ProduceListing; distance_km:float; score:MatchScore; logistics_feasible:bool=True; explanation:str=''
class Allocation(BaseModel): listing_id:str; farmer_id:str=''; farmer_name:str; quantity_kg:float; price_per_kg:float; distance_km:float
class MatchResponse(BaseModel): matches:list[Match]; allocations:list[Allocation]; fulfilled:bool; message:str
class ComplianceResult(BaseModel): rule:str; status:Literal['PASSED','REVIEW','BLOCKED']; reason:str; required_documents:list[str]=[]; source_reference:str; checked_at:datetime
class LogisticsQuote(BaseModel): partner:str; vehicle:str; cost:float; eta_minutes:int; capacity_kg:float; selected:bool=False
class Forecast(BaseModel): crop:str; region:str; predicted_demand_tonnes:float; available_supply_tonnes:float; supply_gap_tonnes:float; trend_percent:float; confidence:float; recommended_action:str; label:str='Prototype forecast / demo dataset'
class OrderItemInput(BaseModel):
    listing_id: str | None = None
    farmer_id: str
    farmer_name: str = ''
    crop: str = 'Tomatoes'
    quantity_kg: float
    unit_price: float
    pickup_window: str = '8:00 AM - 11:00 AM'

