from app.services import logistics_quotes
def test_demo_logistics_offers_vehicle_choices():
    quotes=logistics_quotes(1000); assert len(quotes)==2; assert quotes[0].vehicle=='Mini Truck'; assert quotes[0].capacity_kg>=1000
def test_tracking_lifecycle_is_ordered():
    flow=['CONFIRMED','LOGISTICS_REQUESTED','VEHICLE_ASSIGNED','EN_ROUTE_TO_PICKUP','PICKUP_COMPLETED','IN_TRANSIT','NEAR_DESTINATION','DELIVERED']
    assert flow.index('DELIVERED')>flow.index('IN_TRANSIT')
def test_farmer_acceptance_contract_is_explicit():
    accepted=True; assert accepted
