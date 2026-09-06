# FarmDirect prototype

A self-contained, responsive SIH frontend prototype for a direct farm-to-buyer marketplace. Open `index.html` in a browser—no build or server is required.

## Demo journey

1. Open the landing page and choose **Explore Marketplace**.
2. Place a demand, advance through the four steps, and select **Find Best Matches**.
3. Open the top match, run the configured compliance check, and confirm the order.
4. Track the assigned 3PL delivery and click timeline steps to simulate delivery progress.
5. Switch to the Farmer workspace through the sidebar to list produce and inspect demand intelligence.

## Architecture / future API boundary

The UI is deliberately mock-driven: the deterministic farmer data, matching scoring, compliance result, 3PL assignment, forecast values, and client session state are all defined in the embedded service simulation. In production, these functions map cleanly to FastAPI endpoints backed by PostgreSQL/PostGIS; matching may use scikit-learn/XGBoost and OR-Tools powers logistics optimization.

The prototype clearly labels forecasts and compliance results as demo/configured rule assessments. FarmDirect remains a platform and logistics-orchestration layer: it does not own inventory, warehousing, trucks, or produce.

## Key UI areas

- Buyer dashboard, multi-step demand form, sortable AI-ranked matches, score explanation, compliance, order confirmation, delivery tracking and feedback
- Farmer dashboard, live produce-listing action and demand insights
- Shared analytics dashboard, responsive desktop sidebar and mobile bottom navigation
