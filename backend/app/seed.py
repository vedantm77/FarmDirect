from datetime import date, timedelta
from .models import ProduceListing

TODAY=date.today()
LISTINGS=[
 ProduceListing(id='l1',farmer_id='farmer-1',farmer_name='Khed Farmer Group (Demo)',crop='Tomatoes',quantity_kg=420,quality_grade='A',asking_price=27,ready_date=TODAY+timedelta(days=1),latitude=18.738,longitude=73.846,reliability=96),
 ProduceListing(id='l2',farmer_id='farmer-2',farmer_name='Baramati FPO (Demo)',crop='Tomatoes',quantity_kg=330,quality_grade='A',asking_price=26,ready_date=TODAY+timedelta(days=1),latitude=18.151,longitude=74.578,reliability=94),
 ProduceListing(id='l3',farmer_id='farmer-3',farmer_name='Junnar Growers Collective (Demo)',crop='Tomatoes',quantity_kg=250,quality_grade='A',asking_price=25,ready_date=TODAY+timedelta(days=2),latitude=19.208,longitude=73.875,reliability=92),
 ProduceListing(id='l4',farmer_id='farmer-4',farmer_name='Mulshi Farmer Group (Demo)',crop='Tomatoes',quantity_kg=180,quality_grade='A',asking_price=29,ready_date=TODAY+timedelta(days=1),latitude=18.520,longitude=73.508,reliability=97),
 ProduceListing(id='l5',farmer_id='farmer-5',farmer_name='Indapur FPO (Demo)',crop='Onions',quantity_kg=500,quality_grade='A',asking_price=24,ready_date=TODAY,latitude=18.117,longitude=75.026,reliability=91),
]
