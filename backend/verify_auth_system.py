import urllib.request
import urllib.error
import json

print("=== 1. VERIFYING ROOT LOGIN SCREEN (http://localhost:3000/) ===")
req = urllib.request.Request('http://localhost:3000/')
with urllib.request.urlopen(req) as resp:
    html = resp.read().decode('utf-8')
    assert resp.status == 200
    assert 'FarmDirect' in html
    assert 'Direct Farm-to-Buyer Platform' in html
    assert 'Farmer / FPO Portal' in html
    assert 'Bulk Buyer Portal' in html
    assert 'Enter your User ID' in html
    assert 'Enter your Password' in html
    print("[OK] Root URL serves professional Login Portal with Farmer/FPO and Buyer tabs")

print("\n=== 2. VERIFYING FARMER AUTHENTICATION (farmer / farmer123) ===")
f_data = json.dumps({'email': 'farmer', 'password': 'farmer123'}).encode('utf-8')
req = urllib.request.Request('http://127.0.0.1:8000/auth/login', data=f_data, headers={'Content-Type': 'application/json'})
with urllib.request.urlopen(req) as resp:
    f_res = json.loads(resp.read().decode('utf-8'))
    assert resp.status == 200
    assert 'access_token' in f_res
    assert f_res['user']['role'] in ('FARMER', 'FPO')
    assert f_res['user']['name'] == 'Khed Farmer Group (Demo)'
    farmer_token = f_res['access_token']
    print("[OK] Farmer login SUCCESS: user=" + f_res['user']['name'] + ", role=" + f_res['user']['role'])

print("\n=== 3. VERIFYING BUYER AUTHENTICATION (buyer / buyer123) ===")
b_data = json.dumps({'email': 'buyer', 'password': 'buyer123'}).encode('utf-8')
req = urllib.request.Request('http://127.0.0.1:8000/auth/login', data=b_data, headers={'Content-Type': 'application/json'})
with urllib.request.urlopen(req) as resp:
    b_res = json.loads(resp.read().decode('utf-8'))
    assert resp.status == 200
    assert 'access_token' in b_res
    assert b_res['user']['role'] == 'BUYER'
    assert b_res['user']['name'] == 'Pune Institutional Buyer (Demo)'
    buyer_token = b_res['access_token']
    print("[OK] Buyer login SUCCESS: user=" + b_res['user']['name'] + ", role=" + b_res['user']['role'])

print("\n=== 4. VERIFYING INVALID CREDENTIAL REJECTION ===")
bad_data = json.dumps({'email': 'farmer', 'password': 'wrongpassword'}).encode('utf-8')
req = urllib.request.Request('http://127.0.0.1:8000/auth/login', data=bad_data, headers={'Content-Type': 'application/json'})
try:
    urllib.request.urlopen(req)
    assert False, "Expected 401"
except urllib.error.HTTPError as e:
    assert e.code == 401
    print("[OK] Invalid password rejected with status " + str(e.code) + ": " + e.read().decode('utf-8'))

print("\n=== 5. VERIFYING AUTHENTICATED SESSIONS ===")
req = urllib.request.Request('http://127.0.0.1:8000/auth/me', headers={'Authorization': f'Bearer {farmer_token}'})
with urllib.request.urlopen(req) as resp:
    me_farmer = json.loads(resp.read().decode('utf-8'))
    assert me_farmer['role'] == 'FARMER'
    print("[OK] Authenticated Farmer session verified: " + me_farmer['name'])

req = urllib.request.Request('http://127.0.0.1:8000/auth/me', headers={'Authorization': f'Bearer {buyer_token}'})
with urllib.request.urlopen(req) as resp:
    me_buyer = json.loads(resp.read().decode('utf-8'))
    assert me_buyer['role'] == 'BUYER'
    print("[OK] Authenticated Buyer session verified: " + me_buyer['name'])

print("\n=== 6. VERIFYING ROLE-PROTECTED WORKSPACE OPERATIONS ===")
# Farmer listings
req = urllib.request.Request('http://127.0.0.1:8000/farmers/me/listings', headers={'Authorization': f'Bearer {farmer_token}'})
with urllib.request.urlopen(req) as resp:
    listings = json.loads(resp.read().decode('utf-8'))
    print("[OK] Farmer listings accessible: " + str(len(listings)) + " listings")

# Buyer orders
req = urllib.request.Request('http://127.0.0.1:8000/buyers/me/orders', headers={'Authorization': f'Bearer {buyer_token}'})
with urllib.request.urlopen(req) as resp:
    orders = json.loads(resp.read().decode('utf-8'))
    print("[OK] Buyer orders accessible: " + str(len(orders)) + " orders")

print("\n=== ALL AUTOMATED CHECKS PASSED SUCCESSFULLY ===")
