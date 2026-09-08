"""
Real Machine Learning Demand Forecasting Module
Uses RandomForestRegressor from scikit-learn.
Transparently trained on synthetic historical demonstration data calibrated for
Maharashtra regional agricultural markets (Pune, Nashik, Baramati, Junnar, Mumbai).
"""

import numpy as np
from datetime import date
from sklearn.ensemble import RandomForestRegressor
from .models import DemandForecastResponse

CROP_ENCODING = {
    'tomatoes': 0,
    'tomato': 0,
    'spinach': 1,
    'strawberries': 2,
    'strawberry': 2,
    'potatoes': 3,
    'potato': 3,
    'onions': 4,
    'onion': 4
}

LOCATION_ENCODING = {
    'pune': 0,
    'khed': 1,
    'baramati': 2,
    'junnar': 3,
    'mumbai': 4,
    'nashik': 5
}

def generate_synthetic_historical_data():
    """
    Generates 300+ historical weekly records representing realistic seasonality,
    lagged demand, rolling averages, and price sensitivity for regional Maharashtra clusters.
    Returns X (features matrix), y (target array), and historical_lookup dict.
    """
    np.random.seed(42)
    X_rows = []
    y_vals = []
    lookup = {} # (crop_enc, loc_enc) -> list of demands
    
    crops = ['tomatoes', 'spinach', 'strawberries', 'potatoes', 'onions']
    locations = ['pune', 'khed', 'baramati', 'junnar', 'mumbai', 'nashik']

    base_demands = {
        'tomatoes': 1200.0,
        'spinach': 450.0,
        'strawberries': 350.0,
        'potatoes': 2000.0,
        'onions': 1800.0
    }

    for week in range(1, 53):
        month = int((week - 1) / 4.33) + 1
        if month in [3, 4, 5]:
            season = 1
        elif month in [6, 7, 8, 9]:
            season = 2
        elif month in [10, 11]:
            season = 3
        else:
            season = 4

        for crop in crops:
            c_enc = CROP_ENCODING[crop]
            base = base_demands[crop]

            season_mult = 1.0
            if crop == 'strawberries' and season == 4:
                season_mult = 1.6
            elif crop == 'tomatoes' and season in [1, 3]:
                season_mult = 1.25
            elif crop == 'spinach' and season == 2:
                season_mult = 0.85

            for loc in locations:
                l_enc = LOCATION_ENCODING[loc]
                loc_mult = 1.4 if loc in ['pune', 'mumbai'] else 0.8

                prev_demand = base * season_mult * loc_mult + float(np.random.normal(0, base * 0.08))
                recent_orders = prev_demand * float(np.random.uniform(0.92, 1.08))
                rolling_avg = (prev_demand + recent_orders) / 2.0

                noise = float(np.random.normal(0, base * 0.05))
                future_demand = max(50.0, (prev_demand * 0.4 + recent_orders * 0.3 + rolling_avg * 0.3) + noise)

                X_rows.append([c_enc, l_enc, month, season, prev_demand, recent_orders, rolling_avg])
                y_vals.append(future_demand)
                lookup.setdefault((c_enc, l_enc), []).append(future_demand)

    return np.array(X_rows, dtype=np.float64), np.array(y_vals, dtype=np.float64), lookup

class DemandForecaster:
    def __init__(self):
        self.model = RandomForestRegressor(
            n_estimators=40,
            max_depth=8,
            random_state=42
        )
        self.X, self.y, self.lookup = generate_synthetic_historical_data()
        self._train()

    def _train(self):
        self.model.fit(self.X, self.y)

    def predict(self, crop: str, location: str, active_supply_kg: float = 0.0) -> DemandForecastResponse:
        crop_norm = crop.strip().lower().rstrip('s')
        if crop_norm not in CROP_ENCODING:
            crop_norm = 'tomatoes'
        c_enc = CROP_ENCODING.get(crop_norm, 0)

        loc_norm = location.strip().lower()
        l_enc = LOCATION_ENCODING.get(loc_norm, 0)

        today = date.today()
        month = today.month
        if month in [3, 4, 5]:
            season = 1
        elif month in [6, 7, 8, 9]:
            season = 2
        elif month in [10, 11]:
            season = 3
        else:
            season = 4

        history = self.lookup.get((c_enc, l_enc))
        if not history:
            history = self.lookup.get((c_enc, 0), [1000.0])

        hist_avg = float(np.mean(history))
        prev_demand = float(history[-1])
        recent_orders = prev_demand * 1.02
        rolling_avg = (prev_demand + recent_orders) / 2.0

        features = np.array([[c_enc, l_enc, month, season, prev_demand, recent_orders, rolling_avg]], dtype=np.float64)
        pred_qty = float(self.model.predict(features)[0])
        pred_qty = round(pred_qty, 1)
        hist_avg = round(hist_avg, 1)

        # Trend analysis
        ratio = pred_qty / (hist_avg if hist_avg > 0 else 1.0)
        if ratio >= 1.05:
            trend = 'Increasing'
        elif ratio <= 0.95:
            trend = 'Decreasing'
        else:
            trend = 'Stable'

        # Supply gap & Market status
        active_supply = round(active_supply_kg, 1)
        supply_gap = round(pred_qty - active_supply, 1)

        if supply_gap > 100:
            market_status = 'Supply Shortage'
            recommendation = (
                f"Predicted demand ({pred_qty:,.0f} KG) exceeds active supply ({active_supply:,.0f} KG) "
                f"by {supply_gap:,.0f} KG. Notify nearby farmers and FPO aggregation centers to list additional volume."
            )
        elif supply_gap < -100:
            market_status = 'Surplus Risk'
            recommendation = (
                f"Active supply ({active_supply:,.0f} KG) exceeds predicted demand ({pred_qty:,.0f} KG) "
                f"by {abs(supply_gap):,.0f} KG. Surplus risk detected: prioritize local household consumer clusters, "
                f"encourage bulk buyer allocations, and suggest optional 5-10% price discount to prevent food waste."
            )
        else:
            market_status = 'Balanced'
            recommendation = (
                f"Supply ({active_supply:,.0f} KG) and predicted demand ({pred_qty:,.0f} KG) are well-balanced. "
                "Maintain current procurement schedule and standard direct-routing."
            )

        return DemandForecastResponse(
            crop=crop.capitalize(),
            location=location.capitalize(),
            predicted_quantity=pred_qty,
            historical_average=hist_avg,
            trend=trend,
            forecast_method='RandomForestRegressor (scikit-learn)',
            data_points_used=len(self.y),
            active_supply=active_supply,
            supply_gap=supply_gap,
            market_status=market_status,
            recommendation=recommendation
        )

# Singleton Forecaster
forecaster = DemandForecaster()
