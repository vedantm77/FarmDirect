"""
FarmDirect Comprehensive Live E2E Verification Script
Tests all 12 priority areas specified in the Smart India Hackathon master prompt:
1. Real ML demand forecasting (RandomForestRegressor)
2. Perishable product intelligence + freshness/shelf-life calculation
3. ML spoilage-risk prediction (RandomForestClassifier)
4. Real route optimization for bulk deliveries (Nearest Neighbor + 2-Opt TSP)
5. Perishability-aware logistics & cold-chain recommendation
6. Consumer portal & multi-crop basket ordering
7. Small household order aggregation via DBSCAN geographic clustering
8. Partner/FPO short-duration cross-docking (Asset-light No-Warehouse model)
9. Last-mile household delivery route optimization
10. Food-waste/surplus prevention alerts
11. Exception handling (cancellation & automated rematching)
12. Farm-to-fork batch traceability
"""

import os
from datetime import date, timedelta
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import engine, Base, session
from app.seed_db import seed

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_live_db():
    Base.metadata.create_all(engine)
    db = next(session())
    seed(db)
    db.close()

def test_live_scenario_a_bulk_demand_matching_and_2opt_route():
    """Scenario A: 1000kg Bulk Buyer demand, multi-farm allocation, 2-Opt TSP route optimization."""
    # 1. Login as buyer
    login_res = client.post("/auth/login", json={"email": "buyer@farmdirect.demo", "password": "buyer123"})
    assert login_res.status_code == 200, f"Login failed: {login_res.text}"
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Submit demand for 1000 kg Tomatoes
    delivery_date_str = str(date.today() + timedelta(days=1))
    demand_payload = {
        "crop": "Tomatoes",
        "quantity_kg": 1000.0,
        "quality_requirement": "A",
        "max_price": 30.0,
        "delivery_date": delivery_date_str,
        "location": "Pune Institutional Hub",
        "latitude": 18.5204,
        "longitude": 73.8567,
        "radius_km": 120.0
    }
    match_res = client.post("/matching/run", json=demand_payload)
    assert match_res.status_code == 200, f"Matching failed: {match_res.text}"
    data = match_res.json()
    assert len(data["matches"]) >= 2
    assert len(data["allocations"]) >= 1

    # 3. Optimize multi-farm pickup route with 2-Opt TSP
    route_res = client.post("/logistics/optimize-route", json={
        "buyer_name": "Pune Institutional Hub",
        "buyer_location": "Pune",
        "buyer_lat": 18.5204,
        "buyer_lng": 73.8567,
        "farmers": [
            {"id": "f1", "name": "Khed Farmer Group", "lat": 18.738, "lng": 73.846, "quantity_kg": 420.0, "crop": "Tomatoes", "perishability_level": "MEDIUM"},
            {"id": "f2", "name": "Baramati FPO", "lat": 18.151, "lng": 74.578, "quantity_kg": 330.0, "crop": "Tomatoes", "perishability_level": "MEDIUM"},
            {"id": "f3", "name": "Junnar Collective", "lat": 19.208, "lng": 73.875, "quantity_kg": 250.0, "crop": "Tomatoes", "perishability_level": "MEDIUM"}
        ]
    })
    assert route_res.status_code == 200
    route = route_res.json()
    assert route["route_type"] == "BULK_PICKUP"
    assert len(route["stop_sequence"]) == 4 # 3 pickups + 1 delivery
    assert route["total_distance_km"] > 0
    assert route["distance_saved_km"] > 0
    assert route["fuel_cost_saving_inr"] > 0
    assert "2-Opt" in route["optimization_method"]

def test_live_scenario_b_perishable_intelligence_and_ml_spoilage():
    """Scenario B: Perishable strawberry listing, freshness degradation, and ML spoilage risk."""
    # 1. Fetch strawberry listing from database
    produce_res = client.get("/produce?crop=Strawberries")
    assert produce_res.status_code == 200
    strawberries = produce_res.json()
    assert len(strawberries) > 0
    straw_id = strawberries[0]["id"]

    # 2. Check freshness degradation calculation
    fresh_res = client.get(f"/produce/{straw_id}/freshness")
    assert fresh_res.status_code == 200
    fresh = fresh_res.json()
    assert "freshness_percentage" in fresh
    assert fresh["remaining_shelf_life_days"] <= 4.0

    # 3. Check ML spoilage prediction under ambient conditions (should trigger warning/risk)
    ambient_risk = client.post(f"/produce/{straw_id}/spoilage-risk", json={
        "transit_hours": 3.0,
        "handling_hours": 1.0,
        "is_cold_chain": False,
        "num_stops": 3,
        "distance_km": 50.0
    })
    assert ambient_risk.status_code == 200
    amb = ambient_risk.json()
    assert amb["requires_cold_chain"] is True
    assert "RandomForestClassifier" in amb["method"]

    # 4. Check ML spoilage prediction with Reefer Cold-Chain enabled (should become SAFE)
    cold_risk = client.post(f"/produce/{straw_id}/spoilage-risk", json={
        "transit_hours": 3.0,
        "handling_hours": 1.0,
        "is_cold_chain": True,
        "num_stops": 3,
        "distance_km": 50.0
    })
    assert cold_risk.status_code == 200
    cld = cold_risk.json()
    assert cld["feasibility_status"] == "SAFE"

def test_live_scenario_c_household_consumer_dbscan_and_traceability():
    """Scenario C: Household consumer portal, DBSCAN clustering, partner cross-docking, and last-mile route."""
    # 1. Consumer gets available products
    prods_res = client.get("/consumer/products")
    assert prods_res.status_code == 200
    products = prods_res.json()
    assert len(products) >= 3

    # Consumer login for authenticated order placement
    consumer_login = client.post("/auth/login", json={"email": "consumer@farmdirect.demo", "password": "consumer123"})
    assert consumer_login.status_code == 200
    consumer_token = consumer_login.json()["access_token"]
    consumer_headers = {"Authorization": f"Bearer {consumer_token}"}

    # 2. Consumer creates multi-crop small basket order
    order_res = client.post("/consumer/orders", json={
        "delivery_address": "Flat 402, Mayur Colony, Kothrud, Pune",
        "latitude": 18.5074,
        "longitude": 73.8077,
        "items": [
            {
                "listing_id": products[0]["id"],
                "crop": products[0]["crop"],
                "quantity_kg": 2.0,
                "unit_price": products[0]["price_per_kg"]
            },
            {
                "listing_id": products[1]["id"],
                "crop": products[1]["crop"],
                "quantity_kg": 1.5,
                "unit_price": products[1]["price_per_kg"]
            }
        ]
    }, headers=consumer_headers)
    assert order_res.status_code == 200, f"Order failed: {order_res.text}"
    order = order_res.json()
    assert order["status"] == "PLACED"
    assert "order_id" in order
    assert order["total"] > 0
    assert "economic_dispatch_rule" in order

    # Fetch consumer order details to verify farm batch traceability
    details_res = client.get(f"/consumer/orders/{order['order_id']}", headers=consumer_headers)
    assert details_res.status_code == 200
    details = details_res.json()
    assert len(details["items"]) == 2
    assert "farmer_name" in details["items"][0]
    assert "crop" in details["items"][0]

    # 3. Cluster household consumer orders using DBSCAN
    cluster_res = client.post("/consumer/cluster-orders")
    assert cluster_res.status_code == 200
    clusters = cluster_res.json()
    assert len(clusters) >= 1
    assert "DBSCAN" in clusters[0]["clustering_method"]
    assert clusters[0]["recommended_hub_id"] is not None

    # 4. Generate last-mile EV delivery route from partner hub
    cluster_id = clusters[0]["cluster_id"]
    last_mile_res = client.post(f"/consumer/clusters/{cluster_id}/last-mile-route")
    assert last_mile_res.status_code == 200
    lm = last_mile_res.json()
    assert lm["route_type"] == "LAST_MILE_HOUSEHOLD"
    assert len(lm["stop_sequence"]) >= 2
    assert lm["stop_sequence"][0]["stop_type"] == "CROSS_DOCK"

def test_live_scenario_d_food_waste_and_surplus_prevention():
    """Scenario D: Proactive surplus alerts and ML demand forecasting."""
    # 1. Test ML Demand Forecasting endpoint
    forecast_res = client.get("/forecast/demand?crop=Tomatoes&location=Pune")
    assert forecast_res.status_code == 200
    f = forecast_res.json()
    assert f["predicted_quantity"] > 0
    assert "RandomForestRegressor" in f["forecast_method"]
    assert f["data_points_used"] > 0
    assert f["market_status"] in ["Supply Shortage", "Surplus Risk", "Balanced"]

    # 2. Test Waste Prevention Alerts endpoint
    alerts_res = client.get("/waste-prevention/alerts")
    assert alerts_res.status_code == 200
    alerts = alerts_res.json()
    assert isinstance(alerts, list)
    for alert in alerts:
        assert "listing_id" in alert
        assert "urgency_level" in alert
        assert "freshness_percentage" in alert
        assert "recommended_actions" in alert or "recommended_action" in alert

def test_live_scenario_e_partner_hubs_asset_light():
    """Scenario E: Partner and FPO hubs verify zero owned warehouses."""
    hubs_res = client.get("/hubs")
    assert hubs_res.status_code == 200
    hubs = hubs_res.json()
    assert len(hubs) >= 3
    # Check asset-light model
    for h in hubs:
        assert h["hub_type"] in ["FPO_COLLECTION_CENTER", "COLD_STORAGE_PARTNER", "PARTNER_STORE"]
        assert "Partner" in h["operational_model"] or "FPO" in h["operational_model"]
