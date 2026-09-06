# FarmDirect full-stack upgrade notes

The original client-only prototype remains available as `index.html`. The repository root now contains the implementation-oriented upgrade:

- `frontend/`: Next.js + TypeScript UI with typed service boundary and seeded offline fallback.
- `backend/app/`: FastAPI routes and Pydantic contracts.
- `backend/app/services.py`: weighted transparent matching, multi-farm bulk allocation, configured compliance assessment, forecast, and demo 3PL quotes.
- `backend/db/schema.sql`: PostgreSQL/PostGIS target schema.
- `backend/tests/`: core business-logic tests.
- `docker-compose.yml`: frontend, backend and PostGIS stack.

Run `docker compose up --build` from the repository root after installing Docker. API documentation is then at `http://localhost:8000/docs` and the Next.js app at `http://localhost:3000`.

All forecast, compliance, logistics and tracking claims are explicitly marked as prototype/demo until real providers and production datasets are connected.
