import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { homeFor, useAuth } from './auth';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { CashierPage } from './pages/CashierPage';
import { BaristaPage } from './pages/BaristaPage';
import { ManagerPage } from './pages/ManagerPage';
import type { Role } from './types';

function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="center muted">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <Layout>{children}</Layout>;
}

export function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={homeFor(user.role)} replace /> : <LoginPage />} />
      <Route path="/cashier" element={<RequireRole roles={['cashier', 'manager']}><CashierPage /></RequireRole>} />
      <Route path="/barista" element={<RequireRole roles={['barista', 'manager']}><BaristaPage /></RequireRole>} />
      <Route path="/manager/*" element={<RequireRole roles={['manager']}><ManagerPage /></RequireRole>} />
      <Route path="*" element={<Navigate to={user ? homeFor(user.role) : '/login'} replace />} />
    </Routes>
  );
}
