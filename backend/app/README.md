# Backend contract

Run with `uvicorn app.main:app --reload`. The API serves OpenAPI at `/docs`.

`services.py` is the modular-monolith domain layer. API routes intentionally call it rather than duplicating scoring or allocation calculations. The production persistence target is the PostGIS schema in `db/schema.sql`; the demonstration currently uses the explicitly fictional seed objects in `seed.py`.

`POST /matching/run` accepts a `DemandRequest`, filters for crop, price, readiness and radius, computes weighted transparent scores, and creates a greedy ranked bulk allocation. Production allocation can replace that last strategy with OR-Tools while preserving the response model.
