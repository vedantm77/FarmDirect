'use client';

import { useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredToken, getStoredUser } from '../lib/farmdirect-service';

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles: string[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    const token = getStoredToken();
    const user = getStoredUser();

    if (!token || !user) {
      // Unauthenticated -> redirect to login portal
      setIsAuthorized(false);
      router.replace('/');
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      // Role mismatch -> redirect to user's designated workspace
      setIsAuthorized(false);
      if (user.role === 'BUYER') {
        router.replace('/buyer/dashboard');
      } else if (user.role === 'CONSUMER') {
        router.replace('/consumer/dashboard');
      } else if (user.role === 'FARMER' || user.role === 'FPO') {
        router.replace('/farmer/dashboard');
      } else {
        router.replace('/');
      }
      return;
    }

    setIsAuthorized(true);
  }, [allowedRoles, router]);

  if (isAuthorized === null) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg, #f5f7f4)',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 38,
            height: 38,
            border: '3px solid #e2e8f0',
            borderTopColor: '#2b7a45',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 16px'
          }} />
          <p style={{ color: '#64748b', fontSize: 14, fontWeight: 500 }}>
            Verifying portal credentials…
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return null;
  }

  return <>{children}</>;
}
