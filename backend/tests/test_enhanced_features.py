import pytest
from datetime import date, timedelta
from uuid import uuid4
from fastapi.testclient import TestClient
from app.main import app
from app.database import Base, engine, SessionLocal
from app.seed_db import seed
from app.ml_demand import forecaster
from app.ml_spoilage import calculate_freshness, spoilage_model
from app.route_engine import optimize_bulk_route, optimize_last_mile_route, haversine_km
from app.clustering import cluster_consumer_orders, find_nearest_partner_hub, evaluate_economic_dispatch

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.create_all(engine)
    db = SessionLocal()
    seed(db)
    db.close()

def get_token(login_id: str, password: str = 'consumer123'):
    res = client.post('/auth/login', json={'email': login_id, 'password': password})
    assert res.status_code == 200, f"Login failed for {login_id}: {res.text}"
    return res.json()['access_token']

def test_freshness_engine_calculations():
    today = date.today()
    
    # 1. Harvested today, 7 days shelf life -> 100% FRESH
    f1 = calculate_freshness(str(today), 7)
    assert f1.product_age_days == 0.0
    assert f1.remaining_shelf_life_days == 7.0
    assert f1.freshness_percentage == 100.0
    assert f1.urgency_level == 'FRESH'

    # 2. Harvested 3 days ago, 7 days shelf life -> 4 days remaining (57.1% MODERATE)
    three_days_ago = str(today - timedelta(days=3))
    f2 = calculate_freshness(three_days_ago, 7)
    assert f2.product_age_days == 3.0
    assert f2.remaining_shelf_life_days == 4.0
    assert 57.0 <= f2.freshness_percentage <= 58.0
    assert f2.urgency_level == 'MODERATE'

    # 3. Harvested 5 days ago, 7 days shelf life -> 2 days remaining (28.6% URGENT)
    five_days_ago = str(today - timedelta(days=5))
    f3 = calculate_freshness(five_days_ago, 7)
    assert f3.product_age_days == 5.0
    assert f3.remaining_shelf_life_days == 2.0
    assert f3.urgency_level == 'URGENT'

    # 4. Harvested 7 days ago, 7 days shelf life -> 0 days remaining (0% CRITICAL)
    seven_days_ago = str(today - timedelta(days=7))
    f4 = calculate_freshness(seven_days_ago, 7)
    assert f4.remaining_shelf_life_days == 0.0
    assert f4.freshness_percentage == 0.0
    assert f4.urgency_level == 'CRITICAL'

def test_ml_demand_forecasting_rf():
    # Test scikit-learn RandomForestRegressor model inference directly
    res = forecaster.predict(crop='Tomatoes', location='Pune', active_supply_kg=900.0)
    assert res.predicted_quantity > 0
    assert res.historical_average > 0
    assert res.trend in ['Increasing', 'Decreasing', 'Stable']
    assert res.market_status in ['Supply Shortage', 'Surplus Risk', 'Balanced']
    assert 'RandomForestRegressor' in res.forecast_method
    assert res.data_points_used >= 200
    assert len(res.recommendation) > 20

    # Test via FastAPI endpoint
    api_res = client.get('/forecast/demand?crop=Tomatoes&location=Pune')
    assert api_res.status_code == 200
    data = api_res.json()
    assert data['crop'] == 'Tomatoes'
    assert data['location'] == 'Pune'
    assert data['predicted_quantity'] > 0
    assert data['forecast_method'] == 'RandomForestRegressor (scikit-learn)'

def test_ml_spoilage_risk_model():
    # 1. Strawberries (Critical Perishability, 3 days shelf life, 6 hours transit without cold chain)
    strawberries_res = spoilage_model.predict(
        crop='Strawberries',
        quantity_kg=100.0,
        price_per_kg=180.0,
        harvest_date_str=str(date.today()),
        shelf_life_days=3,
        storage_type='REFRIGERATED',
        perishability_level='CRITICAL',
        distance_km=120.0,
        transit_hours=4.5,
        handling_hours=1.0,
        is_cold_chain=False,
        num_stops=3
    )
    assert strawberries_res.requires_cold_chain is True
    assert strawberries_res.recommended_vehicle in ['Refrigerated Van', 'Refrigerated Truck']
    assert strawberries_res.risk_score_percent > 0
    assert strawberries_res.expected_produce_value == 18000.0

    # 2. Potatoes (Low Perishability, 30 days shelf life, ambient)
    potato_res = spoilage_model.predict(
        crop='Potatoes',
        quantity_kg=500.0,
        price_per_kg=22.0,
        harvest_date_str=str(date.today()),
        shelf_life_days=30,
        storage_type='AMBIENT',
        perishability_level='LOW',
        distance_km=35.0,
        transit_hours=1.0,
        handling_hours=0.5,
        is_cold_chain=False,
        num_stops=1
    )
    assert potato_res.requires_cold_chain is False
    assert potato_res.feasibility_status in ['SAFE', 'WARNING']

def test_bulk_route_optimization_2opt():
    farmers = [
        {'id': 'f1', 'name': 'Khed Farmer Group', 'lat': 18.738, 'lng': 73.846, 'crop': 'Tomatoes', 'quantity_kg': 420.0, 'perishability_level': 'MEDIUM'},
        {'id': 'f2', 'name': 'Baramati FPO', 'lat': 18.151, 'lng': 74.578, 'crop': 'Tomatoes', 'quantity_kg': 330.0, 'perishability_level': 'MEDIUM'},
        {'id': 'f3', 'name': 'Junnar Collective', 'lat': 19.208, 'lng': 73.875, 'crop': 'Tomatoes', 'quantity_kg': 250.0, 'perishability_level': 'MEDIUM'}
    ]
    buyer = {
        'name': 'Pune Institutional Buyer',
        'lat': 18.5204,
        'lng': 73.8567,
        'location': 'Pune'
    }

    result = optimize_bulk_route(farmers, buyer)
    assert result.total_distance_km > 0
    assert result.baseline_distance_km >= result.total_distance_km
    assert result.distance_saved_km >= 0
    assert result.fuel_cost_saving_inr >= 0
    assert len(result.stop_sequence) == 4 # 3 pickups + 1 delivery
    assert result.stop_sequence[-1].stop_type == 'DELIVERY'
    assert result.stop_sequence[-1].quantity_kg == 1000.0

def test_dbscan_consumer_clustering():
    orders = [
        {'id': 'co-1', 'consumer_name': 'Priya', 'latitude': 18.5074, 'longitude': 73.8077, 'address': 'Kothrud, Pune', 'total_kg': 3.0},
        {'id': 'co-2', 'consumer_name': 'Amit', 'latitude': 18.5030, 'longitude': 73.8010, 'address': 'Kothrud, Pune', 'total_kg': 5.0},
        {'id': 'co-3', 'consumer_name': 'Sneha', 'latitude': 18.5110, 'longitude': 73.8140, 'address': 'Kothrud, Pune', 'total_kg': 4.5},
        {'id': 'co-4', 'consumer_name': 'Rajesh', 'latitude': 18.5670, 'longitude': 73.9140, 'address': 'Viman Nagar, Pune', 'total_kg': 4.0},
    ]

    clusters = cluster_consumer_orders(orders)
    assert len(clusters) >= 1
    kothrud_cluster = next(c for c in clusters if 'Kothrud' in c.zone_name)
    assert kothrud_cluster.consumer_count >= 2
    assert kothrud_cluster.total_quantity_kg >= 8.0
    assert 'Kothrud Cooperative Collection Point' in kothrud_cluster.recommended_hub_name

def test_last_mile_household_delivery_route():
    hub = {
        'name': 'Kothrud Cooperative Collection Point',
        'lat': 18.5074,
        'lng': 73.8077,
        'location': 'Kothrud, Pune'
    }
    consumers = [
        {'order_id': 'co-1', 'consumer_name': 'Priya Sharma', 'lat': 18.5074, 'lng': 73.8077, 'address': 'Flat 402, Mayur Colony', 'total_kg': 3.0},
        {'order_id': 'co-2', 'consumer_name': 'Amit Patil', 'lat': 18.5030, 'lng': 73.8010, 'address': 'B-12, Dahanukar Colony', 'total_kg': 5.0}
    ]

    result = optimize_last_mile_route(hub, consumers)
    assert result.route_type == 'LAST_MILE_HOUSEHOLD'
    assert len(result.stop_sequence) == 3 # 1 Hub cross-dock + 2 Home deliveries
    assert result.stop_sequence[0].stop_type == 'CROSS_DOCK'
    assert 'EV' in result.vehicle_recommended or 'Electric' in result.vehicle_recommended

def test_economic_dispatch_rule():
    # 1 KG order from 50 KM away -> unviable, recommend aggregation
    res_unviable = evaluate_economic_dispatch(quantity_kg=1.0, distance_km=50.0, price_per_kg=28.0)
    assert res_unviable['is_direct_viable'] is False
    assert res_unviable['fulfillment_mode'] == 'AGGREGATED_CROSS_DOCK'
    assert 'economically unviable' in res_unviable['reasoning'].lower()

    # 400 KG bulk order within 10 KM -> viable for direct dispatch
    res_viable = evaluate_economic_dispatch(quantity_kg=400.0, distance_km=10.0, price_per_kg=28.0)
    assert res_viable['is_direct_viable'] is True
    assert res_viable['fulfillment_mode'] == 'DIRECT_DISPATCH'

def test_consumer_order_flow():
    # Authenticate consumer
    token = get_token('consumer@farmdirect.demo', 'consumer123')
    headers = {'Authorization': f"Bearer {token}"}

    # 1. Fetch consumer products
    prod_res = client.get('/consumer/products')
    assert prod_res.status_code == 200
    products = prod_res.json()
    assert len(products) > 0
    t_listing = products[0]

    # 2. Place multi-crop basket order
    order_payload = {
        'items': [
            {'listing_id': t_listing['id'], 'crop': t_listing['crop'], 'quantity_kg': 2.0, 'unit_price': t_listing['price_per_kg']}
        ],
        'delivery_address': 'Flat 201, Kothrud, Pune',
        'latitude': 18.5074,
        'longitude': 73.8077,
        'delivery_window': '4:00 PM - 7:00 PM'
    }
    create_res = client.post('/consumer/orders', json=order_payload, headers=headers)
    assert create_res.status_code == 200
    order_data = create_res.json()
    assert 'order_id' in order_data
    assert order_data['status'] == 'PLACED'
    assert order_data['delivery_fee'] == 30.0

    # 3. Retrieve consumer orders
    my_orders_res = client.get('/consumer/orders', headers=headers)
    assert my_orders_res.status_code == 200
    assert len(my_orders_res.json()) >= 1

def test_surplus_and_waste_prevention_alerts():
    res = client.get('/waste-prevention/alerts')
    assert res.status_code == 200
    alerts = res.json()
    assert isinstance(alerts, list)
    # Check alert structure
    if alerts:
        a = alerts[0]
        assert 'listing_id' in a
        assert 'remaining_shelf_life_days' in a
        assert 'suggested_discount_percent' in a
        assert len(a['recommended_actions']) >= 1

def test_farmer_cancellation_dynamic_reallocation():
    farmer_token = client.post('/auth/login', json={'email': 'farmer@farmdirect.demo', 'password': 'farmer123'}).json()['access_token']
    headers = {'Authorization': f"Bearer {farmer_token}"}

    # Cancel allocation item oi-3 in order FD-2026-DEMO01
    cancel_res = client.post('/orders/FD-2026-DEMO01/items/oi-3/cancel', headers=headers)
    assert cancel_res.status_code == 200
    data = cancel_res.json()
    assert data['order_id'] == 'FD-2026-DEMO01'
    assert data['cancelled_item_id'] == 'oi-3'
    assert data['status'] in ['REALLOCATED', 'SHORTFALL_PENDING']
