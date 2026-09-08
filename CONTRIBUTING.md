# Contributing to FarmDirect

Thank you for your interest in contributing to FarmDirect! Follow these guidelines to maintain code quality and testing rigor across the platform.

---

## 🌿 Branch & Pull Request Workflow

1. **Fork & Branch:** Create a feature or fix branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. **Adhere to Code Standards:**
   - **Backend:** Python 3.11+, typed Pydantic v2 schemas, PEP 8 styling.
   - **Frontend:** Next.js 15 App Router, TypeScript strict mode, Vanilla CSS tokens.
   - **Zero Fake Implementations:** Any new algorithmic or ML feature must include verifiable logic or trained models.
3. **Run Tests Locally Before Pushing:**
   ```powershell
   # Backend verification
   cd backend
   pytest -v

   # Frontend verification & production build
   cd ../frontend
   npm test
   npm run build
   ```
4. **Submit PR:** Open a Pull Request targeting `main` with a concise summary of changes and test evidence.

---

## 📝 Commit Guidelines

Use conventional, descriptive commit messages:
- `feat: add perishable shelf-life calculation to produce entity`
- `fix: resolve division by zero in Haversine distance matrix`
- `test: add e2e test for DBSCAN household cluster dispatch`
- `docs: update API endpoints and sequence diagrams`

---

## 🧪 Testing Checklist

Ensure all automated tests pass before submitting a PR:
- [ ] `backend/tests/test_enhanced_features.py` passes (ML models, 2-Opt TSP, DBSCAN).
- [ ] `backend/tests/test_live_e2e_workflow.py` passes (E2E workflows).
- [ ] `frontend/tests/demo-flow.test.ts` passes.
- [ ] Next.js production build (`npm run build`) completes without TypeScript or lint errors.
