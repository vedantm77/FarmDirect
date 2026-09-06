# FarmDirect — SIH 2026 demo system

**Direct from Farm. Smarter Matching. Better Prices.** FarmDirect is a marketplace and orchestration platform linking eligible farmers/FPOs to households and bulk buyers. It never purchases, owns, warehouses, or resells produce, and it orchestrates delivery through third-party logistics providers.

## What changed from the original prototype

The original high-fidelity standalone browser prototype remains in `outputs/index.html`. It has been preserved as a no-install fallback. This upgrade adds a GitHub-friendly modular-monolith structure with a typed Next.js frontend, FastAPI backend, API/service boundary, deterministic seed data, business-logic tests, Docker configuration, and explicit offline/demo fallbacks.

```
FarmDirect/
├── frontend/                  # Next.js + TypeScript user experience
│   ├── app/                   # responsive SIH demo marketplace
│   └── lib/                   # types + ApiService/DemoService fallback boundary
├── backend/
│   ├── app/models.py          # Pydantic API contracts
│   ├── app/services.py        # matching, allocation, compliance, forecast, logistics
│   ├── app/seed.py            # fictional Pune/Maharashtra demo listings
│   └── tests/                 # core business-logic tests
├── docker-compose.yml
└── outputs/index.html         # preserved original interactive prototype
```

## Core capabilities

- **Matching:** configurable, transparent 30% distance / 20% price / 15% quantity / 15% quality / 10% readiness / 10% reliability scoring.
- **Bulk splitting:** ranked eligible supply is allocated across several farms if one listing cannot fulfil requested quantity.
- **Forecasting:** deterministic synthetic prototype forecast, explicitly labeled as demo data.
- **Compliance:** configurable-rule assessment with Passed/Review/Blocked-style result contracts; it is not legal advice.
- **Logistics:** 3PL quote abstraction with mock Mini Truck and Tempo partners, not owned FarmDirect vehicles.
- **Offline resilience:** frontend uses API data when available and returns clearly labeled seeded demo results when it is not.

## Run locally

### Docker (recommended)

```bash
docker compose up --build
```

Open `http://localhost:3000`; interactive OpenAPI documentation is at `http://localhost:8000/docs`.

### Without Docker

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

Copy `.env.example` files before production use. Never use the demo database password or JWT secret in a deployed environment.

## Demo accounts

The `POST /auth/login` demo endpoint advertises: `buyer@farmdirect.demo`, `farmer@farmdirect.demo`, and `admin@farmdirect.demo`. They are fictional demo identities; authentication is deliberately non-production in this seeded prototype.

## Test

```bash
cd backend
pytest
```

Tests cover transparent match ranking, multi-farm bulk allocation, compliance result semantics, and forecast labeling.

## Phase 4 judge journey

1. Sign in as `buyer@farmdirect.demo` and open `/buyer/dashboard`.
2. Run the 1,000 kg tomato demand: the deterministic allocation is 420 kg + 330 kg + 250 kg.
3. Continue through the configured compliance assessment, direct-order review, simulated 3PL quote selection, tracking, and feedback.
4. Sign in as `farmer@farmdirect.demo` and open `/farmer/dashboard` to view listings, the relevant demand, allocation, pickup context, and accept the match.

The map-like panels are schematic demo route visualizations; map-provider and tracking integrations remain simulated. Run migrations with `alembic upgrade head` from `backend/` after dependencies are installed.

## Current limitations / next integrations

PostGIS schema migrations, secure persistent JWT issuance, real document verification, Leaflet maps, production ML training, OR-Tools vehicle routing, and live 3PL/government integrations remain provider interfaces for the next build stage. They are intentionally not claimed as live capabilities. The current FastAPI contracts are designed so these additions do not require frontend workflow rewrites.
