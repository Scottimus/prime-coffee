import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth';

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  if (!user) return null;
  const links =
    user.role === 'manager'
      ? [
          ['/manager', 'Dashboard'],
          ['/cashier', 'Register'],
          ['/barista', 'Bar queue'],
        ]
      : [];
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>☕</span> Prime Coffee
        </div>
        <nav>
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} end={to !== '/manager'}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="who">
          <span>
            {user.name} <span className={`role role-${user.role}`}>{user.role}</span>
          </span>
          <button className="btn ghost" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
