"""
Consumer Geographic Clustering & Asset-Light Partner Hub Orchestration Module
Uses DBSCAN from scikit-learn on radian coordinates with Haversine distance metric.
Clusters household small orders and recommends nearby partner cross-docking hubs
(FPO collection centers, partner stores, existing cold storages) with zero warehouse ownership.
"""

import numpy as np
from math import radians
from typing import List, Dict, Any, Tuple
from sklearn.cluster import DBSCAN
from .route_engine import haversine_km
from .models import ConsumerCluster, ClusterStop, PartnerHubInfo

# Pre-registered partner hubs (Asset-Light, No FarmDirect ownership)
PARTNER_HUBS = [
    {
        'id': 'hub-1',
        'name': 'Baramati FPO Aggregation Center',
        'hub_type': 'FPO_COLLECTION_CENTER',
        'location': 'Baramati, Maharashtra',
        'latitude': 18.151,
        'longitude': 74.578,
        'capacity_kg': 8000.0,
        'has_cold_storage': True,
        'temperature_range': '2°C - 8°C (Pre-cooling & Cross-Dock)',
        'operational_model': 'FPO Farmer Direct Consolidation'
    },
    {
        'id': 'hub-2',
        'name': 'Hadapsar Cold-Chain Cross-Dock Facility',
        'hub_type': 'COLD_STORAGE_PARTNER',
        'location': 'Hadapsar, Pune',
        'latitude': 18.5089,
        'longitude': 73.9260,
        'capacity_kg': 5000.0,
        'has_cold_storage': True,
        'temperature_range': '2°C - 6°C (Short-Duration Holding)',
        'operational_model': 'Partner Cold Storage Facility'
    },
    {
        'id': 'hub-3',
        'name': 'Kothrud Cooperative Collection Point',
        'hub_type': 'PARTNER_STORE',
        'location': 'Kothrud, Pune',
        'latitude': 18.5074,
        'longitude': 73.8077,
        'capacity_kg': 2500.0,
        'has_cold_storage': False,
        'temperature_range': 'Ventilated Ambient (Same-Day Cross-Dock)',
        'operational_model': 'Partner Retail / Community Center'
    },
    {
        'id': 'hub-4',
        'name': 'Wakad Agri-Drop Partner Center',
        'hub_type': 'PARTNER_STORE',
        'location': 'Wakad, Pune',
        'latitude': 18.5987,
        'longitude': 73.7688,
        'capacity_kg': 3000.0,
        'has_cold_storage': False,
        'temperature_range': 'Ambient (Same-Day Cross-Dock)',
        'operational_model': 'Partner Logistics Depot'
    }
]

def find_nearest_partner_hub(
    center_lat: float,
    center_lng: float,
    requires_cold_storage: bool = False
) -> Dict[str, Any]:
    """
    Finds the optimal asset-light partner hub for a consumer cluster.
    Considers geographic proximity and cold-storage compatibility.
    """
    candidates = PARTNER_HUBS
    if requires_cold_storage:
        cold_candidates = [h for h in candidates if h['has_cold_storage']]
        if cold_candidates:
            candidates = cold_candidates

    best_hub = None
    min_dist = float('inf')

    for hub in candidates:
        dist = haversine_km(center_lat, center_lng, hub['latitude'], hub['longitude'])
        if dist < min_dist:
            min_dist = dist
            best_hub = dict(hub)
            best_hub['distance_km'] = round(dist, 1)

    return best_hub or dict(PARTNER_HUBS[0], distance_km=10.0)

def cluster_consumer_orders(orders: List[Dict[str, Any]]) -> List[ConsumerCluster]:
    """
    Clusters small household orders using DBSCAN.
    orders: [{ id, consumer_name, latitude, longitude, address, total_kg, items }]
    """
    if not orders:
        return []

    if len(orders) < 2:
        # Single order fallback
        single = orders[0]
        hub = find_nearest_partner_hub(single['latitude'], single['longitude'])
        stop = ClusterStop(
            order_id=single['id'],
            consumer_name=single.get('consumer_name', 'Consumer'),
            lat=single['latitude'],
            lng=single['longitude'],
            address=single.get('address', 'Pune'),
            total_kg=float(single.get('total_kg', 2.0))
        )
        return [ConsumerCluster(
            cluster_id="cluster-zone-single",
            zone_name=f"{single.get('address', 'Pune')} Local Zone",
            consumer_count=1,
            order_count=1,
            total_quantity_kg=float(single.get('total_kg', 2.0)),
            center_latitude=single['latitude'],
            center_longitude=single['longitude'],
            recommended_hub_id=hub['id'],
            recommended_hub_name=hub['name'],
            orders=[stop],
            clustering_method='Single-Order Direct Grouping (Insufficient points for DBSCAN)'
        )]

    # Prepare coordinates in radians for DBSCAN with haversine metric
    coords = np.array([[radians(o['latitude']), radians(o['longitude'])] for o in orders])
    
    # 5 km radius = 5 / 6371.0 radians
    kms_per_radian = 6371.0
    epsilon = 5.0 / kms_per_radian
    min_samples = 2

    clustering = DBSCAN(eps=epsilon, min_samples=min_samples, metric='haversine')
    labels = clustering.fit_predict(coords)

    clusters_dict: Dict[int, List[Dict[str, Any]]] = {}
    noise_orders: List[Dict[str, Any]] = []

    for idx, label in enumerate(labels):
        if label == -1:
            noise_orders.append(orders[idx])
        else:
            clusters_dict.setdefault(label, []).append(orders[idx])

    result_clusters: List[ConsumerCluster] = []

    # Process DBSCAN clusters
    for label, cluster_orders in clusters_dict.items():
        avg_lat = float(np.mean([o['latitude'] for o in cluster_orders]))
        avg_lng = float(np.mean([o['longitude'] for o in cluster_orders]))
        total_kg = float(sum(o.get('total_kg', 0.0) for o in cluster_orders))

        # Check if any order has cold-chain requirement
        needs_cold = any(
            any(it.get('storage_type', '').upper() == 'REFRIGERATED' or it.get('perishability_level', '').upper() == 'CRITICAL'
                for it in o.get('items', []))
            for o in cluster_orders
        )

        hub = find_nearest_partner_hub(avg_lat, avg_lng, requires_cold_storage=needs_cold)

        first_address = cluster_orders[0].get('address', 'Pune')
        zone_title = first_address.split(',')[0].strip() if ',' in first_address else first_address

        stops = [
            ClusterStop(
                order_id=o['id'],
                consumer_name=o.get('consumer_name', 'Consumer'),
                lat=o['latitude'],
                lng=o['longitude'],
                address=o.get('address', 'Doorstep'),
                total_kg=float(o.get('total_kg', 0.0))
            )
            for o in cluster_orders
        ]

        result_clusters.append(ConsumerCluster(
            cluster_id=f"cluster-dbscan-{label + 1}",
            zone_name=f"{zone_title} Cluster (DBSCAN)",
            consumer_count=len(cluster_orders),
            order_count=len(cluster_orders),
            total_quantity_kg=round(total_kg, 1),
            center_latitude=round(avg_lat, 4),
            center_longitude=round(avg_lng, 4),
            recommended_hub_id=hub['id'],
            recommended_hub_name=hub['name'],
            orders=stops,
            clustering_method='DBSCAN Density-Based Geographic Clustering (eps=5km)'
        ))

    # Handle noise / isolated orders with safe deterministic grouping fallback
    if noise_orders:
        for idx, n_order in enumerate(noise_orders):
            hub = find_nearest_partner_hub(n_order['latitude'], n_order['longitude'])
            addr = n_order.get('address', 'Pune')
            stop = ClusterStop(
                order_id=n_order['id'],
                consumer_name=n_order.get('consumer_name', 'Consumer'),
                lat=n_order['latitude'],
                lng=n_order['longitude'],
                address=addr,
                total_kg=float(n_order.get('total_kg', 0.0))
            )
            result_clusters.append(ConsumerCluster(
                cluster_id=f"cluster-fallback-{idx + 1}",
                zone_name=f"{addr.split(',')[0]} Peripheral Zone (Deterministic Fallback)",
                consumer_count=1,
                order_count=1,
                total_quantity_kg=float(n_order.get('total_kg', 0.0)),
                center_latitude=n_order['latitude'],
                center_longitude=n_order['longitude'],
                recommended_hub_id=hub['id'],
                recommended_hub_name=hub['name'],
                orders=[stop],
                clustering_method='Safe Deterministic Local Grouping (Isolated from DBSCAN core density)'
            ))

    return result_clusters

def evaluate_economic_dispatch(
    quantity_kg: float,
    distance_km: float,
    price_per_kg: float,
    perishability_level: str = 'MEDIUM'
) -> Dict[str, Any]:
    """
    Evaluates whether sending a direct individual vehicle from a farmer 50km away
    for a 1-2kg household order is economically and ecologically feasible.
    """
    order_value = quantity_kg * price_per_kg
    # Direct individual vehicle trip estimate (two-way or dedicated leg)
    direct_trip_cost = round(distance_km * 16.0, 2)
    is_direct_viable = direct_trip_cost <= (order_value * 0.4) and distance_km <= 15.0

    if not is_direct_viable:
        rec = (
            f"Direct farmer-to-doorstep dispatch is economically unviable (Order value ₹{order_value:,.0f} vs "
            f"direct transit cost ₹{direct_trip_cost:,.0f} for {distance_km:.1f} km). "
            "FarmDirect aggregates this small quantity into a nearby consumer cluster route with short-duration "
            "partner hub cross-docking, reducing delivery cost per household to ₹30."
        )
        fulfillment_mode = 'AGGREGATED_CROSS_DOCK'
    else:
        rec = (
            f"Direct local dispatch viable within {distance_km:.1f} km radius. "
            "Produce can move directly from local grower to buyer."
        )
        fulfillment_mode = 'DIRECT_DISPATCH'

    return {
        'order_value_inr': order_value,
        'direct_trip_cost_inr': direct_trip_cost,
        'is_direct_viable': is_direct_viable,
        'fulfillment_mode': fulfillment_mode,
        'reasoning': rec
    }
