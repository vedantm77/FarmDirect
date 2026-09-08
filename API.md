# FarmDirect REST API Specification

This document provides a concise reference for the primary REST API endpoints exposed by the FarmDirect backend. Interactive Swagger UI is available at `http://127.0.0.1:8000/docs`.

---

## 1. Authentication (`/auth`)

| Method | Endpoint | Access | Description | Request / Query | Response Summary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/auth/login` | Public | Authenticates user; returns JWT token | `{ email, password }` | `{ access_token, token_type, role, user_id, full_name }` |
| `POST` | `/auth/register` | Public | Registers a new user account | `{ email, password, full_name, role, phone, location }` | `UserResponse` |
| `GET` | `/auth/me` | Authenticated | Retrieves profile of authenticated user | Header: `Bearer <token>` | `UserResponse` with reliability rating |

---

## 2. Produce Management (`/produce`)

| Method | Endpoint | Access | Description | Request / Query | Response Summary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/produce` | Public | Lists active produce listings | `?crop=Tomato` | Array of `ProduceListing` |
| `POST` | `/produce` | `FARMER`, `FPO` | Creates new listing with perishability metadata | `{ crop, quantity_kg, asking_price_per_kg, quality_grade, harvest_date, shelf_life_days, storage_type, perishability_level, latitude, longitude }` | Created `ProduceListing` |
| `PUT` | `/produce/{id}` | `FARMER`, `ADMIN` | Updates listing price, quantity, or status | Partial update payload | Updated `ProduceListing` |
| `DELETE` | `/produce/{id}` | `FARMER`, `ADMIN` | Deactivates or removes a listing | Path: `id` | `{ success: true, message }` |

---

## 3. Buyer Demand (`/demands`)

| Method | Endpoint | Access | Description | Request / Query | Response Summary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/demands` | `BUYER` | Submits bulk procurement requirement | `{ crop, quantity_kg, max_price_per_kg, quality_grade_min, delivery_date, delivery_latitude, delivery_longitude, max_distance_km }` | Created `DemandResponse` |
| `GET` | `/farmers/me/demands` | `FARMER`, `FPO` | Lists open buyer demands in farmer's region | Header: `Bearer <token>` | Array of open `DemandResponse` |

---

## 4. AI & Deterministic Matching (`/matching`)

| Method | Endpoint | Access | Description | Request / Query | Response Summary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/matching/run` | Buyer / Public | Runs 6-factor deterministic scoring and multi-farm greedy allocation | `DemandRequest` body | `{ demand_id, matches: [CandidateMatch], allocation: [AllocatedItem], fulfillment_pct, compliance_status }` |

---

## 5. ML Demand Forecasting (`/forecast`)

| Method | Endpoint | Access | Description | Request / Query | Response Summary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/forecast/demand` | Public | Runs `RandomForestRegressor` for regional crop demand | `?crop=Tomato&region=Pune` | `{ crop, region, predicted_weekly_demand_kg, trend_pct, active_supply_gap_kg, recommendation, confidence_score }` |

---

## 6. Freshness & Shelf-Life Intelligence (`/produce/{id}/freshness`)

| Method | Endpoint | Access | Description | Request / Query | Response Summary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/produce/{id}/freshness`| Public | Calculates real-time freshness degradation index | Path: `listing_id` | `{ listing_id, crop, harvest_date, hours_elapsed, shelf_life_hours, freshness_pct, status, storage_recommendation }` |

---

## 7. ML Spoilage Risk & Cold-Chain Decision (`/produce/{id}/spoilage-risk`)

| Method | Endpoint | Access | Description | Request / Query | Response Summary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/produce/{id}/spoilage-risk` | Public / Buyer | Runs `RandomForestClassifier` for transit spoilage risk | `{ transit_hours, ambient_temp_c, is_reefer }` | `{ risk_level, feasibility_status, spoilage_probability_pct, remaining_shelf_life_hours, vehicle_recommendation }` |

---

## 8. Orders & Allocations (`/orders`)

| Method | Endpoint | Access | Description | Request / Query | Response Summary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/orders` | `BUYER` | Creates confirmed order from matched allocation | `{ buyer_id, demand_id, items, logistics_quote_id }` | Confirmed `OrderResponse` |
| `GET` | `/buyers/me/orders` | `BUYER` | Lists current buyer's order history | Header: `Bearer <token>` | Array of `OrderResponse` |
| `POST` | `/orders/{id}/items/{item_id}/cancel` | Parties | Cancels allocation item and triggers auto-rematching | Path: `id`, `item_id` | `{ message, cancelled_item, rematch_found, new_allocation }` |

---

## 9. Bulk Route Optimization (`/logistics/optimize-route`)

| Method | Endpoint | Access | Description | Request / Query | Response Summary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/logistics/optimize-route` | Buyer / Logistics | Runs 2-Opt TSP circuit for multi-farm bulk pickups | `{ depot: { lat, lng }, stops: [{ id, name, lat, lng, cargo_kg }], destination: { lat, lng } }` | `{ route_id, stops: [RouteStopInfo], total_distance_km, baseline_distance_km, distance_saved_km, savings_pct, fuel_savings_inr }` |

---

## 10. Logistics & 3PL Quotes (`/logistics`)

| Method | Endpoint | Access | Description | Request / Query | Response Summary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/logistics/request` | Public / Buyer | Generates vehicle quote options (Mini Truck vs Tempo vs Reefer) | `{ total_weight_kg, total_distance_km, requires_cold_chain }` | Array of `LogisticsQuote` with cost & ETA |
| `POST` | `/logistics/{id}/select` | Public / Buyer | Selects quote and assigns vehicle to order | Path: `quote_id` | `{ success: true, vehicle_assigned }` |

---

## 11. Consumer Orders (`/consumer/orders`)

| Method | Endpoint | Access | Description | Request / Query | Response Summary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/consumer/products` | Public | Catalog of active produce available for household baskets | - | Array of `ConsumerProduct` with farm batch tags |
| `POST` | `/consumer/orders` | `CONSUMER` | Submits small household multi-crop basket order | `{ items: [{ listing_id, crop, quantity_kg, unit_price }], delivery_address, delivery_latitude, delivery_longitude }` | Created `ConsumerOrder` |
| `GET` | `/consumer/orders` | `CONSUMER` | Lists current consumer's placed orders | Header: `Bearer <token>` | Array of `ConsumerOrder` with tracking state |
| `GET` | `/consumer/orders/{id}` | `CONSUMER` | Detailed order summary with farm batch traceability | Path: `order_id` | `ConsumerOrder` with item-level grower details |

---

## 12. DBSCAN Order Clustering (`/consumer/cluster-orders`)

| Method | Endpoint | Access | Description | Request / Query | Response Summary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/consumer/cluster-orders` | Admin / System | Groups pending household orders using DBSCAN ($\epsilon=5\text{ km}$) | `{ eps_km: 5.0, min_orders: 2 }` | Array of `ConsumerCluster` with assigned partner hub & dispatch viability |

---

## 13. Last-Mile Route Optimization (`/consumer/clusters/{id}/last-mile-route`)

| Method | Endpoint | Access | Description | Request / Query | Response Summary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/consumer/clusters/{id}/last-mile-route` | System / Courier | Generates 2-Opt last-mile delivery tour from partner hub | Path: `cluster_id` | `{ cluster_id, hub_name, stops: [DeliveryStop], total_distance_km, distance_saved_km, est_time_mins }` |

---

## 14. Partner Cross-Dock Hubs (`/hubs`)

| Method | Endpoint | Access | Description | Request / Query | Response Summary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/hubs` | Public | Lists all partner FPO and retail cross-dock locations | - | Array of `PartnerHub` with storage regimes and capacity |
| `GET` | `/hubs/recommend` | Public | Finds nearest partner hub for a delivery coordinate | `?lat=18.50&lng=73.81` | Nearest `PartnerHub` and distance (km) |

---

## 15. Food Waste Prevention Alerts (`/waste-prevention/alerts`)

| Method | Endpoint | Access | Description | Request / Query | Response Summary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/waste-prevention/alerts` | `FARMER`, `ADMIN` | Identifies listings with < 48h shelf-life or high surplus inventory | - | Array of `SurplusAlert` with suggested discount / FPO cross-dock priority |

---

## 16. Tracking & Milestones (`/tracking`)

| Method | Endpoint | Access | Description | Request / Query | Response Summary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/tracking/{order_id}` | Public | Retrieves current 8-stage delivery milestone and route | Path: `order_id` | `{ order_id, current_stage, progress_pct, stops, driver_info }` |
| `POST` | `/tracking/{order_id}/next` | Public / Demo | Advances tracking milestone to next state for presentation | Path: `order_id` | Updated tracking state |

---

## 17. Ratings & Producer Feedback (`/ratings`)

| Method | Endpoint | Access | Description | Request / Query | Response Summary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/ratings` | `BUYER`, `CONSUMER` | Submits 1–5 star rating; dynamically updates farmer reliability | `{ order_id, farmer_id, rating, review_text }` | `{ success: true, new_farmer_reliability_pct }` |
