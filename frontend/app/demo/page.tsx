'use client';

import { useState } from 'react';
import RouteMap from '../../components/RouteMap';

const workflowSteps = [
  {
    title: 'Farmer Registration & Produce Listing',
    actor: 'FARMER / FPO',
    endpoint: 'POST /produce',
    description: 'Farmers and FPOs publish verified produce supply with quantities, asking prices, quality grades, digital 7-12 land records, and GPS coordinates.',
    actionUrl: '/farmer/produce/new',
    actionText: 'Open Add Produce Form →'
  },
  {
    title: 'Bulk Buyer / Consumer Demand Placement',
    actor: 'BULK BUYER / CONSUMER',
    endpoint: 'POST /demands',
    description: 'Institutional buyers and consumers specify required crop, volume (kg), maximum budget, quality grade, and delivery destination.',
    actionUrl: '/buyer/dashboard',
    actionText: 'Open Demand Placement →'
  },
  {
    title: 'AI Multi-Factor Matching & Allocation',
    actor: 'SYSTEM ALGORITHM',
    endpoint: 'POST /matching/run',
    description: 'Calculates transparent match score: Distance (30%), Price (20%), Quantity (15%), Quality (15%), Readiness (10%), Reliability (10%). Dynamically aggregates multi-farm supply if no single farm can fulfill the total volume.',
    actionUrl: '/buyer/dashboard',
    actionText: 'Run Live Matching →'
  },
  {
    title: 'Statutory Direct-Sale Compliance Assessment',
    actor: 'REGULATORY ENGINE',
    endpoint: 'POST /compliance/check',
    description: 'Validates transaction against state agricultural marketing regulations (e.g. Maharashtra direct-marketing exemption rules) to ensure exemption from intermediary APMC mandi cess.',
    actionUrl: '/buyer/dashboard',
    actionText: 'View Compliance Verification →'
  },
  {
    title: 'Order Commitment & Farmer Allocation Response',
    actor: 'BUYER & PRODUCER',
    endpoint: 'POST /orders & /allocations/respond',
    description: 'Buyer locks order. System creates individual allocation items for each farm. Farmers accept allocations and signal when crates are ready for pickup.',
    actionUrl: '/farmer/matches',
    actionText: 'View Farmer Allocations →'
  },
  {
    title: '3PL Freight Orchestration & Route Optimization',
    actor: 'LOGISTICS 3PL',
    endpoint: 'POST /logistics/request & /select',
    description: 'Independent third-party freight partners offer competitive vehicle quotes. Generates optimized multi-stop collection circuit sequence.',
    actionUrl: '/buyer/dashboard',
    actionText: 'Inspect 3PL Quotes →'
  },
  {
    title: 'Live Milestone Tracking & Farmer Reliability Rating',
    actor: 'BUYER & 3PL',
    endpoint: 'POST /tracking/next & /ratings',
    description: 'GPS milestones track pickup from each participating farm to buyer destination. Once delivered, buyer submits 1-5 star feedback updating farmer reliability scores in real time.',
    actionUrl: '/buyer/dashboard',
    actionText: 'Open Tracking & Feedback →'
  }
];

export default function ArchitectureGuide() {
  const [activeStep, setActiveStep] = useState<number>(0);

  return (
    <main className="app">
      <nav className="nav">
        <div className="brand" onClick={() => window.location.href = '/'} style={{ cursor: 'pointer' }}>
          <i />FarmDirect
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <a href="/buyer/dashboard" className="tag" style={{ textDecoration: 'none' }}>Buyer Dashboard →</a>
          <a href="/farmer/dashboard" className="tag" style={{ textDecoration: 'none' }}>Farmer Portal →</a>
          <span className="pill" style={{ background: '#dcfce7', color: '#166534' }}>
            SYSTEM ARCHITECTURE
          </span>
        </div>
      </nav>

      <section className="hero">
        <div className="panel">
          <span className="tag">END-TO-END SYSTEM GUIDE</span>
          <h1>Direct Farm-to-Buyer<br /><span>Platform Architecture</span><br />Full Lifecycle</h1>
          <p>
            Explore each operational component of the FarmDirect platform: transparent matching, statutory compliance review,
            multi-farm bulk allocation, 3PL orchestration, and real-time state persistence.
          </p>

          <div className="actions" style={{ marginTop: 16 }}>
            <a href={workflowSteps[activeStep].actionUrl} style={{ textDecoration: 'none' }}>
              <button className="button green">
                {workflowSteps[activeStep].actionText}
              </button>
            </a>
            <button className="button" onClick={() => setActiveStep((activeStep + 1) % workflowSteps.length)}>
              Next Architecture Step →
            </button>
          </div>

          <div className="status" style={{ marginTop: 16, borderLeft: '4px solid var(--green)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="tag" style={{ background: '#dcfce7', color: '#166534' }}>
                {workflowSteps[activeStep].actor}
              </span>
              <code style={{ fontSize: 12, color: 'var(--muted)' }}>{workflowSteps[activeStep].endpoint}</code>
            </div>
            <h3 style={{ margin: '6px 0 4px' }}>{workflowSteps[activeStep].title}</h3>
            <p style={{ margin: '4px 0', fontSize: 13 }}>{workflowSteps[activeStep].description}</p>
          </div>

          <div style={{ marginTop: 14 }}>
            <RouteMap height={200} />
          </div>
        </div>

        <div className="panel flow">
          <h3>Platform Workflow Stages ({workflowSteps.length})</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {workflowSteps.map((x, i) => {
              const isCurrent = i === activeStep;
              return (
                <div
                  className="node"
                  key={x.title}
                  onClick={() => setActiveStep(i)}
                  style={{
                    cursor: 'pointer',
                    border: isCurrent ? '2px solid #86efac' : '1px solid rgba(255,255,255,0.15)',
                    background: isCurrent ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)',
                    padding: '8px 12px',
                    borderRadius: 8
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>STAGE {i + 1}</strong>
                    <span className="tag" style={{ fontSize: 10, background: '#dcfce7', color: '#166534' }}>{x.actor}</span>
                  </div>
                  <div style={{ fontSize: 13, marginTop: 2 }}>{x.title}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
