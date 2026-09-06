from datetime import date, timedelta
from app.models import DemandRequest
from app.services import run_matching, compliance_check, forecast
def demand(qty=120): return DemandRequest(crop='Tomatoes',quantity_kg=qty,max_price=30,delivery_date=date.today()+timedelta(days=3),location='Pune',latitude=18.5204,longitude=73.8567)
def test_matching_is_ranked_and_explainable():
  result=run_matching(demand()); assert result.fulfilled; assert result.matches[0].score.overall>=result.matches[-1].score.overall; assert result.matches[0].score.distance>=0
def test_bulk_allocation_splits_when_needed():
  result=run_matching(demand(900)); assert result.fulfilled; assert len(result.allocations)>=3; assert sum(x.quantity_kg for x in result.allocations)==900
def test_compliance_is_configured_assessment():
  result=compliance_check('Maharashtra','Tomatoes','B2B'); assert result[0].status=='PASSED'; assert result[-1].status=='REVIEW'
def test_forecast_is_explicitly_demo(): assert 'Prototype' in forecast('Tomatoes','Pune').label
