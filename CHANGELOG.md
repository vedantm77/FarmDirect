# Changelog

All notable changes to the FarmDirect platform are documented in this file.

---

## [2.0.0] - 2026-09-08

### 🌾 Platform Enhancement Release (SIH 2026 - Problem Statement 26033)

This release significantly enhances FarmDirect from a B2B direct-procurement platform into an intelligent, multi-tier agricultural supply chain and direct-to-consumer market orchestration engine, strictly preserving the asset-light **no-warehouse** architecture.

#### Added & Enhanced Capabilities:
- **Baseline Platform Foundation:** Preserved and validated core farmer listings, bulk buyer demand creation, 6-factor deterministic matching, greedy multi-farm allocation, Maharashtra direct-sale compliance validation, and Leaflet map tracking.
- **AI Demand Forecasting:** Integrated `RandomForestRegressor` (`ml_demand.py`) trained on regional Maharashtra agricultural datasets to predict weekly crop demand, growth trend percentage, and active market supply gaps.
- **Perishable Intelligence & Freshness Index:** Added harvest date tracking, declared shelf-life, storage conditions (`AMBIENT` vs. `COLD_STORAGE`), perishability levels, and automated dynamic Freshness Index computation.
- **ML Spoilage Risk Prediction:** Integrated `RandomForestClassifier` (`ml_spoilage.py`) evaluating transit duration, temperature, and crop perishability to classify spoilage risk (`LOW` to `CRITICAL`), remaining shelf-life, and cold-chain reefer recommendations.
- **Bulk Route Optimization (2-Opt TSP):** Built a multi-stop route optimization engine (`route_engine.py`) using Haversine distance matrices and 2-Opt local search to construct optimal farm pickup circuits with quantified fuel and distance savings.
- **Household Consumer Support:** Added dedicated consumer portal (`/consumer/dashboard`) and role (`CONSUMER`) enabling small-quantity multi-crop basket ordering with economic dispatch transparency.
- **DBSCAN Geographic Clustering:** Implemented spatial order clustering (`clustering.py`) with Scikit-learn `DBSCAN` ($\epsilon = 5.0\text{ km}$) to aggregate dispersed household orders for collective fulfillment.
- **Asset-Light Partner Cross-Docking:** Designed data models and workflows utilizing existing partner grocery stores and FPO collection centers for rapid transient staging (< 4–8 hours) with zero owned warehouses.
- **Last-Mile Route Optimization:** Generates optimal two-wheeler/EV delivery tours from partner cross-dock hubs across clustered consumer households.
- **Food-Waste & Surplus Prevention:** Added proactive alert engine (`/waste-prevention/alerts`) identifying aging batches (< 48 hours shelf-life) and recommending flash discounts, FPO cross-dock priority, or processing redirection.
- **Farm Batch Traceability:** Embedded origin farmer name, harvest timestamp, quality grade, and real-time freshness index on consumer products and cart summaries.
- **Automatic Rematching:** Added item-level allocation cancellation with automatic inventory restoration and seamless rematching from backup candidate listings.
- **Automated Verification:** Added 34 passing Pytest backend tests and 9 passing Vitest frontend tests validating the entire pipeline.
