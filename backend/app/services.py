from math import asin, cos, radians, sin, sqrt
from datetime import datetime, timezone, date
from .models import (
    MatchScore, Match, Allocation, MatchResponse,
    ProduceListing, ComplianceResult, LogisticsQuote, Forecast,
    PERISHABILITY_PRESETS
)
from .seed import LISTINGS
from .ml_spoilage import calculate_freshness
from .ml_demand import forecaster

WEIGHTS = {
    'distance': 0.30,
    'price': 0.20,
    'quantity': 0.15,
    'quality': 0.15,
    'readiness': 0.10,
    'reliability': 0.10
}

def haversine_km(a: float, b: float, c: float, d: float) -> float:
    x = radians(c - a)
    y = radians(d - b)
    h = sin(x / 2) ** 2 + cos(radians(a)) * cos(radians(c)) * sin(y / 2) ** 2
    return 6371.0 * 2.0 * asin(sqrt(h))

def score(listing: ProduceListing, demand):
    dist = haversine_km(demand.latitude, demand.longitude, listing.latitude, listing.longitude)
    
    # 6 Core Factors
    values = {
        'distance': max(0.0, 100.0 * (1.0 - dist / max(1.0, demand.radius_km))),
        'price': max(0.0, 100.0 * (1.0 - (listing.asking_price - demand.max_price) / max(1.0, demand.max_price))),
        'quantity': min(100.0, 100.0 * listing.quantity_kg / max(1.0, demand.quantity_kg)),
        'quality': 100.0 if listing.quality_grade >= demand.quality_requirement else 35.0,
        'readiness': 100.0 if str(listing.ready_date) <= str(demand.delivery_date) else 20.0,
        'reliability': float(listing.reliability)
    }
    
    total = round(sum(values[k] * WEIGHTS[k] for k in WEIGHTS), 1)
    
    # Perishability and Freshness Feasibility
    freshness = calculate_freshness(listing.harvest_date, listing.shelf_life_days)
    freshness_val = freshness.freshness_percentage
    
    # Delivery feasibility: is remaining shelf life adequate for transit?
    est_transit_hours = max(0.5, dist / 35.0)
    remaining_hours = freshness.remaining_shelf_life_days * 24.0
    feasibility_val = 100.0 if remaining_hours >= est_transit_hours * 2.0 else (50.0 if remaining_hours >= est_transit_hours else 0.0)

    match_score = MatchScore(
        overall=total,
        distance=round(values['distance'], 1),
        price=round(values['price'], 1),
        quantity=round(values['quantity'], 1),
        quality=round(values['quality'], 1),
        readiness=round(values['readiness'], 1),
        reliability=round(values['reliability'], 1),
        freshness=round(freshness_val, 1),
        delivery_feasibility=round(feasibility_val, 1)
    )
    return dist, match_score

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
                    
                    # Freshness
                    fresh = calculate_freshness(x.harvest_date, x.shelf_life_days)
                    candidates.append(ProduceListing(
                        id=x.id,
                        farmer_id=x.farmer_id,
                        farmer_name=farmer_name,
                        crop=x.crop,
                        quantity_kg=x.quantity_kg,
                        quality_grade=x.quality_grade,
                        asking_price=x.asking_price,
                        ready_date=ready,
                        latitude=x.latitude,
                        longitude=x.longitude,
                        reliability=reliability,
                        status=x.status,
                        harvest_date=x.harvest_date or str(date.today()),
                        shelf_life_days=x.shelf_life_days,
                        storage_type=x.storage_type,
                        temperature_min=x.temperature_min,
                        temperature_max=x.temperature_max,
                        perishability_level=x.perishability_level,
                        freshness_percentage=fresh.freshness_percentage,
                        remaining_shelf_life_days=fresh.remaining_shelf_life_days,
                        urgency_level=fresh.urgency_level
                    ))
        except Exception:
            candidates = []

    if not candidates:
        for seed_item in list(LISTINGS):
            crop_lower = seed_item.crop.lower().rstrip('s')
            preset = PERISHABILITY_PRESETS.get(crop_lower, {
                'shelf_life_days': 7,
                'storage_type': 'VENTILATED',
                'temperature_min': 12.0,
                'temperature_max': 18.0,
                'perishability_level': 'MEDIUM'
            })
            fresh = calculate_freshness(str(date.today()), preset['shelf_life_days'])
            candidates.append(ProduceListing(
                id=seed_item.id,
                farmer_id=seed_item.farmer_id or 'farmer-1',
                farmer_name=seed_item.farmer_name,
                crop=seed_item.crop,
                quantity_kg=seed_item.quantity_kg,
                quality_grade=seed_item.quality_grade,
                asking_price=seed_item.asking_price,
                ready_date=seed_item.ready_date or date.today(),
                latitude=seed_item.latitude or 18.738,
                longitude=seed_item.longitude or 73.846,
                reliability=seed_item.reliability,
                status='ACTIVE',
                harvest_date=str(date.today()),
                shelf_life_days=preset['shelf_life_days'],
                storage_type=preset['storage_type'],
                temperature_min=preset['temperature_min'],
                temperature_max=preset['temperature_max'],
                perishability_level=preset['perishability_level'],
                freshness_percentage=fresh.freshness_percentage,
                remaining_shelf_life_days=fresh.remaining_shelf_life_days,
                urgency_level=fresh.urgency_level
            ))

    options = []
    for listing in candidates:
        list_crop_norm = listing.crop.strip().lower().rstrip('s')
        if (list_crop_norm != demand_crop_norm and demand_crop_norm not in list_crop_norm) or listing.asking_price > demand.max_price or str(listing.ready_date) > str(demand.delivery_date):
            continue
        distance, breakdown = score(listing, demand)
        if distance <= demand.radius_km:
            expl = (
                f"Score {breakdown.overall}%: {distance:.1f}km away ({breakdown.distance}%), "
                f"₹{listing.asking_price}/kg ({breakdown.price}%), Quality {listing.quality_grade}, "
                f"{listing.reliability}% reliability, {listing.freshness_percentage}% freshness."
            )
            options.append(Match(
                listing=listing,
                distance_km=round(distance, 1),
                score=breakdown,
                logistics_feasible=breakdown.delivery_feasibility > 0,
                explanation=expl
            ))

    options.sort(key=lambda x: x.score.overall, reverse=True)
    remaining = demand.quantity_kg
    allocations = []

    for match in options:
        if remaining <= 0:
            break
        qty = min(remaining, match.listing.quantity_kg)
        remaining -= qty
        allocations.append(Allocation(
            listing_id=match.listing.id,
            farmer_id=match.listing.farmer_id,
            farmer_name=match.listing.farmer_name,
            quantity_kg=qty,
            price_per_kg=match.listing.asking_price,
            distance_km=match.distance_km,
            storage_type=match.listing.storage_type,
            perishability_level=match.listing.perishability_level
        ))

    msg = (
        'Single-farm direct match found.' if len(allocations) == 1
        else f'Fulfilled by {len(allocations)} farms through direct transparent allocation.' if allocations
        else 'No compatible farm listings found within search criteria.'
    )
    return MatchResponse(matches=options, allocations=allocations, fulfilled=remaining <= 0, message=msg)

def compliance_check(state: str, crop: str, buyer_type: str):
    checks = [
        ('Applicable Maharashtra direct-sale rule', 'PASSED', 'Configured rule allows this direct-sale pathway without mandating APMC intermediary cess.', []),
        ('Commodity eligibility', 'PASSED', f'{crop} is eligible under state direct-marketing notification.', []),
        ('Documents & Quality Verification', 'REVIEW', 'Verify FPO registration and quality test report before order dispatch.', ['Farmer 7-12 / Land record or FPO Registration', 'Quality inspection / Grade certificate'])
    ]
    now = datetime.now(timezone.utc)
    return [
        ComplianceResult(
            rule=a,
            status=b,
            reason=c,
            required_documents=d,
            source_reference='Demo Maharashtra Agricultural Produce Marketing (Regulation) Exemption Framework',
            checked_at=now
        )
        for a, b, c, d in checks
    ]

def logistics_quotes(weight: float = 1000.0, requires_cold_chain: bool = False) -> list[LogisticsQuote]:
    """
    Returns realistic 3PL logistics options including cold-chain vehicles when required.
    """
    if requires_cold_chain:
        return [
            LogisticsQuote(
                partner='ColdChain Logistics India',
                vehicle='Refrigerated Van (2-8°C)',
                cost=round(2400.0 + (weight * 0.4), 0),
                eta_minutes=120,
                capacity_kg=1200.0,
                selected=True,
                requires_cold_chain=True,
                spoilage_risk='LOW'
            ),
            LogisticsQuote(
                partner='Express Agri Cold Transit',
                vehicle='Insulated Reefer Tempo',
                cost=round(2800.0 + (weight * 0.35), 0),
                eta_minutes=95,
                capacity_kg=1500.0,
                selected=False,
                requires_cold_chain=True,
                spoilage_risk='LOW'
            ),
            LogisticsQuote(
                partner='Demo Logistics Partner (Non-Reefer)',
                vehicle='Mini Truck (Ventilated)',
                cost=1840.0,
                eta_minutes=135,
                capacity_kg=1500.0,
                selected=False,
                requires_cold_chain=False,
                spoilage_risk='HIGH'
            )
        ]
    else:
        return [
            LogisticsQuote(
                partner='Demo Logistics Partner',
                vehicle='Mini Truck',
                cost=1840.0,
                eta_minutes=135,
                capacity_kg=1500.0,
                selected=True,
                requires_cold_chain=False,
                spoilage_risk='LOW'
            ),
            LogisticsQuote(
                partner='Pune Route Network',
                vehicle='Tempo',
                cost=2200.0,
                eta_minutes=110,
                capacity_kg=900.0,
                selected=False,
                requires_cold_chain=False,
                spoilage_risk='LOW'
            )
        ]

def forecast(crop: str, region: str) -> Forecast:
    """
    Maintains backward compatibility while powered by real RandomForestRegressor.
    """
    res = forecaster.predict(crop=crop, location=region, active_supply_kg=950.0)
    pred_tonnes = round(res.predicted_quantity / 1000.0, 2)
    supply_tonnes = round(res.active_supply / 1000.0, 2)
    gap_tonnes = round(pred_tonnes - supply_tonnes, 2)
    trend_pct = 18.0 if res.trend == 'Increasing' else (-9.0 if res.trend == 'Decreasing' else 2.0)
    
    return Forecast(
        crop=crop,
        region=region,
        predicted_demand_tonnes=pred_tonnes,
        available_supply_tonnes=supply_tonnes,
        supply_gap_tonnes=gap_tonnes,
        trend_percent=trend_pct,
        confidence=0.88,
        recommended_action=res.recommendation,
        label='Prototype forecast / RandomForestRegressor ML (Demonstration Dataset)'
    )
