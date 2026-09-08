# FarmDirect System Architecture

This document details the architectural design, algorithmic components, and data flows of the FarmDirect agricultural supply chain platform.

---

## 🏛️ High-Level System Architecture

FarmDirect is architected as a modular decoupled system consisting of a Next.js 15 frontend, a FastAPI Python service tier, and a persistent relational database tier.

```mermaid
graph TD
    subgraph ClientTier["Client Tier (Next.js 15 + TypeScript)"]
        FW["Farmer Workspace (/farmer/dashboard)"]
        BB["Bulk Buyer Portal (/buyer/dashboard)"]
        CP["Consumer Portal (/consumer/dashboard)"]
        RM["Interactive Leaflet RouteMap Component"]
        SB["Typed Service Boundary (farmdirect-service.ts)"]
        FW --> SB
        BB --> SB
        CP --> SB
        RM --> SB
    end

    subgraph ServiceTier["API & Service Tier (FastAPI + Python 3.11)"]
        API["FastAPI Main Router & Role Guards (app/main.py)"]
        ME["Matching & Greedy Allocation Engine (app/services.py)"]
        RE["2-Opt TSP Route Engine (app/route_engine.py)"]
        MD["RandomForest Demand ML (app/ml_demand.py)"]
        MS["RandomForest Spoilage ML (app/ml_spoilage.py)"]
        CL["DBSCAN Order Clustering (app/clustering.py)"]
        
        API --> ME
        API --> RE
        API --> MD
        API --> MS
        API --> CL
    end

    subgraph DataTier["Data Tier"]
        DB[(SQLite / PostgreSQL 16)]
        ENT["SQLAlchemy 2.0 ORM Entities"]
        ENT --> DB
    end

    SB -->|JSON REST / JWT Bearer| API
    ME --> ENT
    RE --> ENT
    MD --> ENT
    MS --> ENT
    CL --> ENT
```

---

## 🏢 The Asset-Light "No-Warehouse" Model

FarmDirect fundamentally differs from traditional agricultural aggregators:

- **Zero Owned Warehouses:** FarmDirect does not purchase, lease, or operate central storage facilities.
- **Zero Inventory Risk:** Produce ownership remains with the farmer until physical delivery inspection by the buyer or consumer.
- **Zero Owned Fleet:** All transportation is contracted through existing commercial 3PL carriers (mini-trucks, tempos) or local courier delivery networks.
- **Short-Duration Partner Cross-Docking:** For small household deliveries, FarmDirect utilizes existing partner infrastructure (FPO aggregation centers and local cooperative grocery stores) for temporary staging (< 4–8 hours).

```
[Farmer Gate] ──(Consolidated 3PL Inbound)──> [Partner Hub: Max 4-8 hr Staging] ──(Last-Mile Courier)──> [Consumer Doorstep]
```

---

## 🧠 Machine Learning & Algorithmic Engines

FarmDirect integrates specialized algorithms and machine learning models tailored to agricultural supply chain challenges:

| Module | Algorithm / Model | Library | Purpose | Features / Hyperparameters |
| :--- | :--- | :--- | :--- | :--- |
| **Demand Forecasting** | `RandomForestRegressor` | `scikit-learn` | Predicts regional weekly crop demand and active supply gaps | `n_estimators=100`, `max_depth=8`, weather, rainfall, historical arrivals, prices |
| **Spoilage Risk Prediction** | `RandomForestClassifier` | `scikit-learn` | Classifies transit spoilage risk (`LOW` to `CRITICAL`) and evaluates reefer necessity | `n_estimators=100`, transit hours, temperature, humidity, perishability index |
| **Household Clustering** | `DBSCAN` | `scikit-learn` | Groups scattered household orders into dense delivery clusters | Haversine distance, $\epsilon = 5\text{ km}$, $\text{min\_samples} = 2$ |
| **Route Optimization** | Nearest Neighbor + 2-Opt TSP | Native Python & NumPy | Optimizes multi-farm pickup circuits and last-mile doorstep tours | Pairwise Haversine distance matrix, 2-Opt edge swapping, urgency weights |
| **Multi-Attribute Matching** | Deterministic Weighted Scoring | Native Python | Ranks farm candidates across 6 commercial and operational factors | Distance (30%), Price (20%), Quantity (15%), Quality (15%), Readiness (10%), Reliability (10%) |

---

## 🔄 Core Supply Chain Flows

### 1. Bulk Procurement Circuit (2-Opt TSP Multi-Farm Pickup)
For bulk buyer orders (e.g., 1,000 kg), supply is often distributed across multiple smallholder farmers:

```mermaid
sequenceDiagram
    autonumber
    actor Buyer as Bulk Buyer
    participant Engine as Matching & 2-Opt Engine
    participant ML as Spoilage Risk Model
    actor Farmers as Nearby Farmers (Khed, Baramati, Junnar)
    participant Fleet as 3PL Carrier

    Buyer->>Engine: Post Demand (1,000 kg Tomatoes)
    Engine->>Engine: Multi-Attribute Matching & Greedy Allocation
    Engine->>ML: Evaluate Transit Spoilage Risk
    ML-->>Engine: Risk: LOW (Standard Ambient Feasible)
    Engine->>Engine: Run 2-Opt TSP Route Optimizer
    Engine-->>Buyer: Tour: Depot -> Farm A -> Farm B -> Farm C -> Buyer Hub
    Buyer->>Fleet: Book 3PL Vehicle with Optimized Route
    Fleet->>Farmers: Sequential Multi-Farm Pickups
    Fleet->>Buyer: Direct-to-Facility Unloading
```

---

### 2. Household Delivery & Partner Cross-Docking Flow
For direct-to-consumer micro-orders (1–10 kg):

```mermaid
sequenceDiagram
    autonumber
    actor Consumers as Urban Households
    participant Platform as FarmDirect Engine
    participant DBSCAN as DBSCAN Clustering
    participant Hub as Partner Hub (< 4-8 hr)
    participant Courier as Last-Mile Courier

    Consumers->>Platform: Place Small Basket Orders (Strawberries, Spinach, Tomatoes)
    Platform->>DBSCAN: Run Spatial Clustering (eps=5km)
    DBSCAN-->>Platform: Cluster Formed (3 orders, 26 kg total)
    Platform->>Platform: Economic Dispatch Check (>= 20 kg satisfied)
    Platform->>Hub: Stage Inbound Morning Batch at Nearest Partner Facility
    Platform->>Courier: Run 2-Opt Last-Mile Tour from Hub
    Courier->>Consumers: Deliver Door-to-Door with Batch Traceability Tags
```

---

## 🔐 Authentication & Session Security

- **Tokens:** JSON Web Tokens (JWT) signed using `HS256` with 8-hour expiration.
- **Password Security:** Passwords hashed using `bcrypt` (12 rounds) via `passlib`.
- **Authorization:** FastAPI dependency injection guards (`role_guard`) enforce strict role permissions across endpoints (`FARMER`, `FPO`, `BUYER`, `CONSUMER`, `ADMIN`, `LOGISTICS_PARTNER`).
- **Resilient Fallback:** Frontend typed client maintains session storage and fallback mock states for presentation reliability.

---

## 🗄️ Database Architecture

- **Active Engine (Development & Demo):** Persistent SQLite database (`farmdirect-demo.db`) with automatic table creation and realistic regional seeder on startup.
- **Coordinates & Spatial Math:** Latitude and longitude stored as scalar `Float` attributes; spatial calculations executed via spherical Haversine algorithms in Python math and NumPy.
- **Enterprise Target:** PostgreSQL 16 + PostGIS configured in `docker-compose.yml` and `backend/db/schema.sql` for native spatial queries (`ST_DWithin`, `ST_ClusterKMeans`).
