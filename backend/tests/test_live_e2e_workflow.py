import json
import urllib.request
import urllib.error
from uuid import uuid4

BASE_API = 'http://127.0.0.1:8000'
FRONTEND_URL = 'http://localhost:3000'

def req(method, url, data=None, headers=None):
    headers = headers or {}
    req_data = None
    if data is not None:
        req_data = json.dumps(data).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    r = urllib.request.Request(url, data=req_data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            body = resp.read().decode('utf-8')
            try:
                data = json.loads(body) if body else {}
            except Exception:
                data = body
            return resp.status, data
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8')
        try:
            err_data = json.loads(err_body) if err_body else {}
        except Exception:
            err_data = err_body
        return e.code, err_data

def test_full_real_lifecycle():
    print("--- 1. Testing Frontend & Backend Connectivity ---")
    status, _ = req("GET", FRONTEND_URL)
    assert status == 200, f"Frontend failed with {status}"
    print(f"Frontend active at {FRONTEND_URL}: 200 OK")

    status, health = req("GET", f"{BASE_API}/health")
    assert status == 200, f"Backend failed with {status}"
    print(f"Backend active at {BASE_API}: {health}")

    print("\n--- 2. Farmer / FPO Workflow ---")
    # 2.1 Register New Farmer
    f_email = f"nashik_agro_{uuid4().hex[:6]}@farmdirect.org"
    status, f_reg = req("POST", f"{BASE_API}/auth/register", {
        "name": "Nashik Organic FPO",
        "email": f_email,
        "password": "Password2026!",
        "role": "FPO",
        "location": "Nashik",
        "state": "Maharashtra"
    })
    assert status == 200, f"Farmer registration failed: {f_reg}"
    farmer_token = f_reg['access_token']
    farmer_user = f_reg['user']
    farmer_headers = {"Authorization": f"Bearer {farmer_token}"}
    print(f"Registered farmer: {farmer_user['name']} ({f_email})")

    # 2.2 Create Produce Listing
    status, f_listing = req("POST", f"{BASE_API}/produce", {
        "crop": "Tomatoes",
        "quantity_kg": 600.0,
        "asking_price": 28.0,
        "quality_grade": "A",
        "ready_date": "2026-09-12",
        "latitude": 19.9975,
        "longitude": 73.7898
    }, farmer_headers)
    assert status == 200, f"Listing create failed: {f_listing}"
    listing_id = f_listing['id']
    print(f"Created listing: {listing_id} (600 kg Tomatoes @ Rs.28/kg)")

    # 2.3 Edit Produce Listing
    status, f_edit = req("PUT", f"{BASE_API}/produce/{listing_id}", {
        "quantity_kg": 650.0,
        "asking_price": 27.5
    }, farmer_headers)
    assert status == 200, f"Listing edit failed: {f_edit}"
    assert f_edit['quantity_kg'] == 650.0
    assert f_edit['asking_price'] == 27.5
    print(f"Updated listing: {listing_id} -> {f_edit['quantity_kg']} kg @ Rs.{f_edit['asking_price']}/kg")

    # 2.4 Verify Listings Retrieval
    status, my_listings = req("GET", f"{BASE_API}/farmers/me/listings", headers=farmer_headers)
    assert status == 200
    assert any(x['id'] == listing_id for x in my_listings)
    print(f"Verified {len(my_listings)} listing(s) in farmer portfolio")

    # 2.5 View Buyer Demands
    status, f_demands = req("GET", f"{BASE_API}/farmers/me/demands", headers=farmer_headers)
    assert status == 200
    print(f"Farmer retrieved {len(f_demands)} active buyer demand(s)")

    print("\n--- 3. Bulk Buyer Workflow ---")
    # 3.1 Register New Bulk Buyer
    b_email = f"metro_retail_{uuid4().hex[:6]}@farmdirect.org"
    status, b_reg = req("POST", f"{BASE_API}/auth/register", {
        "name": "Metro Retail Chain Hub",
        "email": b_email,
        "password": "Password2026!",
        "role": "BUYER",
        "location": "Pune",
        "state": "Maharashtra"
    })
    assert status == 200, f"Buyer registration failed: {b_reg}"
    buyer_token = b_reg['access_token']
    buyer_user = b_reg['user']
    buyer_headers = {"Authorization": f"Bearer {buyer_token}"}
    print(f"Registered bulk buyer: {buyer_user['name']} ({b_email})")

    # 3.2 Create Demand
    status, b_demand = req("POST", f"{BASE_API}/demands", {
        "crop": "Tomatoes",
        "quantity_kg": 1000.0,
        "quality_requirement": "A",
        "max_price": 30.0,
        "delivery_date": "2026-09-12",
        "location": "Pune Metro Hub",
        "latitude": 18.5204,
        "longitude": 73.8567,
        "radius_km": 150.0
    }, buyer_headers)
    assert status == 200, f"Demand creation failed: {b_demand}"
    demand_id = b_demand['id']
    print(f"Created demand #{demand_id} for 1,000 kg Tomatoes")

    # 3.3 Run Matching Algorithm
    status, match_data = req("POST", f"{BASE_API}/matching/run", {
        "crop": "Tomatoes",
        "quantity_kg": 1000.0,
        "quality_requirement": "A",
        "max_price": 30.0,
        "delivery_date": "2026-09-12",
        "location": "Pune Metro Hub",
        "latitude": 18.5204,
        "longitude": 73.8567,
        "radius_km": 150.0
    })
    assert status == 200, f"Matching failed: {match_data}"
    assert len(match_data['matches']) > 0
    assert len(match_data['allocations']) > 0
    print(f"Match algorithm returned {len(match_data['matches'])} ranked farms and {len(match_data['allocations'])} allocation(s)")
    for m in match_data['matches'][:3]:
        print(f"  Farm: {m['listing']['farmer_name']}, Score: {m['score']['overall']}%, Price: Rs.{m['listing']['asking_price']}/kg")

    # 3.4 Statutory Compliance Verification
    status, comp_data = req("POST", f"{BASE_API}/compliance/check?state=Maharashtra&crop=Tomatoes&buyer_type=B2B")
    assert status == 200
    assert len(comp_data) >= 2
    assert comp_data[0]['status'] == 'PASSED'
    print(f"Compliance check passed: {comp_data[0]['rule']}")

    # 3.5 Create Order with Multi-Farm Allocations
    subtotal = sum(a['quantity_kg'] * a['price_per_kg'] for a in match_data['allocations'])
    order_allocs = [{
        "listing_id": a['listing_id'],
        "farmer_id": a['farmer_id'] or farmer_user['id'],
        "farmer_name": a['farmer_name'],
        "crop": "Tomatoes",
        "quantity_kg": a['quantity_kg'],
        "unit_price": a['price_per_kg'],
        "pickup_window": "8:00 AM - 11:00 AM"
    } for a in match_data['allocations']]

    status, order_data = req("POST", f"{BASE_API}/orders", {
        "produce_subtotal": subtotal,
        "logistics_cost": 1840.0,
        "delivery_location": "Pune Metro Hub",
        "allocations": order_allocs
    }, buyer_headers)
    assert status == 200, f"Order creation failed: {order_data}"
    order_id = order_data['id']
    print(f"Order #{order_id} confirmed in database (Total: Rs.{order_data['total']}, {order_data['allocations_count']} farms allocated)")

    # 3.6 3PL Logistics Request & Selection
    status, quotes = req("POST", f"{BASE_API}/logistics/request?weight_kg=1000&order_id={order_id}")
    assert status == 200
    assert len(quotes) >= 2
    print(f"3PL freight quotes available: {[q['vehicle'] + ' (Rs.' + str(q['cost']) + ')' for q in quotes]}")

    status, sel_quote = req("POST", f"{BASE_API}/logistics/lr-demo/select", {"quote_id": "lq-1"})
    assert status == 200
    print(f"Booked 3PL Vehicle: {sel_quote['vehicle']} @ Rs.{sel_quote['cost']}")

    # 3.7 Progress Live Tracking to Delivery
    status, track_init = req("GET", f"{BASE_API}/tracking/{order_id}")
    assert status == 200
    print(f"Initial tracking status: {track_init['current_status']}, Route stops: {len(track_init['route_stops'])}")

    for _ in range(8):
        status, next_res = req("POST", f"{BASE_API}/tracking/{order_id}/next")
        assert status == 200

    status, track_final = req("GET", f"{BASE_API}/tracking/{order_id}")
    assert status == 200
    assert track_final['complete'] is True
    assert track_final['current_status'] == 'DELIVERED'
    print(f"Final tracking milestone: {track_final['current_status']} (Complete: {track_final['complete']})")

    # 3.8 Submit Feedback & Rating
    status, rate_res = req("POST", f"{BASE_API}/ratings", {
        "order_id": order_id,
        "farmer_id": order_allocs[0]['farmer_id'],
        "score": 5,
        "comment": "Outstanding freshness, Grade A tomatoes strictly compliant with specs."
    }, buyer_headers)
    assert status == 200
    print(f"Submitted 5-star rating for farmer: New reliability = {rate_res['farmer_reliability']}%")

    # 3.9 Verify Buyer Orders List & Analytics
    status, buyer_orders = req("GET", f"{BASE_API}/buyers/me/orders", headers=buyer_headers)
    assert status == 200
    assert any(o['id'] == order_id for o in buyer_orders)
    print(f"Verified order #{order_id} in Buyer's Order History ({len(buyer_orders)} total orders)")

    status, buyer_analytics = req("GET", f"{BASE_API}/analytics/buyer", headers=buyer_headers)
    assert status == 200
    assert buyer_analytics['orders_count'] >= 1
    print(f"Buyer Analytics: Orders={buyer_analytics['orders_count']}, Total Demand={buyer_analytics['total_demand_kg']} kg, Spend=Rs.{buyer_analytics['total_spend']}")

    print("\n==========================================")
    print("ALL END-TO-END WORKFLOW CONTRACTS VERIFIED!")
    print("==========================================")

if __name__ == '__main__':
    test_full_real_lifecycle()
