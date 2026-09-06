'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authenticateUser, getStoredUser } from '../lib/farmdirect-service';

type PortalRole = 'FARMER' | 'BUYER';

export default function AuthPortal() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<PortalRole>('FARMER');
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showJudgeHelp, setShowJudgeHelp] = useState(false);

  // Check if already authenticated
  useEffect(() => {
    const user = getStoredUser();
    if (user && user.role) {
      if (user.role === 'BUYER') {
        router.replace('/buyer/dashboard');
      } else if (user.role === 'FARMER' || user.role === 'FPO') {
        router.replace('/farmer/dashboard');
      }
    }
  }, [router]);

  // When tab changes, clear errors and reset password
  const handleTabChange = (tab: PortalRole) => {
    setActiveTab(tab);
    setError('');
    // Clear fields or let user re-enter
    setUserId('');
    setPassword('');
  };

  const fillQuickCredentials = (role: PortalRole) => {
    setActiveTab(role);
    if (role === 'FARMER') {
      setUserId('farmer');
      setPassword('farmer123');
    } else {
      setUserId('buyer');
      setPassword('buyer123');
    }
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanId = userId.trim();
    const cleanPass = password.trim();

    if (!cleanId) {
      setError('Please enter your User ID.');
      return;
    }
    if (!cleanPass) {
      setError('Please enter your Password.');
      return;
    }

    setLoading(true);

    try {
      const res = await authenticateUser(cleanId, cleanPass);
      if (res.error || !res.user) {
        setError(res.error || 'Invalid credentials. Please verify your User ID and Password.');
        setLoading(false);
        return;
      }

      // Check role alignment
      const userRole = res.user.role;
      if (activeTab === 'FARMER' && userRole === 'BUYER') {
        setError('This account is registered as a Bulk Buyer. Please switch to the Bulk Buyer Portal tab.');
        setLoading(false);
        return;
      }
      if (activeTab === 'BUYER' && (userRole === 'FARMER' || userRole === 'FPO')) {
        setError('This account is registered as a Farmer / FPO. Please switch to the Farmer / FPO Portal tab.');
        setLoading(false);
        return;
      }

      // Route to designated workspace
      if (userRole === 'BUYER') {
        router.push('/buyer/dashboard');
      } else {
        router.push('/farmer/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="auth-portal-wrapper">
      {/* Background ambient elements */}
      <div className="auth-bg-overlay" />

      <main className="auth-portal-card-container">
        <div className="auth-portal-card">
          {/* Brand Header */}
          <div className="auth-card-header">
            <div className="auth-logo-badge">
              <svg
                className="auth-logo-svg"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 3C8 3 4 7 4 12C4 16.5 7.5 20 12 20C16.5 20 20 16.5 20 12C20 7 16 3 12 3Z"
                  stroke="#2b7a45"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M12 8V16M8 12C8 9.8 9.8 8 12 8C14.2 8 16 9.8 16 12C16 14.2 14.2 16 12 16"
                  stroke="#2b7a45"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="auth-brand-name">FarmDirect</span>
            </div>
            <h1 className="auth-brand-subtitle">Direct Farm-to-Buyer Platform</h1>
            <p className="auth-brand-tagline">Smart agricultural trade starts here.</p>
          </div>

          {/* Portal Tabs */}
          <div className="auth-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'FARMER'}
              className={`auth-tab-btn ${activeTab === 'FARMER' ? 'active' : ''}`}
              onClick={() => handleTabChange('FARMER')}
            >
              <span className="auth-tab-icon">👨‍🌾</span>
              <span className="auth-tab-label">Farmer / FPO Portal</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'BUYER'}
              className={`auth-tab-btn ${activeTab === 'BUYER' ? 'active' : ''}`}
              onClick={() => handleTabChange('BUYER')}
            >
              <span className="auth-tab-icon">🏢</span>
              <span className="auth-tab-label">Bulk Buyer Portal</span>
            </button>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="auth-error-banner" role="alert">
              <svg className="auth-error-icon" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Login Form */}
          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <div className="auth-field-group">
              <label htmlFor="auth-user-id" className="auth-label">
                USER ID
              </label>
              <div className="auth-input-wrapper">
                <input
                  id="auth-user-id"
                  name="username"
                  type="text"
                  autoComplete="username"
                  required
                  className="auth-input"
                  placeholder="Enter your User ID"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="auth-field-group">
              <label htmlFor="auth-password" className="auth-label">
                PASSWORD
              </label>
              <div className="auth-input-wrapper">
                <input
                  id="auth-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  className="auth-input has-toggle"
                  placeholder="Enter your Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="auth-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="auth-submit-btn"
              disabled={loading}
            >
              {loading ? (
                <span className="auth-loading-spinner-wrapper">
                  <span className="auth-spinner" />
                  <span>Signing In…</span>
                </span>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </form>

          {/* Presentation Access Collapsible for Judges */}
          <div className="auth-presentation-helper">
            <button
              type="button"
              className="auth-helper-toggle"
              onClick={() => setShowJudgeHelp(!showJudgeHelp)}
            >
              <span>Presentation Access Credentials</span>
              <span className={`auth-helper-chevron ${showJudgeHelp ? 'open' : ''}`}>▼</span>
            </button>

            {showJudgeHelp && (
              <div className="auth-helper-content">
                <div className="auth-helper-row">
                  <div className="auth-helper-info">
                    <span className="auth-helper-badge farmer">👨‍🌾 Farmer / FPO</span>
                    <code>farmer</code> / <code>farmer123</code>
                  </div>
                  <button
                    type="button"
                    className="auth-helper-apply-btn"
                    onClick={() => fillQuickCredentials('FARMER')}
                  >
                    Use
                  </button>
                </div>

                <div className="auth-helper-row">
                  <div className="auth-helper-info">
                    <span className="auth-helper-badge buyer">🏢 Bulk Buyer</span>
                    <code>buyer</code> / <code>buyer123</code>
                  </div>
                  <button
                    type="button"
                    className="auth-helper-apply-btn"
                    onClick={() => fillQuickCredentials('BUYER')}
                  >
                    Use
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer Security Note */}
          <div className="auth-card-footer">
            <span className="auth-lock-icon">🔒</span>
            <span>Secure role-based platform access</span>
          </div>
        </div>
      </main>
    </div>
  );
}
