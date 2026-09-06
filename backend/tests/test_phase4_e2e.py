import pytest
from datetime import date, timedelta
from uuid import uuid4
from fastapi.testclient import TestClient
from app.main import app
from app.database import Base, engine, SessionLocal
from app.seed_db import seed

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_database():
    Base.metadata.create_all(engine)
    db = SessionLocal()
    seed(db)
    db.close()

def get_auth_token(email: str, password: str = 'FarmDirect2026!'):
    res = client.post('/auth/login', json={'email': email, 'password': password})
    assert res.status_code == 200, f"Login failed for {email}: {res.text}"
    return res.json()['access_token']

def test_authentication_flow():
    # 1. Correct demo login
    res = client.post('/auth/login', json={'email': 'buyer@farmdirect.demo', 'password': 'FarmDirect2026!'})
    assert res.status_code == 200
    data = res.json()
    assert 'access_token' in data
    assert data['user']['role'] == 'BUYER'

    # 2. Invalid password
    res_bad = client.post('/auth/login', json={'email': 'buyer@farmdirect.demo', 'password': 'WrongPassword123'})
    assert res_bad.status_code == 401

    # 3. New user registration
    new_email = f'newbuyer_{uuid4().hex[:8]}@farmdirect.demo'
    res_reg = client.post('/auth/register', json={
        'name': 'New Buyer Org',
        'email': new_email,
        'password': 'StrongPassword123!',
        'role': 'BUYER',
        'location': 'Mumbai'
    })
    assert res_reg.status_code == 200
    assert res_reg.json()['user']['role'] == 'BUYER'

def test_rbac_enforcement():
    farmer_token = get_auth_token('farmer@farmdirect.demo')
    buyer_token = get_auth_token('buyer@farmdirect.demo')

    # Farmer cannot create demand
    res_farm_demand = client.post(
        '/demands',
        headers={'Authorization': f'Bearer {farmer_token}'},
        json={'crop': 'Tomatoes', 'quantity_kg': 500, 'max_price': 30, 'delivery_date': '2026-09-10', 'location': 'Pune', 'latitude': 18.52, 'longitude': 73.85}
    )
    assert res_farm_demand.status_code == 403

    # Buyer cannot create produce listing
    res_buy_listing = client.post(
        '/produce',
        headers={'Authorization': f'Bearer {buyer_token}'},
        json={'crop': 'Tomatoes', 'quantity_kg': 500, 'asking_price': 25}
    )
    assert res_buy_listing.status_code == 403

def test_demand_creation_and_persistence():
    buyer_token = get_auth_token('buyer@farmdirect.demo')
    delivery = (date.today() + timedelta(days=5)).isoformat()
    res = client.post(
        '/demands',
        headers={'Authorization': f'Bearer {buyer_token}'},
        json={
            'crop': 'Tomatoes',
            'quantity_kg': 1000,
            'quality_requirement': 'A',
            'max_price': 30,
            'delivery_date': delivery,
            'location': 'Pune Central Market',
            'latitude': 18.5204,
            'longitude': 73.8567,
            'radius_km': 120
        }
    )
    assert res.status_code == 200
    data = res.json()
    assert 'id' in data
    assert data['status'] == 'OPEN'

def test_matching_and_exact_1000kg_allocation():
    delivery = (date.today() + timedelta(days=5)).isoformat()
    res = client.post(
        '/matching/run',
        json={
            'crop': 'Tomatoes',
            'quantity_kg': 1000,
            'quality_requirement': 'A',
            'max_price': 30,
            'delivery_date': delivery,
            'location': 'Pune',
            'latitude': 18.5204,
            'longitude': 73.8567,
            'radius_km': 120
        }
    )
    assert res.status_code == 200
    data = res.json()
    assert data['fulfilled'] is True
    allocations = data['allocations']
    assert len(allocations) == 3, f"Expected 3 allocations, got {len(allocations)}"

    # Check total quantity is exactly 1,000 kg
    total_qty = sum(a['quantity_kg'] for a in allocations)
    assert total_qty == 1000.0

    # Check exact farm distribution: 420 kg, 330 kg, 250 kg
    quantities = sorted([a['quantity_kg'] for a in allocations], reverse=True)
    assert quantities == [420.0, 330.0, 250.0]

    # Verify transparent scores & explanations exist
    matches = data['matches']
    assert len(matches) >= 3
    assert matches[0]['score']['overall'] > 0
    assert 'Score' in matches[0]['explanation']

def test_compliance_check_assessment():
    res = client.post('/compliance/check?state=Maharashtra&crop=Tomatoes&buyer_type=B2B&order_id=FD-2026-DEMO01')
    assert res.status_code == 200
    results = res.json()
    assert len(results) >= 2
    assert results[0]['status'] == 'PASSED'
    assert 'direct-sale' in results[0]['rule'].lower()

def test_order_creation_and_farmer_acceptance_lifecycle():
    buyer_token = get_auth_token('buyer@farmdirect.demo')
    farmer_token = get_auth_token('farmer@farmdirect.demo')

    # Buyer creates order with multi-farm allocations
    order_payload = {
        'produce_subtotal': 26170.0,
        'logistics_cost': 1840.0,
        'delivery_location': 'Pune Institutional Hub',
        'allocations': [
            {
                'listing_id': 'l1',
                'farmer_id': 'farmer-1',
                'farmer_name': 'Khed Farmer Group (Demo)',
                'crop': 'Tomatoes',
                'quantity_kg': 420.0,
                'unit_price': 27.0,
                'pickup_window': '8:00 AM - 11:00 AM'
            },
            {
                'listing_id': 'l2',
                'farmer_id': 'fpo-1',
                'farmer_name': 'Baramati FPO (Demo)',
                'crop': 'Tomatoes',
                'quantity_kg': 330.0,
                'unit_price': 26.0,
                'pickup_window': '9:00 AM - 12:00 PM'
            },
            {
                'listing_id': 'l3',
                'farmer_id': 'farmer-3',
                'farmer_name': 'Junnar Growers Collective (Demo)',
                'crop': 'Tomatoes',
                'quantity_kg': 250.0,
                'unit_price': 25.0,
                'pickup_window': '10:00 AM - 1:00 PM'
            }
        ]
    }
    res_order = client.post('/orders', headers={'Authorization': f'Bearer {buyer_token}'}, json=order_payload)
    assert res_order.status_code == 200
    order_data = res_order.json()
    order_id = order_data['id']
    assert order_data['allocations_count'] == 3

    # Farmer 1 logs in and sees their order items
    res_farmer_orders = client.get('/farmers/me/orders', headers={'Authorization': f'Bearer {farmer_token}'})
    assert res_farmer_orders.status_code == 200
    farmer_orders = res_farmer_orders.json()
    assert len(farmer_orders) >= 1

    # Farmer accepts their allocation
    item_id = farmer_orders[0]['id']
    res_accept = client.post(
        f'/farmers/me/allocations/{item_id}/respond',
        headers={'Authorization': f'Bearer {farmer_token}'},
        json={'action': 'ACCEPT'}
    )
    assert res_accept.status_code == 200
    assert res_accept.json()['status'] == 'ACCEPTED'

    # Farmer marks produce ready for pickup
    res_ready = client.post(
        f'/farmers/me/orders/{order_id}/ready',
        headers={'Authorization': f'Bearer {farmer_token}'}
    )
    assert res_ready.status_code == 200
    assert res_ready.json()['status'] == 'IN_TRANSIT'

def test_logistics_quotes_and_quote_selection():
    # 1. Request logistics quotes
    res_quotes = client.post('/logistics/request?weight_kg=1000&order_id=FD-2026-DEMO01')
    assert res_quotes.status_code == 200
    quotes = res_quotes.json()
    assert len(quotes) >= 2
    mini_truck = next((q for q in quotes if 'Mini Truck' in q['vehicle']), None)
    assert mini_truck is not None
    assert mini_truck['capacity_kg'] >= 1000

    # 2. Select quote
    res_select = client.post(
        '/logistics/lr-demo/select',
        json={'quote_id': 'lq-1'}
    )
    assert res_select.status_code == 200
    sel_data = res_select.json()
    assert sel_data['vehicle'] == 'Mini Truck'
    assert sel_data['cost'] == 1840.0

def test_tracking_lifecycle_progression():
    order_id = 'FD-2026-DEMO01'
    # Advance tracking
    for _ in range(8):
        res = client.post(f'/tracking/{order_id}/next')
        assert res.status_code == 200

    # Get tracking history
    res_track = client.get(f'/tracking/{order_id}')
    assert res_track.status_code == 200
    track_data = res_track.json()
    assert track_data['complete'] is True
    assert 'DELIVERED' in track_data['events']
    assert len(track_data['route_stops']) == 4

def test_feedback_and_reliability_update():
    buyer_token = get_auth_token('buyer@farmdirect.demo')
    res_rating = client.post(
        '/ratings',
        headers={'Authorization': f'Bearer {buyer_token}'},
        json={
            'order_id': 'FD-2026-DEMO01',
            'farmer_id': 'farmer-1',
            'score': 5,
            'comment': 'Exceptional grade A quality and crisp delivery schedule.'
        }
    )
    assert res_rating.status_code == 200
    rating_data = res_rating.json()
    assert rating_data['score'] == 5
    assert rating_data['farmer_reliability'] >= 90.0

def test_analytics_endpoints():
    buyer_token = get_auth_token('buyer@farmdirect.demo')
    farmer_token = get_auth_token('farmer@farmdirect.demo')

    # Buyer analytics
    res_buyer = client.get('/analytics/buyer', headers={'Authorization': f'Bearer {buyer_token}'})
    assert res_buyer.status_code == 200
    buyer_stats = res_buyer.json()
    assert 'orders_count' in buyer_stats
    assert buyer_stats['fulfillment_rate'] > 0

    # Farmer analytics
    res_farmer = client.get('/analytics/farmer', headers={'Authorization': f'Bearer {farmer_token}'})
    assert res_farmer.status_code == 200
    farmer_stats = res_farmer.json()
    assert 'active_listings_count' in farmer_stats
    assert farmer_stats['average_rating'] > 0

def test_listing_crud_operations():
    farmer_token = get_auth_token('farmer@farmdirect.demo')
    # Create listing
    res_create = client.post(
        '/produce',
        headers={'Authorization': f'Bearer {farmer_token}'},
        json={'crop': 'Spinach', 'quantity_kg': 150.0, 'asking_price': 35.0, 'quality_grade': 'A'}
    )
    assert res_create.status_code == 200
    lid = res_create.json()['id']

    # Update listing
    res_update = client.put(
        f'/produce/{lid}',
        headers={'Authorization': f'Bearer {farmer_token}'},
        json={'quantity_kg': 200.0, 'asking_price': 32.0}
    )
    assert res_update.status_code == 200
    assert res_update.json()['quantity_kg'] == 200.0
    assert res_update.json()['asking_price'] == 32.0

    # Delete listing
    res_del = client.delete(f'/produce/{lid}', headers={'Authorization': f'Bearer {farmer_token}'})
    assert res_del.status_code == 200
    assert res_del.json()['deleted'] is True

def test_buyer_orders_endpoints():
    buyer_token = get_auth_token('buyer@farmdirect.demo')
    res_orders = client.get('/buyers/me/orders', headers={'Authorization': f'Bearer {buyer_token}'})
    assert res_orders.status_code == 200
    orders = res_orders.json()
    assert len(orders) >= 1
    assert 'items' in orders[0]

    # Get specific order
    oid = orders[0]['id']
    res_single = client.get(f'/orders/{oid}', headers={'Authorization': f'Bearer {buyer_token}'})
    assert res_single.status_code == 200
    assert res_single.json()['id'] == oid
