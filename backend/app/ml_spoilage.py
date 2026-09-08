"""
Real Machine Learning Spoilage Risk & Perishable Intelligence Module
Uses RandomForestClassifier from scikit-learn.
Transparently trained on synthetic demonstration data calibrated for
agricultural post-harvest transport, shelf-life degradation, and cold-chain factors.
"""

import numpy as np
from datetime import datetime, date
from sklearn.ensemble import RandomForestClassifier
from .models import FreshnessInfo, SpoilageRiskResponse, PERISHABILITY_PRESETS

PERISHABILITY_NUMERIC = {
    'LOW': 1,
    'MEDIUM': 2,
    'HIGH': 3,
    'CRITICAL': 4
}

STORAGE_TYPE_NUMERIC = {
    'AMBIENT': 0,
    'VENTILATED': 1,
    'REFRIGERATED': 2,
    'FROZEN': 3
}

VEHICLE_NUMERIC = {
    'Bike': 0,
    'EV Bike': 1,
    'Small Van': 2,
    'Mini Truck': 3,
    'Refrigerated Van': 4,
    'Refrigerated Truck': 5
}

def calculate_freshness(harvest_date_str: str, shelf_life_days: int) -> FreshnessInfo:
    """
    Computes real freshness percentage and remaining shelf life based on harvest date.
    Formula:
      product_age_days = (today - harvest_date).days
      remaining_shelf_life_days = max(0, shelf_life_days - product_age_days)
      freshness_percentage = remaining / total * 100
    """
    try:
        h_date = date.fromisoformat(harvest_date_str) if harvest_date_str else date.today()
    except Exception:
        h_date = date.today()

    today = date.today()
    age_days = max(0, (today - h_date).days)
    total_days = max(1, shelf_life_days)
    remaining_days = max(0.0, float(total_days - age_days))
    freshness_pct = round((remaining_days / total_days) * 100.0, 1)

    if freshness_pct >= 80:
        urgency = 'FRESH'
    elif freshness_pct >= 50:
        urgency = 'MODERATE'
    elif freshness_pct >= 20:
        urgency = 'URGENT'
    else:
        urgency = 'CRITICAL'

    return FreshnessInfo(
        product_age_days=float(age_days),
        remaining_shelf_life_days=remaining_days,
        freshness_percentage=freshness_pct,
        urgency_level=urgency
    )

def generate_spoilage_training_data():
    """
    Generates 350+ training samples covering diverse transport durations,
    temperature exposures, vehicle types, and remaining shelf life scenarios.
    """
    np.random.seed(101)
    X_rows = []
    y_labels = []

    for _ in range(350):
        perishability = np.random.choice([1, 2, 3, 4], p=[0.25, 0.35, 0.25, 0.15])
        storage_type = np.random.choice([0, 1, 2], p=[0.35, 0.40, 0.25])
        age_hours = float(np.random.uniform(4, 120))
        remaining_life_hours = max(2.0, float(np.random.uniform(6, 240) - age_hours))
        ambient_temp = float(np.random.uniform(22, 38))
        transit_hours = float(np.random.uniform(0.5, 12.0))
        handling_hours = float(np.random.uniform(0.5, 4.0))
        is_cold_chain = 1 if (storage_type == 2 and np.random.rand() > 0.4) else 0
        num_stops = int(np.random.randint(1, 6))
        distance_km = float(transit_hours * np.random.uniform(25, 45))

        total_journey = transit_hours + handling_hours

        # Ground truth deterministic logic for training data labeling
        if total_journey >= remaining_life_hours:
            label = 'CRITICAL'
        elif perishability == 4 and not is_cold_chain and total_journey > 2.5:
            label = 'CRITICAL' if ambient_temp > 30 else 'HIGH'
        elif perishability >= 3 and not is_cold_chain and total_journey > 4.0:
            label = 'HIGH'
        elif total_journey > (0.6 * remaining_life_hours):
            label = 'HIGH'
        elif perishability >= 2 and total_journey > 5.0 and not is_cold_chain:
            label = 'MEDIUM'
        elif total_journey > (0.3 * remaining_life_hours):
            label = 'MEDIUM'
        else:
            label = 'LOW'

        X_rows.append([
            perishability, storage_type, age_hours, remaining_life_hours,
            ambient_temp, transit_hours, handling_hours, is_cold_chain,
            num_stops, distance_km
        ])
        y_labels.append(label)

    return np.array(X_rows, dtype=np.float64), np.array(y_labels)

class SpoilageRiskModel:
    def __init__(self):
        self.model = RandomForestClassifier(
            n_estimators=50,
            max_depth=7,
            random_state=42
        )
        self.X, self.y = generate_spoilage_training_data()
        self._train()

    def _train(self):
        self.model.fit(self.X, self.y)

    def predict(
        self,
        crop: str,
        quantity_kg: float = 100.0,
        price_per_kg: float = 28.0,
        harvest_date_str: str = '',
        shelf_life_days: int = 7,
        storage_type: str = 'VENTILATED',
        perishability_level: str = 'MEDIUM',
        distance_km: float = 30.0,
        transit_hours: float = 1.5,
        handling_hours: float = 0.5,
        is_cold_chain: bool = False,
        num_stops: int = 2
    ) -> SpoilageRiskResponse:
        p_num = PERISHABILITY_NUMERIC.get(perishability_level.upper(), 2)
        s_num = STORAGE_TYPE_NUMERIC.get(storage_type.upper(), 1)

        # Freshness calculation
        freshness = calculate_freshness(harvest_date_str, shelf_life_days)
        age_hours = freshness.product_age_days * 24.0
        remaining_hours = freshness.remaining_shelf_life_days * 24.0
        ambient_temp = 30.0 # Baseline daytime ambient in Maharashtra

        features = np.array([[
            p_num, s_num, age_hours, remaining_hours,
            ambient_temp, transit_hours, handling_hours,
            1 if is_cold_chain else 0, num_stops, distance_km
        ]], dtype=np.float64)

        probs = self.model.predict_proba(features)[0]
        class_idx = int(np.argmax(probs))
        predicted_class = str(self.model.classes_[class_idx])
        confidence_pct = round(float(probs[class_idx]) * 100.0, 1)

        total_delivery_time = transit_hours + handling_hours

        # Delivery Feasibility
        if total_delivery_time >= remaining_hours:
            feasibility = 'UNSAFE'
        elif total_delivery_time > (0.65 * remaining_hours) or predicted_class == 'CRITICAL':
            feasibility = 'HIGH_RISK'
        elif predicted_class == 'HIGH' or total_delivery_time > (0.4 * remaining_hours):
            feasibility = 'WARNING'
        else:
            feasibility = 'SAFE'

        # Vehicle recommendation
        cold_chain_required = (
            storage_type.upper() in ['REFRIGERATED', 'FROZEN'] or
            perishability_level.upper() == 'CRITICAL' or
            (perishability_level.upper() == 'HIGH' and total_delivery_time > 2.0)
        )

        if cold_chain_required:
            recommended_vehicle = 'Refrigerated Van' if quantity_kg <= 1000 else 'Refrigerated Truck'
        else:
            if quantity_kg <= 50:
                recommended_vehicle = 'EV Bike'
            elif quantity_kg <= 300:
                recommended_vehicle = 'Small Van'
            elif quantity_kg <= 1500:
                recommended_vehicle = 'Mini Truck'
            else:
                recommended_vehicle = 'Standard Freight Truck'

        expected_value = round(quantity_kg * price_per_kg, 2)

        # Actionable recommendation
        if feasibility == 'UNSAFE':
            rec = (
                f"UNSAFE DELIVERY: Remaining shelf life ({remaining_hours:.1f} hrs) is less than "
                f"total transit & handling time ({total_delivery_time:.1f} hrs). "
                "Recommend rerouting to nearest partner collection hub, urgent local consumer cluster, or faster direct dispatch."
            )
        elif cold_chain_required and not is_cold_chain:
            rec = (
                f"Cold-chain required for {crop} ({storage_type} storage, {perishability_level} perishability). "
                f"Using {recommended_vehicle} prevents estimated ₹{expected_value:,.0f} spoilage loss."
            )
        elif predicted_class in ['HIGH', 'CRITICAL']:
            rec = (
                f"Elevated spoilage risk ({confidence_pct}% {predicted_class}). "
                "Minimize cross-dock handling duration and prioritize direct multi-stop delivery."
            )
        else:
            rec = (
                f"Feasibility is {feasibility}. Standard ventilated dispatch via {recommended_vehicle} "
                f"maintains {freshness.freshness_percentage}% freshness safely within destination window."
            )

        return SpoilageRiskResponse(
            crop=crop.capitalize(),
            risk_level=predicted_class,
            risk_score_percent=confidence_pct,
            feasibility_status=feasibility,
            estimated_transit_hours=round(total_delivery_time, 2),
            remaining_shelf_life_hours=round(remaining_hours, 1),
            recommended_vehicle=recommended_vehicle,
            requires_cold_chain=cold_chain_required,
            expected_produce_value=expected_value,
            recommendation=rec,
            method='RandomForestClassifier (scikit-learn)'
        )

spoilage_model = SpoilageRiskModel()
