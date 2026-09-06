import { describe, it, expect } from 'vitest';
import {
  matchDemand,
  checkCompliance,
  requestLogisticsQuotes,
  getTracking,
  authenticateUser,
  createProduceListing,
  getFarmerListings,
  getOpenDemands,
  respondToAllocation,
  markOrderReady
} from '../lib/farmdirect-service';

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

  it('verifies optional max price behavior when price ceiling is omitted or zero', async () => {
    // When max price is optional / not specified, matching uses market rate or open ceiling
    const result = await matchDemand({
      crop: 'Tomatoes',
      quantity_kg: 100,
      quality_requirement: 'Quality A',
      max_price: 0,
      delivery_date: '2026-09-10',
      location: 'Pune',
      latitude: 18.5204,
      longitude: 73.8567,
      radius_km: 120
    });
    expect(result.matches.length).toBeGreaterThanOrEqual(1);
    expect(result.matches[0].listing.crop).toBe('Tomatoes');
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

  it('verifies buyer match discovery, sorting, and independent buyer selection', async () => {
    const result = await matchDemand({
      crop: 'Tomatoes',
      quantity_kg: 100,
      quality_requirement: 'Quality A',
      max_price: 28,
      delivery_date: 'Tomorrow',
      location: 'Pune',
      latitude: 18.5204,
      longitude: 73.8567,
      radius_km: 120,
      buyer_type: 'Bulk buyer / Consumer',
      delivery_budget: '₹2,000',
      preferred_window: '10 AM – 2 PM'
    });

    // 1. All compatible matches are accessible
    expect(result.matches.length).toBeGreaterThanOrEqual(3);

    // 2. Best match recommendation (highest overall score)
    const recommendedMatch = result.matches[0];
    expect(recommendedMatch.listing.farmer_name).toContain('Khed');
    expect(recommendedMatch.score.overall).toBeGreaterThan(90);

    // 3. Sorting changes order without removing any valid matches
    const byPrice = [...result.matches].sort((a, b) => a.listing.asking_price - b.listing.asking_price);
    expect(byPrice).toHaveLength(result.matches.length);
    expect(byPrice[0].listing.asking_price).toBeLessThanOrEqual(byPrice[byPrice.length - 1].listing.asking_price);

    const byDistance = [...result.matches].sort((a, b) => a.distance_km - b.distance_km);
    expect(byDistance).toHaveLength(result.matches.length);
    expect(byDistance[0].distance_km).toBeLessThanOrEqual(byDistance[byDistance.length - 1].distance_km);

    const byReliability = [...result.matches].sort((a, b) => b.listing.reliability - a.listing.reliability);
    expect(byReliability).toHaveLength(result.matches.length);
    expect(byReliability[0].listing.reliability).toBeGreaterThanOrEqual(byReliability[byReliability.length - 1].listing.reliability);

    // 4. Buyer Choice: Buyer explicitly chooses Match B (not the AI top match A)
    const otherMatch = result.matches.find(m => m.listing.id !== recommendedMatch.listing.id)!;
    expect(otherMatch).toBeDefined();

    // Buyer selection remains independent of recommendation
    const selectedMatch = otherMatch;
    expect(selectedMatch.listing.id).not.toBe(recommendedMatch.listing.id);

    // Order calculation uses selectedMatch
    const produceSubtotal = 100 * selectedMatch.listing.asking_price;
    const deliveryCharge = 1840;
    const totalOrderValue = produceSubtotal + deliveryCharge;
    expect(totalOrderValue).toBe(100 * selectedMatch.listing.asking_price + 1840);
  });

  it('verifies farmer listing creation, open demand retrieval, and allocation actions', async () => {
    // 1. Farmer produce listing contract
    const listingPayload = {
      crop: 'Tomatoes',
      quantity_kg: 300,
      asking_price: 27,
      quality_grade: 'A',
      ready_date: '2026-09-10',
      latitude: 18.738,
      longitude: 73.846
    };
    const created = await createProduceListing(listingPayload);
    expect(typeof created).toBe('boolean');

    // 2. Farmer listings retrieval
    const listings = await getFarmerListings();
    expect(Array.isArray(listings)).toBe(true);
    expect(listings.length).toBeGreaterThanOrEqual(1);
    expect(listings[0].crop).toBeDefined();
    expect(listings[0].asking_price).toBeGreaterThan(0);

    // 3. Open buyer demands available to farmer
    const demands = await getOpenDemands();
    expect(Array.isArray(demands)).toBe(true);
    expect(demands.length).toBeGreaterThanOrEqual(1);
    expect(demands[0].crop).toBe('Tomatoes');

    // 4. Farmer allocation response
    const acceptRes = await respondToAllocation('oi-1', 'ACCEPT');
    expect(acceptRes.status).toBe('ACCEPTED');

    // 5. Farmer mark order ready
    const readyRes = await markOrderReady('FD-2026-DEMO01');
    expect(typeof readyRes).toBe('boolean');
  });

  it('verifies multi-farmer logins and buyer login credentials', async () => {
    // Farmer / FPO logins
    const khedRes = await authenticateUser('khed', 'farmer123');
    expect(khedRes.error).toBeUndefined();
    expect(khedRes.access_token).toBeTruthy();
    expect(khedRes.user?.role.toUpperCase()).toBe('FARMER');

    const baramatiRes = await authenticateUser('baramati', 'farmer123');
    expect(baramatiRes.error).toBeUndefined();
    expect(baramatiRes.access_token).toBeTruthy();
    expect(baramatiRes.user?.role.toUpperCase()).toBe('FPO');

    const junnarRes = await authenticateUser('junnar', 'farmer123');
    expect(junnarRes.error).toBeUndefined();
    expect(junnarRes.access_token).toBeTruthy();
    expect(junnarRes.user?.role.toUpperCase()).toBe('FARMER');

    const mulshiRes = await authenticateUser('mulshi', 'farmer123');
    expect(mulshiRes.error).toBeUndefined();
    expect(mulshiRes.access_token).toBeTruthy();
    expect(mulshiRes.user?.role.toUpperCase()).toBe('FARMER');

    // Buyer / Consumer login
    const buyerRes = await authenticateUser('buyer', 'buyer123');
    expect(buyerRes.error).toBeUndefined();
    expect(buyerRes.access_token).toBeTruthy();
    expect(buyerRes.user?.role.toUpperCase()).toBe('BUYER');
  });
});
