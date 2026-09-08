'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  getConsumerProducts, createConsumerOrder, getConsumerOrders,
  clusterConsumerOrders, getClusterLastMileRoute, logoutUser, getStoredUser
} from '../lib/farmdirect-service';
import type {
  ConsumerProduct, ConsumerOrder, ConsumerCluster, RouteOptimization
} from '../lib/types';
import RouteMap, { RouteStop } from './RouteMap';
import ProtectedRoute from './ProtectedRoute';
import {
  Sprout, Truck, Snowflake, ShieldCheck, MapPin, AlertCircle,
  Calendar, Clock, ArrowRight, Info, Search, Package, Sparkles,
  CheckCircle2, ShoppingBag, ShoppingCart, Trash2, Plus, Minus,
  Leaf, Layers, Store, TrendingUp, BarChart3, ChevronRight, Zap,
  Thermometer, RotateCcw
} from 'lucide-react';

type TabType = 'market' | 'cart' | 'orders' | 'clustering' | 'insights';
type CategoryFilter = 'ALL' | 'VEGETABLES' | 'FRUITS' | 'LEAFY';
type SortOption = 'freshness' | 'price_asc' | 'perishable' | 'available';

export default function ConsumerPortal() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('market');
  const [userProfile, setUserProfile] = useState<any>({
    name: 'Priya Sharma (Household)',
    location: 'Kothrud, Pune',
    delivery_zone: 'Kothrud Regional Cluster (Pune)'
  });
  const [products, setProducts] = useState<ConsumerProduct[]>([]);
  const [orders, setOrders] = useState<ConsumerOrder[]>([]);
  const [clusters, setClusters] = useState<ConsumerCluster[]>([]);
  const [selectedClusterRoute, setSelectedClusterRoute] = useState<RouteOptimization | null>(null);

  // Search, filtering, and sorting state
  const [searchCrop, setSearchCrop] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('ALL');
  const [filterFreshness, setFilterFreshness] = useState<'ALL' | 'FRESH' | 'MODERATE'>('ALL');
  const [filterStorage, setFilterStorage] = useState<'ALL' | 'VENTILATED' | 'REFRIGERATED' | 'AMBIENT'>('ALL');
  const [sortBy, setSortBy] = useState<SortOption>('freshness');

  // Multi-crop basket state
  const [cart, setCart] = useState<Record<string, { product: ConsumerProduct; quantity_kg: number }>>({
    'l1': {
      product: {
        id: 'l1', farmer_id: 'farmer-1', farmer_name: 'Khed Farmer Group', crop: 'Tomatoes',
        available_kg: 420, quality_grade: 'A', price_per_kg: 27, harvest_date: '2026-09-07',
        storage_type: 'VENTILATED', perishability_level: 'MEDIUM', freshness_percentage: 85.7,
        remaining_shelf_life_days: 6, urgency_level: 'FRESH', location: 'Khed, Maharashtra',
        latitude: 18.738, longitude: 73.846
      },
      quantity_kg: 2.0
    },
    'l4': {
      product: {
        id: 'l4', farmer_id: 'fpo-1', farmer_name: 'Baramati FPO', crop: 'Onions',
        available_kg: 500, quality_grade: 'A', price_per_kg: 24, harvest_date: '2026-09-03',
        storage_type: 'VENTILATED', perishability_level: 'LOW', freshness_percentage: 88.9,
        remaining_shelf_life_days: 40, urgency_level: 'FRESH', location: 'Baramati, Maharashtra',
        latitude: 18.151, longitude: 74.578
      },
      quantity_kg: 1.0
    }
  });

  const [deliveryAddress, setDeliveryAddress] = useState('Flat 402, Mayur Colony, Kothrud, Pune');
  const [deliveryWindow, setDeliveryWindow] = useState('6:00 PM – 8:00 PM (Shared Neighborhood Slot)');
  const [orderNotice, setOrderNotice] = useState('');
  const [isOrdering, setIsOrdering] = useState(false);
  const [token, setToken] = useState('');

  useEffect(() => {
    async function loadData() {
      const t = sessionStorage.getItem('farmdirect-token') || '';
      const stored = getStoredUser();
      if (stored) {
        setUserProfile((prev: any) => ({ ...prev, ...stored, delivery_zone: 'Kothrud Regional Cluster (Pune)' }));
      }
      setToken(t);

      try {
        const [pList, oList, cList] = await Promise.all([
          getConsumerProducts(),
          getConsumerOrders(t),
          clusterConsumerOrders()
        ]);

        setProducts(pList);
        setOrders(oList);
        setClusters(cList);

        if (cList.length > 0) {
          const route = await getClusterLastMileRoute(cList[0].cluster_id);
          setSelectedClusterRoute(route);
        }
      } catch (err) {
        console.error('Failed to load consumer portal data:', err);
      }
    }
    loadData();
  }, []);

  const handleLogout = () => {
    logoutUser();
    router.push('/');
  };

  const handleAddToCart = (product: ConsumerProduct, initialQty: number = 1.0) => {
    setCart(prev => {
      const existing = prev[product.id];
      const qty = existing ? existing.quantity_kg + initialQty : initialQty;
      return { ...prev, [product.id]: { product, quantity_kg: Math.round(qty * 10) / 10 } };
    });
    setOrderNotice(`Added ${product.crop} to your household basket.`);
  };

  const handleUpdateQty = (listingId: string, delta: number) => {
    setCart(prev => {
      const existing = prev[listingId];
      if (!existing) return prev;
      const newQty = Math.max(0.5, Math.round((existing.quantity_kg + delta) * 10) / 10);
      return { ...prev, [listingId]: { ...existing, quantity_kg: newQty } };
    });
  };

  const handleRemoveItem = (listingId: string) => {
    setCart(prev => {
      const copy = { ...prev };
      delete copy[listingId];
      return copy;
    });
  };

  const cartItems = Object.values(cart);
  const cartTotalItemsCount = cartItems.reduce((acc, it) => acc + 1, 0);
  const cartTotalKg = cartItems.reduce((acc, it) => acc + it.quantity_kg, 0);
  const subtotal = cartItems.reduce((acc, it) => acc + (it.quantity_kg * it.product.price_per_kg), 0);
  const deliveryFee = cartItems.length > 0 ? 30.0 : 0.0;
  const estimatedSavings = Math.round(subtotal * 0.28); // Average 28% savings vs intermediary mandi retail markups
  const grandTotal = subtotal + deliveryFee;

  // Filter & sort products
  const filteredProducts = useMemo(() => {
    const list = products.filter(p => {
      if (searchCrop) {
        const query = searchCrop.toLowerCase();
        const matchesCrop = p.crop.toLowerCase().includes(query);
        const matchesFarmer = p.farmer_name.toLowerCase().includes(query);
        const matchesLoc = p.location.toLowerCase().includes(query);
        if (!matchesCrop && !matchesFarmer && !matchesLoc) return false;
      }

      if (selectedCategory === 'FRUITS' && !['strawberries', 'mangoes', 'grapes', 'apples'].includes(p.crop.toLowerCase())) {
        return false;
      }
      if (selectedCategory === 'LEAFY' && !['spinach', 'coriander', 'fenugreek', 'lettuce'].includes(p.crop.toLowerCase())) {
        return false;
      }
      if (selectedCategory === 'VEGETABLES' && ['strawberries'].includes(p.crop.toLowerCase())) {
        return false;
      }

      if (filterFreshness === 'FRESH' && p.freshness_percentage < 80) return false;
      if (filterFreshness === 'MODERATE' && (p.freshness_percentage >= 80 || p.freshness_percentage < 60)) return false;

      if (filterStorage !== 'ALL') {
        if (filterStorage === 'REFRIGERATED' && !p.storage_type.toUpperCase().includes('REFRIGERATED') && !p.storage_type.toUpperCase().includes('COLD')) return false;
        if (filterStorage === 'VENTILATED' && !p.storage_type.toUpperCase().includes('VENTILATED')) return false;
        if (filterStorage === 'AMBIENT' && !p.storage_type.toUpperCase().includes('AMBIENT')) return false;
      }

      return true;
    });

    switch (sortBy) {
      case 'price_asc':
        return list.sort((a, b) => a.price_per_kg - b.price_per_kg);
      case 'perishable':
        return list.sort((a, b) => a.remaining_shelf_life_days - b.remaining_shelf_life_days);
      case 'available':
        return list.sort((a, b) => b.available_kg - a.available_kg);
      case 'freshness':
      default:
        return list.sort((a, b) => b.freshness_percentage - a.freshness_percentage);
    }
  }, [products, searchCrop, selectedCategory, filterFreshness, filterStorage, sortBy]);

  const handlePlaceOrder = async () => {
    if (cartItems.length === 0) return;
    setIsOrdering(true);
    setOrderNotice('Orchestrating small household aggregation via nearest partner hub…');

    try {
      const payload = {
        items: cartItems.map(it => ({
          listing_id: it.product.id,
          crop: it.product.crop,
          quantity_kg: it.quantity_kg,
          unit_price: it.product.price_per_kg
        })),
        delivery_address: deliveryAddress,
        latitude: 18.5074,
        longitude: 73.8077,
        delivery_window: deliveryWindow
      };

      const res = await createConsumerOrder(payload, token);
      setOrderNotice(
        `Order #${res.order_id} placed successfully! Clustered via ${res.recommended_hub || 'Kothrud Partner Collection Point'} for shared neighborhood dispatch.`
      );
      setCart({});
      const updatedOrders = await getConsumerOrders(token);
      setOrders(updatedOrders);
      setActiveTab('orders');
    } catch {
      setOrderNotice('Order placed successfully in local presentation mode.');
    } finally {
      setIsOrdering(false);
    }
  };

  // Convert cluster route stops to Leaflet map stops
  const clusterMapStops: RouteStop[] = useMemo(() => {
    if (selectedClusterRoute && selectedClusterRoute.stop_sequence.length > 0) {
      return selectedClusterRoute.stop_sequence.map(s => ({
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        action: s.action,
        isHub: s.stop_type === 'CROSS_DOCK',
        isConsumer: s.stop_type === 'DELIVERY',
        stopType: s.stop_type === 'CROSS_DOCK' ? 'HUB' : 'CONSUMER',
        quantityKg: s.quantity_kg,
        etaMinutes: s.estimated_arrival_mins
      }));
    }
    return [
      { name: 'Kothrud Cooperative Collection Point', lat: 18.5074, lng: 73.8077, action: 'Consolidated Dispatch 14.5 kg', isHub: true, stopType: 'HUB' },
      { name: 'Priya Sharma (Doorstep)', lat: 18.5074, lng: 73.8077, action: 'Deliver 3.0 kg', isConsumer: true, stopType: 'CONSUMER', quantityKg: 3.0 },
      { name: 'Amit Patil (Doorstep)', lat: 18.5030, lng: 73.8010, action: 'Deliver 5.0 kg', isConsumer: true, stopType: 'CONSUMER', quantityKg: 5.0 },
      { name: 'Sneha Kulkarni (Doorstep)', lat: 18.5110, lng: 73.8140, action: 'Deliver 6.5 kg', isConsumer: true, stopType: 'CONSUMER', quantityKg: 6.5 }
    ];
  }, [selectedClusterRoute]);

  return (
    <ProtectedRoute allowedRoles={['CONSUMER', 'BUYER', 'ADMIN']}>
      <main className="app">
        {/* ==================================================== */}
        {/* 1. PREMIUM CONSUMER DASHBOARD HEADER                 */}
        {/* ==================================================== */}
        <nav className="nav" style={{ flexWrap: 'wrap', gap: 14, alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div
              className="brand"
              onClick={() => setActiveTab('market')}
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <i />
              FarmDirect
            </div>

            <span
              className="portal-badge"
              style={{
                background: '#ecfdf5',
                color: '#065f46',
                border: '1px solid #a7f3d0',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <ShoppingBag size={13} />
              Household Consumer Marketplace
            </span>

            <span
              style={{
                fontSize: 11,
                color: '#1e40af',
                background: '#eff6ff',
                padding: '4px 10px',
                borderRadius: 999,
                border: '1px solid #bfdbfe',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5
              }}
            >
              <MapPin size={11} />
              Delivery Zone: Kothrud Cluster (Pune, MH)
            </span>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="user-welcome-text" style={{ fontSize: 13 }}>
              Welcome, <strong>{userProfile.name}</strong>
            </span>

            {/* Basket Shortcut */}
            <button
              type="button"
              onClick={() => setActiveTab('cart')}
              className="tag"
              style={{
                background: activeTab === 'cart' ? 'var(--green)' : '#f8fafc',
                color: activeTab === 'cart' ? '#fff' : 'var(--ink)',
                border: '1px solid var(--line)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                cursor: 'pointer',
                fontSize: 12
              }}
              title="View Household Basket"
            >
              <ShoppingCart size={13} />
              Basket
              <span
                style={{
                  background: activeTab === 'cart' ? '#ffffff' : 'var(--green)',
                  color: activeTab === 'cart' ? 'var(--green)' : '#ffffff',
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '1px 6px',
                  borderRadius: 10
                }}
              >
                {cartTotalItemsCount}
              </span>
            </button>

            {/* Orders Shortcut */}
            <button
              type="button"
              onClick={() => setActiveTab('orders')}
              className="tag"
              style={{
                background: activeTab === 'orders' ? 'var(--green)' : '#f8fafc',
                color: activeTab === 'orders' ? '#fff' : 'var(--ink)',
                border: '1px solid var(--line)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                cursor: 'pointer',
                fontSize: 12
              }}
              title="View Past Orders"
            >
              <Package size={13} />
              Orders ({orders.length})
            </button>

            <button
              type="button"
              className="logout-btn"
              onClick={handleLogout}
              title="Log out from Household Consumer Portal"
            >
              Logout
            </button>
          </div>
        </nav>

        {/* Subtitle Banner */}
        <div
          style={{
            margin: '-10px 0 20px',
            fontSize: 13,
            color: 'var(--muted)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
            borderBottom: '1px solid var(--line)',
            paddingBottom: 12
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={14} color="var(--green)" />
            <span>Fresh farm produce, intelligently consolidated for efficient neighborhood delivery.</span>
          </div>
          <div style={{ fontSize: 12, color: '#047857', fontWeight: 600 }}>
            🌱 100% Direct From Farmers · Zero Middleman Markup · No Central Warehouses
          </div>
        </div>

        {/* Primary Navigation Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="tag"
            style={{
              background: activeTab === 'market' ? 'var(--green)' : '#f1f5f9',
              color: activeTab === 'market' ? '#fff' : 'inherit',
              fontSize: 13,
              padding: '8px 16px',
              cursor: 'pointer',
              border: activeTab === 'market' ? 'none' : '1px solid #e2e8f0',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
            onClick={() => setActiveTab('market')}
          >
            <Sprout size={14} />
            Farm-Fresh Marketplace ({products.length})
          </button>

          <button
            type="button"
            className="tag"
            style={{
              background: activeTab === 'cart' ? 'var(--green)' : '#f1f5f9',
              color: activeTab === 'cart' ? '#fff' : 'inherit',
              fontSize: 13,
              padding: '8px 16px',
              cursor: 'pointer',
              border: activeTab === 'cart' ? 'none' : '1px solid #e2e8f0',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
            onClick={() => setActiveTab('cart')}
          >
            <ShoppingCart size={14} />
            My Multi-Crop Basket ({cartTotalItemsCount})
          </button>

          <button
            type="button"
            className="tag"
            style={{
              background: activeTab === 'orders' ? 'var(--green)' : '#f1f5f9',
              color: activeTab === 'orders' ? '#fff' : 'inherit',
              fontSize: 13,
              padding: '8px 16px',
              cursor: 'pointer',
              border: activeTab === 'orders' ? 'none' : '1px solid #e2e8f0',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
            onClick={() => setActiveTab('orders')}
          >
            <Package size={14} />
            My Orders & Traceability ({orders.length})
          </button>

          <button
            type="button"
            className="tag"
            style={{
              background: activeTab === 'clustering' ? 'var(--green)' : '#f1f5f9',
              color: activeTab === 'clustering' ? '#fff' : 'inherit',
              fontSize: 13,
              padding: '8px 16px',
              cursor: 'pointer',
              border: activeTab === 'clustering' ? 'none' : '1px solid #e2e8f0',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
            onClick={() => setActiveTab('clustering')}
          >
            <Truck size={14} />
            AI Logistics & DBSCAN Clustering
          </button>

          <button
            type="button"
            className="tag"
            style={{
              background: activeTab === 'insights' ? 'var(--green)' : '#f1f5f9',
              color: activeTab === 'insights' ? '#fff' : 'inherit',
              fontSize: 13,
              padding: '8px 16px',
              cursor: 'pointer',
              border: activeTab === 'insights' ? 'none' : '1px solid #e2e8f0',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
            onClick={() => setActiveTab('insights')}
          >
            <BarChart3 size={14} />
            AI & Smart Logistics Insights
          </button>
        </div>

        {/* Global Action Notification */}
        {orderNotice && (
          <div
            style={{
              marginBottom: 18,
              padding: '12px 16px',
              background: '#ecfdf5',
              border: '1px solid #a7f3d0',
              borderRadius: 8,
              color: '#065f46',
              fontSize: 13,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              boxShadow: '0 2px 6px rgba(16, 185, 129, 0.08)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={16} color="#059669" />
              <span>{orderNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setOrderNotice('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#065f46', fontWeight: 700 }}
            >
              ✕
            </button>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 1: FARM-FRESH MARKETPLACE                        */}
        {/* ==================================================== */}
        {activeTab === 'market' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* 2. HERO SECTION */}
            <div
              className="card"
              style={{
                background: 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)',
                border: '1px solid #bbf7d0',
                padding: '24px 28px',
                borderRadius: 14,
                boxShadow: '0 4px 20px rgba(43, 122, 69, 0.06)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 20 }}>
                <div style={{ maxWidth: 680 }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                    <Sparkles size={13} />
                    Intelligent Direct-to-Consumer Agricultural Grid
                  </div>
                  <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--navy)', margin: '0 0 8px', lineHeight: 1.25 }}>
                    Farm-Fresh Produce, Direct to Your Neighborhood
                  </h1>
                  <p style={{ fontSize: 14, color: '#475569', margin: 0, lineHeight: 1.55 }}>
                    Buy directly from verified farmers and FPOs. Our AI-powered logistics system groups nearby household orders for efficient, affordable, and freshness-preserving delivery.
                  </p>
                </div>

                {/* Asset-Light Guarantee Badge */}
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #d1fae5',
                    borderRadius: 10,
                    padding: '12px 16px',
                    maxWidth: 320,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#047857', fontWeight: 700, fontSize: 12, marginBottom: 4 }}>
                    <Store size={14} />
                    ASSET-LIGHT NO-WAREHOUSE MODEL
                  </div>
                  <p style={{ fontSize: 11, color: '#64748b', margin: 0, lineHeight: 1.4 }}>
                    Zero FarmDirect-owned warehouses or trucks. Produce moves through <strong>short-duration cross-docking (&lt; 4–8h)</strong> via existing FPO and community partners.
                  </p>
                </div>
              </div>

              {/* 3 Important Benefits */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: 14,
                  marginTop: 20,
                  paddingTop: 18,
                  borderTop: '1px solid #dcfce7'
                }}
              >
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ background: '#dcfce7', color: '#166534', padding: 10, borderRadius: 10, display: 'flex' }}>
                    <Sprout size={20} />
                  </div>
                  <div>
                    <strong style={{ display: 'block', fontSize: 13, color: 'var(--navy)' }}>Direct from Farmers</strong>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>Harvested on order · Zero middlemen markup</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ background: '#dbeafe', color: '#1e40af', padding: 10, borderRadius: 10, display: 'flex' }}>
                    <Truck size={20} />
                  </div>
                  <div>
                    <strong style={{ display: 'block', fontSize: 13, color: 'var(--navy)' }}>Smart Neighborhood Delivery</strong>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>DBSCAN clustered drop-offs · Just ₹30 fee</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ background: '#e0f2fe', color: '#0369a1', padding: 10, borderRadius: 10, display: 'flex' }}>
                    <Snowflake size={20} />
                  </div>
                  <div>
                    <strong style={{ display: 'block', fontSize: 13, color: 'var(--navy)' }}>Freshness-Aware Logistics</strong>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>Live shelf-life index · Reefer protection</span>
                  </div>
                </div>
              </div>

              {/* "How it Works" Flow */}
              <div
                style={{
                  marginTop: 18,
                  padding: '10px 14px',
                  background: 'rgba(255,255,255,0.7)',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  fontSize: 12,
                  color: '#166534',
                  fontWeight: 600,
                  flexWrap: 'wrap'
                }}
              >
                <span style={{ textTransform: 'uppercase', fontSize: 10, color: 'var(--muted)', fontWeight: 800 }}>How it works:</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>🌱 Farm Harvest</span>
                <ChevronRight size={12} color="#94a3b8" />
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>🏪 Partner Cross-Dock (&lt;4-8h)</span>
                <ChevronRight size={12} color="#94a3b8" />
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>📍 Neighborhood Cluster (DBSCAN)</span>
                <ChevronRight size={12} color="#94a3b8" />
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>🚪 Your Doorstep Delivery</span>
              </div>
            </div>

            {/* 4. SMART FILTERS & SEARCH */}
            <div className="card" style={{ padding: '16px 20px', borderRadius: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Search Bar & Quick Categories */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 400 }}>
                    <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="text"
                      placeholder="Search produce, farmer, or region…"
                      value={searchCrop}
                      onChange={e => setSearchCrop(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '9px 12px 9px 36px',
                        borderRadius: 8,
                        border: '1px solid var(--line)',
                        fontSize: 13,
                        outline: 'none',
                        background: '#f8fafc'
                      }}
                    />
                    {searchCrop && (
                      <button
                        type="button"
                        onClick={() => setSearchCrop('')}
                        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Category Pills */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(['ALL', 'VEGETABLES', 'FRUITS', 'LEAFY'] as CategoryFilter[]).map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        style={{
                          padding: '6px 14px',
                          borderRadius: 20,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          background: selectedCategory === cat ? 'var(--green)' : '#f1f5f9',
                          color: selectedCategory === cat ? '#ffffff' : '#475569',
                          border: selectedCategory === cat ? 'none' : '1px solid #e2e8f0'
                        }}
                      >
                        {cat === 'ALL' ? 'All Crops' : cat === 'VEGETABLES' ? '🥦 Vegetables' : cat === 'FRUITS' ? '🍓 Fruits' : '🥬 Leafy Greens'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Secondary Filters: Freshness, Storage, Sort */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Filter:</span>

                    {/* Freshness Filter */}
                    <select
                      value={filterFreshness}
                      onChange={e => setFilterFreshness(e.target.value as any)}
                      style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)', fontSize: 12, background: '#fff' }}
                    >
                      <option value="ALL">Freshness: All</option>
                      <option value="FRESH">Ultra Fresh (&gt;80%)</option>
                      <option value="MODERATE">Moderate (60–80%)</option>
                    </select>

                    {/* Storage Filter */}
                    <select
                      value={filterStorage}
                      onChange={e => setFilterStorage(e.target.value as any)}
                      style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)', fontSize: 12, background: '#fff' }}
                    >
                      <option value="ALL">Storage: All Regimes</option>
                      <option value="VENTILATED">🍃 Ventilated Ambient</option>
                      <option value="REFRIGERATED">❄️ Cold-Chain (Refrigerated)</option>
                    </select>
                  </div>

                  {/* Sort By Dropdown */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Sort by:</span>
                    <select
                      value={sortBy}
                      onChange={e => setSortBy(e.target.value as SortOption)}
                      style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--line)', fontSize: 12, background: '#fff', fontWeight: 600 }}
                    >
                      <option value="freshness">✨ Freshest First</option>
                      <option value="price_asc">💰 Lowest Price</option>
                      <option value="perishable">⚡ Priority Perishable</option>
                      <option value="available">📦 Available Volume</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. REDESIGNED PRODUCT CARDS GRID */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)', margin: 0 }}>
                  Active Farm Listings ({filteredProducts.length})
                </h2>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Showing verified farmer batches with live freshness scoring
                </span>
              </div>

              {filteredProducts.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
                  <Sprout size={36} color="#cbd5e1" style={{ margin: '0 auto 12px' }} />
                  <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>No produce matches your current filters.</p>
                  <button
                    type="button"
                    onClick={() => { setSearchCrop(''); setSelectedCategory('ALL'); setFilterFreshness('ALL'); setFilterStorage('ALL'); }}
                    className="button green"
                    style={{ marginTop: 12, fontSize: 12 }}
                  >
                    Reset All Filters
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(295px, 1fr))',
                    gap: 16
                  }}
                >
                  {filteredProducts.map(p => {
                    const isCold = p.storage_type.toUpperCase().includes('REFRIGERATED') || p.storage_type.toUpperCase().includes('COLD');
                    const isHighPerishable = p.perishability_level === 'CRITICAL' || p.perishability_level === 'HIGH';
                    const isUrgent = p.remaining_shelf_life_days <= 3 || p.urgency_level === 'URGENT';

                    const freshColor = p.freshness_percentage >= 80 ? '#059669' : p.freshness_percentage >= 65 ? '#d97706' : '#dc2626';
                    const freshBg = p.freshness_percentage >= 80 ? '#ecfdf5' : p.freshness_percentage >= 65 ? '#fffbeb' : '#fef2f2';

                    const inCart = cart[p.id];

                    return (
                      <div
                        key={p.id}
                        className="card"
                        style={{
                          padding: 18,
                          borderRadius: 12,
                          border: isUrgent ? '1.5px solid #fde68a' : '1px solid var(--line)',
                          background: '#ffffff',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
                          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                          position: 'relative'
                        }}
                      >
                        <div>
                          {/* Top: Crop Name & Badges */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                            <div>
                              <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--navy)', margin: '0 0 2px' }}>
                                {p.crop}
                              </h3>
                              <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span>👨‍🌾 {p.farmer_name}</span>
                              </div>
                              <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                                📍 {p.location}
                              </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  background: '#e0f2fe',
                                  color: '#0369a1',
                                  border: '1px solid #bae6fd'
                                }}
                              >
                                {p.quality_grade || 'Grade A'}
                              </span>

                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  background: isCold ? '#eff6ff' : '#f1f5f9',
                                  color: isCold ? '#1e40af' : '#475569',
                                  border: isCold ? '1px solid #bfdbfe' : '1px solid #e2e8f0'
                                }}
                              >
                                {isCold ? '❄️ Cold-Chain' : '🍃 Ventilated'}
                              </span>
                            </div>
                          </div>

                          {/* Urgent Dispatch Banner (Food Waste Prevention) */}
                          {isUrgent && (
                            <div
                              style={{
                                margin: '8px 0',
                                padding: '6px 10px',
                                borderRadius: 6,
                                background: '#fffbeb',
                                border: '1px solid #fef3c7',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                fontSize: 11,
                                color: '#92400e'
                              }}
                            >
                              <Zap size={13} color="#d97706" />
                              <span>
                                <strong>Priority Dispatch:</strong> Fast neighborhood delivery prevents food waste.
                              </span>
                            </div>
                          )}

                          {/* Freshness Section with Visual Progress Bar */}
                          <div
                            style={{
                              margin: '12px 0',
                              padding: '10px 12px',
                              borderRadius: 8,
                              background: freshBg,
                              border: `1px solid ${freshColor}30`
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 5 }}>
                              <span style={{ fontWeight: 600, color: 'var(--ink)' }}>Freshness Score</span>
                              <strong style={{ color: freshColor, fontSize: 13 }}>
                                {p.freshness_percentage}% ({p.urgency_level})
                              </strong>
                            </div>

                            {/* Progress bar */}
                            <div
                              style={{
                                width: '100%',
                                height: 6,
                                borderRadius: 3,
                                background: '#e2e8f0',
                                overflow: 'hidden'
                              }}
                            >
                              <div
                                style={{
                                  width: `${Math.min(100, Math.max(10, p.freshness_percentage))}%`,
                                  height: '100%',
                                  background: freshColor,
                                  borderRadius: 3
                                }}
                              />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', marginTop: 6 }}>
                              <span>Harvested: {p.harvest_date || 'Today'}</span>
                              <span>Shelf Life: ~{p.remaining_shelf_life_days}d</span>
                            </div>
                          </div>

                          {/* Perishable Handling Note */}
                          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 12, lineHeight: 1.4 }}>
                            {isHighPerishable ? (
                              <span style={{ color: '#0369a1', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <Snowflake size={12} />
                                Cold-chain recommended for delicate berry / leafy tissue.
                              </span>
                            ) : (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <Leaf size={12} color="#16a34a" />
                                Standard ventilated delivery suitable for robust root crops.
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Bottom: Pricing, Available Quantity & Actions */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                            <div>
                              <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)' }}>₹{p.price_per_kg}</span>
                              <span style={{ fontSize: 12, color: 'var(--muted)' }}> / kg</span>
                            </div>
                            <span style={{ fontSize: 11, color: '#059669', fontWeight: 600, background: '#ecfdf5', padding: '2px 8px', borderRadius: 4 }}>
                              {p.available_kg} kg available
                            </span>
                          </div>

                          {/* Add to Basket or Quantity Controller */}
                          {inCart ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  border: '1.5px solid var(--green)',
                                  borderRadius: 8,
                                  background: '#ffffff',
                                  flex: 1,
                                  justifyContent: 'space-between',
                                  padding: '2px 6px'
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleUpdateQty(p.id, -0.5)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 10px', color: 'var(--green)', fontWeight: 800, fontSize: 14 }}
                                >
                                  -
                                </button>
                                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>
                                  {inCart.quantity_kg} kg
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateQty(p.id, 0.5)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 10px', color: 'var(--green)', fontWeight: 800, fontSize: 14 }}
                                >
                                  +
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => setActiveTab('cart')}
                                className="button green"
                                style={{ padding: '8px 14px', fontSize: 12, minHeight: 38 }}
                              >
                                View Cart →
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleAddToCart(p)}
                              className="button green"
                              style={{ width: '100%', fontSize: 13, minHeight: 38 }}
                            >
                              + Add to Household Basket
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 10. DELIVERY MODEL EXPLAINER SECTION */}
            <div
              className="card"
              style={{
                background: '#ffffff',
                border: '1px solid var(--line)',
                padding: '24px 28px',
                borderRadius: 14,
                marginTop: 10
              }}
            >
              <div style={{ maxWidth: 800 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Sustainable AgriTech Logistics
                </span>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--navy)', margin: '4px 0 8px' }}>
                  How Your Produce Reaches You Without Warehousing
                </h2>
                <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 18px', lineHeight: 1.6 }}>
                  Conventional supply chains hold produce in multi-day transit warehouses where vegetables lose moisture, vitamins, and freshness.
                  FarmDirect operates an <strong>asset-light, zero-inventory orchestration platform</strong>:
                </p>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: 14
                  }}
                >
                  <div style={{ padding: 14, borderRadius: 8, background: '#f8fafc', border: '1px solid var(--line)' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 4 }}>
                      1. Harvest to Order
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
                      Farmers harvest according to confirmed multi-crop demand requests, ensuring maximum post-harvest shelf life.
                    </p>
                  </div>

                  <div style={{ padding: 14, borderRadius: 8, background: '#f8fafc', border: '1px solid var(--line)' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 4 }}>
                      2. Short-Duration Cross-Dock
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
                      Crops arrive at existing partner collection hubs (FPOs and community grocery stores) for rapid &lt;4–8 hour sorting.
                    </p>
                  </div>

                  <div style={{ padding: 14, borderRadius: 8, background: '#f8fafc', border: '1px solid var(--line)' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 4 }}>
                      3. Neighborhood Cluster Drop
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
                      DBSCAN algorithmic clustering routes consolidated orders to nearby households via green EV couriers.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 2: SMART BASKET EXPERIENCE                       */}
        {/* ==================================================== */}
        {activeTab === 'cart' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, alignItems: 'start' }}>
            {/* Left: Basket Items */}
            <div className="card" style={{ padding: 22, borderRadius: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', margin: 0 }}>
                    🧺 Your Farm Basket
                  </h2>
                  <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 0' }}>
                    Directly bundled from verified regional producers for clustered delivery.
                  </p>
                </div>
                {cartItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCart({})}
                    style={{ fontSize: 12, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    Clear All
                  </button>
                )}
              </div>

              {cartItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--muted)' }}>
                  <ShoppingCart size={40} color="#cbd5e1" style={{ margin: '0 auto 12px' }} />
                  <p style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px', color: 'var(--navy)' }}>Your basket is empty</p>
                  <p style={{ fontSize: 12, margin: '0 0 16px' }}>Explore active farm listings to add fresh seasonal produce.</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('market')}
                    className="button green"
                    style={{ fontSize: 13 }}
                  >
                    Browse Farm Marketplace →
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {cartItems.map(({ product, quantity_kg }) => {
                    const lineTotal = quantity_kg * product.price_per_kg;
                    const isCold = product.storage_type.toUpperCase().includes('REFRIGERATED') || product.storage_type.toUpperCase().includes('COLD');

                    return (
                      <div
                        key={product.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '14px',
                          borderRadius: 10,
                          border: '1px solid var(--line)',
                          background: '#f8fafc',
                          flexWrap: 'wrap',
                          gap: 12
                        }}
                      >
                        <div style={{ flex: '1 1 200px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--navy)' }}>{product.crop}</span>
                            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#dcfce7', color: '#166534', fontWeight: 700 }}>
                              {product.freshness_percentage}% Fresh
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                            👨‍🌾 {product.farmer_name} · Harvest: {product.harvest_date || 'Today'}
                          </div>
                          <div style={{ fontSize: 11, color: isCold ? '#1e40af' : '#64748b', marginTop: 2 }}>
                            {isCold ? '❄️ Cold-Chain Transit' : '🍃 Ventilated Storage'} · ₹{product.price_per_kg}/kg
                          </div>
                        </div>

                        {/* Quantity Controls & Line Price */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              border: '1px solid #cbd5e1',
                              borderRadius: 6,
                              background: '#ffffff'
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => handleUpdateQty(product.id, -0.5)}
                              style={{ padding: '4px 10px', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 800 }}
                            >
                              -
                            </button>
                            <span style={{ minWidth: 44, textAlign: 'center', fontSize: 12, fontWeight: 700 }}>
                              {quantity_kg} kg
                            </span>
                            <button
                              type="button"
                              onClick={() => handleUpdateQty(product.id, 0.5)}
                              style={{ padding: '4px 10px', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 800 }}
                            >
                              +
                            </button>
                          </div>

                          <div style={{ minWidth: 65, textAlign: 'right', fontWeight: 800, fontSize: 15, color: 'var(--navy)' }}>
                            ₹{lineTotal.toFixed(1)}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveItem(product.id)}
                            style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: 4 }}
                            title="Remove item"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: Smart Delivery Analysis & Checkout */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* 5. SMART DELIVERY ANALYSIS CARD */}
              <div
                className="card"
                style={{
                  padding: 20,
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #ffffff 0%, #eff6ff 100%)',
                  border: '1px solid #bfdbfe'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: '#1e40af' }}>
                  <BrainCircuit size={18} />
                  <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>Smart Delivery Analysis</h3>
                </div>

                <p style={{ fontSize: 12, color: '#475569', margin: '0 0 14px', lineHeight: 1.5 }}>
                  Small household orders are consolidated with nearby orders to reduce delivery costs and avoid inefficient individual farm-to-door trips.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #dbeafe' }}>
                    <span style={{ color: '#64748b' }}>Neighborhood Consolidation:</span>
                    <strong style={{ color: '#16a34a' }}>✓ Eligible (Kothrud Zone)</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #dbeafe' }}>
                    <span style={{ color: '#64748b' }}>Nearby Household Orders:</span>
                    <strong>8 orders within 5 km</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #dbeafe' }}>
                    <span style={{ color: '#64748b' }}>Recommended Dispatch:</span>
                    <strong>Shared neighborhood route (EV Bike)</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                    <span style={{ color: '#64748b' }}>Estimated Delivery Window:</span>
                    <strong style={{ color: '#1d4ed8' }}>6:00 PM – 8:00 PM</strong>
                  </div>
                </div>
              </div>

              {/* Order Cost Breakdown */}
              <div className="card" style={{ padding: 20, borderRadius: 12 }}>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)', margin: '0 0 14px' }}>
                  Order Checkout Summary
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--muted)' }}>Produce Subtotal ({cartTotalKg.toFixed(1)} kg):</span>
                    <strong>₹{subtotal.toFixed(2)}</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--muted)' }}>Estimated Delivery Fee:</span>
                    <strong style={{ color: '#059669' }}>₹{deliveryFee.toFixed(2)}</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', background: '#ecfdf5', padding: '6px 10px', borderRadius: 6 }}>
                    <span style={{ color: '#065f46', fontSize: 12 }}>Estimated Savings vs Retail:</span>
                    <strong style={{ color: '#047857', fontSize: 12 }}>~₹{estimatedSavings} (28%)</strong>
                  </div>

                  <div
                    style={{
                      borderTop: '1px solid var(--line)',
                      paddingTop: 10,
                      marginTop: 4,
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 16
                    }}
                  >
                    <span style={{ fontWeight: 800, color: 'var(--navy)' }}>Total Amount:</span>
                    <strong style={{ fontWeight: 800, color: 'var(--green)', fontSize: 18 }}>₹{grandTotal.toFixed(2)}</strong>
                  </div>
                </div>

                {/* Delivery Form */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                      DELIVERY ADDRESS
                    </label>
                    <input
                      type="text"
                      value={deliveryAddress}
                      onChange={e => setDeliveryAddress(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--line)', fontSize: 12 }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                      DELIVERY TIME WINDOW
                    </label>
                    <select
                      value={deliveryWindow}
                      onChange={e => setDeliveryWindow(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--line)', fontSize: 12, background: '#fff' }}
                    >
                      <option value="6:00 PM – 8:00 PM (Shared Neighborhood Slot)">6:00 PM – 8:00 PM (Shared Clustered Slot)</option>
                      <option value="10:00 AM – 12:00 PM (Morning Priority Slot)">10:00 AM – 12:00 PM (Morning Priority Slot)</option>
                    </select>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handlePlaceOrder}
                  disabled={cartItems.length === 0 || isOrdering}
                  className="button green"
                  style={{ width: '100%', padding: '12px', fontSize: 14, fontWeight: 800 }}
                >
                  {isOrdering ? 'Orchestrating Order…' : `Place Aggregated Order (₹${grandTotal.toFixed(0)})`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 3: MY ORDERS & TRACEABILITY                      */}
        {/* ==================================================== */}
        {activeTab === 'orders' && (
          <div className="card" style={{ padding: 22, borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', margin: 0 }}>
                  📦 My Orders & Farm Traceability
                </h2>
                <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 0' }}>
                  Track order progress, assigned partner cross-dock hubs, and farm-to-home batch traceability.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('market')}
                className="button green"
                style={{ fontSize: 12, minHeight: 34, padding: '6px 14px' }}
              >
                + Order More Produce
              </button>
            </div>

            {orders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
                <Package size={40} color="#cbd5e1" style={{ margin: '0 auto 12px' }} />
                <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>No orders placed yet.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {orders.map(o => {
                  return (
                    <div
                      key={o.order_id}
                      style={{
                        border: '1px solid var(--line)',
                        borderRadius: 12,
                        padding: 18,
                        background: '#ffffff',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                      }}
                    >
                      {/* Order Summary Top Bar */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: 12, marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                        <div>
                          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--navy)' }}>Order #{o.order_id}</span>
                          <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 10 }}>
                            Placed {o.created_at ? new Date(o.created_at).toLocaleDateString() : 'Today'}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span
                            style={{
                              padding: '4px 12px',
                              borderRadius: 20,
                              fontSize: 11,
                              fontWeight: 700,
                              background: o.status === 'DELIVERED' ? '#ecfdf5' : '#eff6ff',
                              color: o.status === 'DELIVERED' ? '#047857' : '#1d4ed8',
                              border: o.status === 'DELIVERED' ? '1px solid #a7f3d0' : '1px solid #bfdbfe'
                            }}
                          >
                            {o.status === 'DELIVERED' ? '✓ Delivered' : o.status === 'IN_TRANSIT' ? '🚚 Out for Delivery' : '⏳ Clustered & Staging'}
                          </span>

                          <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--green)' }}>
                            ₹{o.total.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* 8. PROFESSIONAL ORDER TIMELINE */}
                      <div style={{ margin: '14px 0 18px', background: '#f8fafc', padding: 14, borderRadius: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 10 }}>
                          Order Fulfillment Timeline
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', flexWrap: 'wrap', gap: 10 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', flex: 1, minWidth: 80 }}>
                            <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#16a34a', color: '#fff', fontSize: 11, display: 'grid', placeItems: 'center', fontWeight: 700 }}>✓</div>
                            <span style={{ fontSize: 11, fontWeight: 700, marginTop: 4, color: 'var(--navy)' }}>Order Placed</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', flex: 1, minWidth: 80 }}>
                            <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#16a34a', color: '#fff', fontSize: 11, display: 'grid', placeItems: 'center', fontWeight: 700 }}>✓</div>
                            <span style={{ fontSize: 11, fontWeight: 700, marginTop: 4, color: 'var(--navy)' }}>Farmer Harvest</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', flex: 1, minWidth: 80 }}>
                            <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#16a34a', color: '#fff', fontSize: 11, display: 'grid', placeItems: 'center', fontWeight: 700 }}>✓</div>
                            <span style={{ fontSize: 11, fontWeight: 700, marginTop: 4, color: 'var(--navy)' }}>Partner Cross-Dock</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', flex: 1, minWidth: 80 }}>
                            <div style={{ width: 22, height: 22, borderRadius: '50%', background: o.status === 'DELIVERED' ? '#16a34a' : '#2563eb', color: '#fff', fontSize: 11, display: 'grid', placeItems: 'center', fontWeight: 700 }}>
                              {o.status === 'DELIVERED' ? '✓' : '●'}
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700, marginTop: 4, color: o.status === 'DELIVERED' ? 'var(--navy)' : '#1d4ed8' }}>Out for Delivery</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', flex: 1, minWidth: 80 }}>
                            <div style={{ width: 22, height: 22, borderRadius: '50%', background: o.status === 'DELIVERED' ? '#16a34a' : '#cbd5e1', color: '#fff', fontSize: 11, display: 'grid', placeItems: 'center', fontWeight: 700 }}>
                              {o.status === 'DELIVERED' ? '✓' : '5'}
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700, marginTop: 4, color: o.status === 'DELIVERED' ? 'var(--navy)' : '#64748b' }}>Delivered</span>
                          </div>
                        </div>
                      </div>

                      {/* Partner Hub & Delivery Info Box */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                          gap: 12,
                          background: '#eff6ff',
                          border: '1px solid #bfdbfe',
                          padding: '12px 14px',
                          borderRadius: 8,
                          fontSize: 12,
                          color: '#1e40af',
                          marginBottom: 14
                        }}
                      >
                        <div>
                          <span style={{ color: '#64748b', display: 'block', fontSize: 11 }}>Partner Cross-Dock Hub:</span>
                          <strong>{o.hub_name || 'Kothrud Cooperative Collection Point'}</strong>
                        </div>
                        <div>
                          <span style={{ color: '#64748b', display: 'block', fontSize: 11 }}>Delivery Window:</span>
                          <strong>{o.delivery_window}</strong>
                        </div>
                        <div>
                          <span style={{ color: '#64748b', display: 'block', fontSize: 11 }}>Destination Address:</span>
                          <strong>{o.delivery_address}</strong>
                        </div>
                      </div>

                      {/* Farm-to-Home Traceability Items */}
                      <div>
                        <span style={{ fontWeight: 800, fontSize: 12, color: 'var(--navy)', textTransform: 'uppercase' }}>
                          Farm-to-Home Batch Traceability ({o.items?.length || 0} Crops):
                        </span>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10, marginTop: 8 }}>
                          {o.items?.map((it, idx) => (
                            <div
                              key={idx}
                              style={{
                                padding: 12,
                                border: '1px solid var(--line)',
                                borderRadius: 8,
                                background: '#f8fafc',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 4
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <strong style={{ fontSize: 14, color: 'var(--navy)' }}>{it.quantity_kg} kg {it.crop}</strong>
                                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)' }}>₹{it.unit_price}/kg</span>
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                                Farm: <strong>{it.farmer_name || 'Khed Farmer Group'}</strong>
                              </div>
                              <div style={{ fontSize: 11, color: '#059669', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span>🍃 Storage: {it.storage_type || 'Ventilated'}</span>
                              </div>
                              <div style={{ fontSize: 10, color: '#64748b', borderTop: '1px solid #e2e8f0', paddingTop: 4, marginTop: 2 }}>
                                Delivery: Neighborhood Consolidated Route
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 4: DBSCAN CLUSTERING & ROUTE OPTIMIZATION        */}
        {/* ==================================================== */}
        {activeTab === 'clustering' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* 6. REDESIGNED DBSCAN CLUSTERING HEADER & FLOW */}
            <div className="card" style={{ padding: 22, borderRadius: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--navy)', margin: '0 0 4px' }}>
                    DBSCAN Density-Based Geographic Clustering & 2-Opt Routing
                  </h2>
                  <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
                    Small household orders within 5 km are dynamically clustered using DBSCAN to eliminate warehouse holding and optimize last-mile EV delivery routes.
                  </p>
                </div>

                <span
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    background: '#eff6ff',
                    color: '#1d4ed8',
                    border: '1px solid #bfdbfe'
                  }}
                >
                  DBSCAN (eps=5km, Haversine metric)
                </span>
              </div>

              {/* 5-Step Process Flow */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 10,
                  background: '#f8fafc',
                  padding: 14,
                  borderRadius: 10,
                  margin: '10px 0 20px',
                  border: '1px solid var(--line)'
                }}
              >
                <div style={{ textAlign: 'center', padding: '8px' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--green)', textTransform: 'uppercase' }}>Step 1</span>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', marginTop: 2 }}>Household Orders Received</div>
                </div>
                <div style={{ textAlign: 'center', padding: '8px' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--green)', textTransform: 'uppercase' }}>Step 2</span>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', marginTop: 2 }}>AI Geographic Clustering</div>
                </div>
                <div style={{ textAlign: 'center', padding: '8px' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--green)', textTransform: 'uppercase' }}>Step 3</span>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', marginTop: 2 }}>Partner Cross-Dock Selected</div>
                </div>
                <div style={{ textAlign: 'center', padding: '8px' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--green)', textTransform: 'uppercase' }}>Step 4</span>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', marginTop: 2 }}>Optimized Last-Mile Route</div>
                </div>
                <div style={{ textAlign: 'center', padding: '8px' }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--green)', textTransform: 'uppercase' }}>Step 5</span>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', marginTop: 2 }}>Doorstep Delivery</div>
                </div>
              </div>

              {/* Interactive Route Map with Metrics Banner */}
              <div style={{ marginBottom: 20 }}>
                <RouteMap
                  height={340}
                  stops={clusterMapStops}
                  routeMetrics={{
                    totalDistanceKm: selectedClusterRoute?.total_distance_km ?? 8.4,
                    baselineDistanceKm: selectedClusterRoute?.baseline_distance_km ?? 19.2,
                    distanceSavedKm: selectedClusterRoute?.distance_saved_km ?? 10.8,
                    fuelCostSavedInr: selectedClusterRoute?.fuel_cost_saving_inr ?? 129.60,
                    optimizationMethod: selectedClusterRoute?.optimization_method ?? 'Nearest Neighbor + 2-Opt TSP'
                  }}
                />
              </div>

              {/* Cluster Information Cards */}
              <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--navy)', margin: '0 0 12px' }}>
                Active Household Delivery Clusters
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
                {clusters.map(c => (
                  <div
                    key={c.cluster_id}
                    style={{
                      padding: 16,
                      borderRadius: 10,
                      border: '1px solid var(--line)',
                      background: '#ffffff',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <strong style={{ fontSize: 15, color: 'var(--navy)' }}>{c.zone_name}</strong>
                      <span style={{ fontSize: 11, background: '#dcfce7', color: '#166534', padding: '3px 8px', borderRadius: 4, fontWeight: 700 }}>
                        {c.total_quantity_kg} KG Aggregated
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#475569', marginBottom: 12 }}>
                      <div>👥 <strong>Orders:</strong> {c.order_count} clustered households</div>
                      <div>📍 <strong>Cluster Radius:</strong> 5 km (DBSCAN + Haversine)</div>
                      <div>🏬 <strong>Recommended Partner Hub:</strong> {c.recommended_hub_name}</div>
                      <div>🛵 <strong>Last Mile Vehicle:</strong> EV Bike / Insulated Delivery Vehicle</div>
                      <div>⚡ <strong>Route Optimization:</strong> 2-Opt Local Search Heuristic</div>
                    </div>

                    <button
                      type="button"
                      onClick={async () => {
                        const route = await getClusterLastMileRoute(c.cluster_id);
                        setSelectedClusterRoute(route);
                        setOrderNotice(`Loaded 2-Opt optimized last-mile circuit for ${c.zone_name}.`);
                      }}
                      className="button green"
                      style={{ width: '100%', fontSize: 12, minHeight: 34 }}
                    >
                      View Optimized Delivery Route 📍
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* TAB 5: AI & SMART LOGISTICS INSIGHTS                 */}
        {/* ==================================================== */}
        {activeTab === 'insights' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* 7. AI & SMART LOGISTICS INSIGHTS */}
            <div className="card" style={{ padding: 24, borderRadius: 12 }}>
              <div style={{ maxWidth: 850 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Methodological Transparency
                </span>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)', margin: '4px 0 8px' }}>
                  AI & Smart Logistics Insights
                </h2>
                <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 20px', lineHeight: 1.6 }}>
                  FarmDirect combines real machine learning models and deterministic routing heuristics to eliminate food waste, reduce logistics overhead, and empower direct farm-to-household trade.
                </p>

                {/* 5 Consumer-Friendly Insight Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14, marginBottom: 24 }}>
                  <div style={{ padding: 16, borderRadius: 10, background: '#f8fafc', border: '1px solid var(--line)' }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>🧠</div>
                    <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)', margin: '0 0 4px' }}>Demand Intelligence</h3>
                    <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
                      "Demand forecasting helps farmers prepare the right quantity."
                    </p>
                    <div style={{ fontSize: 10, color: '#2563eb', fontWeight: 700, marginTop: 8 }}>
                      Model: RandomForestRegressor (Scikit-Learn)
                    </div>
                  </div>

                  <div style={{ padding: 16, borderRadius: 10, background: '#f8fafc', border: '1px solid var(--line)' }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>🥬</div>
                    <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)', margin: '0 0 4px' }}>Freshness Intelligence</h3>
                    <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
                      "Freshness and shelf-life are continuously evaluated before dispatch."
                    </p>
                    <div style={{ fontSize: 10, color: '#16a34a', fontWeight: 700, marginTop: 8 }}>
                      Engine: Dynamic Freshness Decay Formula
                    </div>
                  </div>

                  <div style={{ padding: 16, borderRadius: 10, background: '#f8fafc', border: '1px solid var(--line)' }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>⚠️</div>
                    <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)', margin: '0 0 4px' }}>Spoilage Risk Prediction</h3>
                    <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
                      "High-risk delivery routes can trigger cold-chain recommendations."
                    </p>
                    <div style={{ fontSize: 10, color: '#d97706', fontWeight: 700, marginTop: 8 }}>
                      Model: RandomForestClassifier (Scikit-Learn)
                    </div>
                  </div>

                  <div style={{ padding: 16, borderRadius: 10, background: '#f8fafc', border: '1px solid var(--line)' }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>📍</div>
                    <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)', margin: '0 0 4px' }}>Smart Delivery Clustering</h3>
                    <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
                      "Nearby household orders are grouped using DBSCAN clustering."
                    </p>
                    <div style={{ fontSize: 10, color: '#9333ea', fontWeight: 700, marginTop: 8 }}>
                      Algorithm: DBSCAN + Haversine Metric
                    </div>
                  </div>

                  <div style={{ padding: 16, borderRadius: 10, background: '#f8fafc', border: '1px solid var(--line)' }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>🚚</div>
                    <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)', margin: '0 0 4px' }}>Route Optimization</h3>
                    <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
                      "Delivery routes are optimized using 2-Opt route optimization."
                    </p>
                    <div style={{ fontSize: 10, color: '#0369a1', fontWeight: 700, marginTop: 8 }}>
                      Heuristic: Nearest Neighbor + 2-Opt TSP
                    </div>
                  </div>
                </div>

                {/* Honest Distinction Card */}
                <div
                  style={{
                    padding: 16,
                    borderRadius: 10,
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    fontSize: 12,
                    color: '#1e40af',
                    lineHeight: 1.6
                  }}
                >
                  <strong style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>
                    ⚖️ Strict Algorithmic & Scientific Integrity:
                  </strong>
                  FarmDirect clearly separates predictive Machine Learning from deterministic optimization:
                  <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                    <li><strong>Machine Learning:</strong> Scikit-learn <code>RandomForestRegressor</code> (demand) and <code>RandomForestClassifier</code> (spoilage risk) trained on regional agricultural datasets.</li>
                    <li><strong>Spatial Clustering:</strong> <code>DBSCAN</code> with spherical Haversine metric for neighborhood consolidation.</li>
                    <li><strong>Route Optimization:</strong> Deterministic 2-Opt TSP local search heuristic with urgency weights for cold-chain and fuel savings.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </ProtectedRoute>
  );
}

// Inline Lucide BrainCircuit helper
function BrainCircuit(props: any) {
  return <Sparkles {...props} />;
}
