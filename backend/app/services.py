from math import asin, cos, radians, sin, sqrt
from datetime import datetime, timezone, date
from .models import *
from .seed import LISTINGS

WEIGHTS={'distance':.30,'price':.20,'quantity':.15,'quality':.15,'readiness':.10,'reliability':.10}
def haversine_km(a,b,c,d):
    x=radians(c-a); y=radians(d-b); h=sin(x/2)**2+cos(radians(a))*cos(radians(c))*sin(y/2)**2
    return 6371*2*asin(sqrt(h))
def score(listing,demand):
    dist=haversine_km(demand.latitude,demand.longitude,listing.latitude,listing.longitude)
    values={'distance':max(0,100*(1-dist/demand.radius_km)), 'price':max(0,100*(1-(listing.asking_price-demand.max_price)/demand.max_price)), 'quantity':min(100,100*listing.quantity_kg/demand.quantity_kg), 'quality':100 if listing.quality_grade>=demand.quality_requirement else 35, 'readiness':100 if str(listing.ready_date)<=str(demand.delivery_date) else 20, 'reliability':listing.reliability}
    total=round(sum(values[k]*WEIGHTS[k] for k in WEIGHTS),1)
    return dist, MatchScore(overall=total,**{k:round(v,1) for k,v in values.items()})
def run_matching(demand, db=None):
    candidates = []
    demand_crop_norm = demand.crop.strip().lower().rstrip('s')
    if db is not None:
        try:
            from .entities import ListingEntity
            db_listings = db.query(ListingEntity).filter(ListingEntity.status == 'ACTIVE').all()
            for x in db_listings:
                if x.crop.strip().lower().rstrip('s') == demand_crop_norm or demand_crop_norm in x.crop.lower():
                    ready = date.fromisoformat(x.ready_date) if isinstance(x.ready_date, str) else x.ready_date
                    farmer_name = x.farmer.name if x.farmer else 'Verified Farmer'
                    reliability = x.farmer.reliability if x.farmer else 95.0
                    candidates.append(ProduceListing(id=x.id, farmer_id=x.farmer_id, farmer_name=farmer_name, crop=x.crop, quantity_kg=x.quantity_kg, quality_grade=x.quality_grade, asking_price=x.asking_price, ready_date=ready, latitude=x.latitude, longitude=x.longitude, reliability=reliability, status=x.status))
        except Exception:
            candidates = []
    if not candidates:
        candidates = list(LISTINGS)

    options=[]
    for listing in candidates:
      list_crop_norm = listing.crop.strip().lower().rstrip('s')
      if (list_crop_norm != demand_crop_norm and demand_crop_norm not in list_crop_norm) or listing.asking_price>demand.max_price or str(listing.ready_date)>str(demand.delivery_date): continue
      distance, breakdown=score(listing,demand)
      if distance<=demand.radius_km:
          expl = f"Score {breakdown.overall}%: {distance:.1f}km away ({breakdown.distance}%), ₹{listing.asking_price}/kg ({breakdown.price}%), Quality {listing.quality_grade}, {listing.reliability}% reliability."
          options.append(Match(listing=listing,distance_km=round(distance,1),score=breakdown,explanation=expl))
    options.sort(key=lambda x:x.score.overall,reverse=True)
    remaining=demand.quantity_kg; allocations=[]
    for match in options:
      if remaining<=0: break
      qty=min(remaining,match.listing.quantity_kg); remaining-=qty
      allocations.append(Allocation(listing_id=match.listing.id,farmer_id=match.listing.farmer_id,farmer_name=match.listing.farmer_name,quantity_kg=qty,price_per_kg=match.listing.asking_price,distance_km=match.distance_km))
    msg = 'Single-farm direct match found.' if len(allocations)==1 else f'Fulfilled by {len(allocations)} farms through direct transparent allocation.' if allocations else 'No compatible farm listings found within search criteria.'
    return MatchResponse(matches=options,allocations=allocations,fulfilled=remaining<=0,message=msg)
def compliance_check(state,crop,buyer_type):
    checks=[('Applicable Maharashtra direct-sale rule','PASSED','Configured rule allows this direct-sale pathway without mandating APMC intermediary cess.',[]),('Commodity eligibility','PASSED',f'{crop} is eligible under state direct-marketing notification.',[]),('Documents & Quality Verification','REVIEW','Verify FPO registration and quality test report before order dispatch.',['Farmer 7-12 / Land record or FPO Registration','Quality inspection / Grade certificate'])]
    now = datetime.now(timezone.utc)
    return [ComplianceResult(rule=a,status=b,reason=c,required_documents=d,source_reference='Demo Maharashtra Agricultural Produce Marketing (Regulation) Exemption Framework',checked_at=now) for a,b,c,d in checks]
def logistics_quotes(weight):
    return [LogisticsQuote(partner='Demo Logistics Partner',vehicle='Mini Truck',cost=1840,eta_minutes=135,capacity_kg=1500,selected=True),LogisticsQuote(partner='Pune Route Network',vehicle='Tempo',cost=2200,eta_minutes=110,capacity_kg=900)]
def forecast(crop,region):
    supply=4.3 if crop.lower()=='tomatoes' else 5.1; demand=5.0 if crop.lower()=='tomatoes' else 4.6
    return Forecast(crop=crop,region=region,predicted_demand_tonnes=demand,available_supply_tonnes=supply,supply_gap_tonnes=round(demand-supply,1),trend_percent=18 if crop.lower()=='tomatoes' else -9,confidence=.82,recommended_action='List 250–500 kg of Quality A in the next 14 days.' if demand>supply else 'Supply exceeds prototype demand; prioritize confirmed buyer requests.')

