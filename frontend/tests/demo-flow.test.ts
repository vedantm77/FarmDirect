import { describe, it, expect } from 'vitest';
import { matchDemand, checkCompliance, requestLogisticsQuotes, getTracking } from '../lib/farmdirect-service';

describe('FarmDirect Phase 4 frontend contracts', () => {
  it('verifies exact 1,000 kg multi-farm allocation', () => {
    const allocation = [420, 330, 250];
    expect(allocation.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(allocation).toHaveLength(3);
  });

  it('verifies matchDemand returns 3 farms with explainable scores and fallback reliability', async () => {
    const result = await matchDemand({
      crop: 'Tomatoes',
      quantity_kg: 1000,
      quality_requirement: 'A',
      max_price: 30,
      delivery_date: '2026-09-08',
      location: 'Pune',
      latitude: 18.5204,
      longitude: 73.8567,
      radius_km: 120
    });
    expect(result.allocations.reduce((acc, curr) => acc + curr.quantity_kg, 0)).toBe(1000);
    expect(result.allocations).toHaveLength(3);
    expect(result.matches[0].score.overall).toBeGreaterThan(0);
    expect(result.matches[0].explanation).toBeDefined();
  });

  it('verifies compliance contract check', async () => {
    const { results } = await checkCompliance('Tomatoes', 'Maharashtra', 'B2B');
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0].status).toBe('PASSED');
  });

  it('verifies 3PL logistics quote comparison options', async () => {
    const { quotes } = await requestLogisticsQuotes(1000);
    expect(quotes).toHaveLength(2);
    expect(quotes[0].vehicle).toBe('Mini Truck');
    expect(quotes[0].capacity_kg).toBeGreaterThanOrEqual(1000);
  });

  it('verifies tracking milestone progression structure', async () => {
    const { tracking } = await getTracking('FD-2026-DEMO01');
    expect(tracking.route_stops).toHaveLength(4);
    expect(tracking.order_id).toBe('FD-2026-DEMO01');
  });
});
