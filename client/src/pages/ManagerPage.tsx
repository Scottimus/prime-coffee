import { useEffect, useState, type FormEvent } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth';
import { dateTime, duration, money, time } from '../lib/format';
import { usePolling } from '../lib/usePolling';
import { StatusBadge } from '../components/StatusBadge';
import { OrderItems } from '../components/OrderItems';
import type { BaristaStats, MenuItem, Order, OrderEvent, OrderStatus, Role, User } from '../types';

export function ManagerPage() {
  return (
    <div className="manager">
      <nav className="tabs">
        <NavLink to="/manager" end>Overview</NavLink>
        <NavLink to="/manager/orders">Order history</NavLink>
        <NavLink to="/manager/staff">Staff</NavLink>
        <NavLink to="/manager/menu">Menu</NavLink>
      </nav>
      <Routes>
        <Route index element={<Overview />} />
        <Route path="orders" element={<OrderHistory />} />
        <Route path="staff" element={<Staff />} />
        <Route path="menu" element={<MenuAdmin />} />
      </Routes>
    </div>
  );
}

interface Summary {
  pending: number;
  in_progress: number;
  completed: number;
  cancelled: number;
  revenueCents: number;
}

const EVENT_LABEL: Record<string, string> = {
  'order.created': 'took',
  'order.started': 'started',
  'order.completed': 'completed',
  'order.cancelled': 'cancelled',
};

function Overview() {
  const summary = usePolling(() => api<{ summary: Summary }>('/reports/summary').then((r) => r.summary), 10000);
  const baristas = usePolling(() => api<{ baristas: BaristaStats[] }>('/reports/baristas').then((r) => r.baristas), 15000);
  const activity = usePolling(() => api<{ events: OrderEvent[] }>('/reports/activity?limit=15').then((r) => r.events), 5000);
  const s = summary.data;

  return (
    <div className="overview">
      <div className="stats">
        <Stat label="Waiting" value={s?.pending} />
        <Stat label="In progress" value={s?.in_progress} />
        <Stat label="Completed today" value={s?.completed} />
        <Stat label="Cancelled today" value={s?.cancelled} />
        <Stat label="Revenue today" value={s ? money(s.revenueCents) : undefined} />
      </div>
      <div className="two-col">
        <section className="card">
          <h2>Barista completions (all time)</h2>
          <table>
            <thead>
              <tr><th>Barista</th><th className="num">Completed</th><th className="num">Avg prep</th><th>Last order</th></tr>
            </thead>
            <tbody>
              {baristas.data?.map((b) => (
                <tr key={b.id} className={b.active ? '' : 'inactive'}>
                  <td>{b.name}{!b.active && ' (inactive)'}</td>
                  <td className="num">{b.completed}</td>
                  <td className="num">{duration(b.avgPrepSeconds)}</td>
                  <td>{dateTime(b.lastCompletedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card">
          <h2>Live activity</h2>
          {activity.data?.length === 0 && <p className="muted">No activity yet.</p>}
          <ul className="activity">
            {activity.data?.map((e, i) => (
              <li key={i}>
                <span className="muted small">{time(e.at)}</span> {e.actor.name} {EVENT_LABEL[e.type] ?? e.type} order #{e.orderId}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <div className="card stat">
      <div className="stat-value">{value ?? '…'}</div>
      <div className="muted small">{label}</div>
    </div>
  );
}

function OrderHistory() {
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [barista, setBarista] = useState('');
  const [selected, setSelected] = useState<Order | null>(null);
  const [baristas, setBaristas] = useState<BaristaStats[]>([]);

  useEffect(() => {
    api<{ baristas: BaristaStats[] }>('/reports/baristas').then((r) => setBaristas(r.baristas));
  }, []);

  const params = new URLSearchParams({ limit: '200' });
  if (status) params.set('status', status);
  if (barista) params.set('completedBy', barista);
  const orders = usePolling(() => api<{ orders: Order[] }>(`/orders?${params}`).then((r) => r.orders), 10000);
  useEffect(() => {
    orders.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, barista]);

  return (
    <div>
      <div className="filters">
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus | '')}>
            <option value="">All</option>
            <option value="pending">Waiting</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label>
          Completed by
          <select value={barista} onChange={(e) => setBarista(e.target.value)}>
            <option value="">Anyone</option>
            {baristas.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="table-wrap card">
        <table>
          <thead>
            <tr>
              <th>#</th><th>Customer</th><th>Status</th><th className="num">Total</th>
              <th>Taken by</th><th>Completed by</th><th>Placed</th><th>Completed</th>
            </tr>
          </thead>
          <tbody>
            {orders.data?.map((o) => (
              <tr key={o.id} className="clickable" onClick={() => setSelected(o)}>
                <td>{o.id}</td>
                <td>{o.customerName}</td>
                <td><StatusBadge status={o.status} /></td>
                <td className="num">{money(o.totalCents)}</td>
                <td>{o.createdBy.name}</td>
                <td>{o.completedBy?.name ?? '—'}</td>
                <td>{dateTime(o.createdAt)}</td>
                <td>{dateTime(o.completedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {orders.data?.length === 0 && <p className="muted center">No orders match.</p>}
      </div>
      {selected && <OrderDetail order={selected} onClose={() => setSelected(null)} onChanged={orders.refresh} />}
    </div>
  );
}

function OrderDetail({ order, onClose, onChanged }: { order: Order; onClose: () => void; onChanged: () => void }) {
  const [events, setEvents] = useState<OrderEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ events: OrderEvent[] }>(`/orders/${order.id}/events`).then((r) => setEvents(r.events));
  }, [order.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function cancel() {
    try {
      await api(`/orders/${order.id}/cancel`, { body: { reason: 'Cancelled by manager' } });
      onChanged();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal" role="dialog" aria-label={`Order ${order.id}`} onClick={(e) => e.stopPropagation()}>
        <div className="order-head">
          <h2>#{order.id} {order.customerName}</h2>
          <StatusBadge status={order.status} />
        </div>
        <OrderItems items={order.items} />
        {order.notes && <p className="note">Note: {order.notes}</p>}
        <p><strong>{money(order.totalCents)}</strong></p>
        <h3>Timeline</h3>
        {events === null ? (
          <p className="muted">Loading…</p>
        ) : events.length === 0 ? (
          <p className="muted">No events recorded.</p>
        ) : (
          <ol className="timeline">
            {events.map((e, i) => (
              <li key={i}>
                <span className="muted small">{dateTime(e.at)}</span> {e.actor.name} ({e.actor.role}) {EVENT_LABEL[e.type] ?? e.type} the order
                {typeof e.meta?.prepSeconds === 'number' && <> in {duration(e.meta.prepSeconds)}</>}
                {typeof e.meta?.reason === 'string' && <>: {e.meta.reason}</>}
              </li>
            ))}
          </ol>
        )}
        {error && <p className="error">{error}</p>}
        <div className="actions">
          {(order.status === 'pending' || order.status === 'in_progress') && (
            <button className="btn danger" onClick={cancel}>Cancel order</button>
          )}
          <button className="btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function Staff() {
  const { user: me } = useAuth();
  const staff = usePolling(() => api<{ users: User[] }>('/users').then((r) => r.users), 0);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'barista' as Role });
  const [error, setError] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api('/users', { body: form });
      setForm({ name: '', email: '', password: '', role: 'barista' });
      staff.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function update(id: number, patch: Partial<User>) {
    setError(null);
    try {
      await api(`/users/${id}`, { method: 'PATCH', body: patch });
      staff.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="two-col">
      <section className="card">
        <h2>Staff</h2>
        {error && <p className="error">{error}</p>}
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead>
          <tbody>
            {staff.data?.map((u) => (
              <tr key={u.id} className={u.active ? '' : 'inactive'}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  <select value={u.role} disabled={u.id === me?.id} onChange={(e) => update(u.id, { role: e.target.value as Role })}>
                    <option value="cashier">Cashier</option>
                    <option value="barista">Barista</option>
                    <option value="manager">Manager</option>
                  </select>
                </td>
                <td>
                  <button className="btn ghost small" disabled={u.id === me?.id} onClick={() => update(u.id, { active: !u.active })}>
                    {u.active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card">
        <h2>Add staff member</h2>
        <form onSubmit={add}>
          <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
          <label>
            Temporary password
            <input type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </label>
          <label>
            Role
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="cashier">Cashier</option>
              <option value="barista">Barista</option>
              <option value="manager">Manager</option>
            </select>
          </label>
          <button className="btn primary">Add</button>
        </form>
      </section>
    </div>
  );
}

function MenuAdmin() {
  const menu = usePolling(() => api<{ items: MenuItem[] }>('/menu?all=true').then((r) => r.items), 0);
  const [form, setForm] = useState({ name: '', category: 'coffee', price: '' });
  const [error, setError] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api('/menu', { body: { name: form.name, category: form.category, priceCents: Math.round(Number(form.price) * 100) } });
      setForm({ name: '', category: form.category, price: '' });
      menu.refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function toggle(item: MenuItem) {
    await api(`/menu/${item.id}`, { method: 'PATCH', body: { active: !item.active } });
    menu.refresh();
  }

  return (
    <div className="two-col">
      <section className="card">
        <h2>Menu</h2>
        <table>
          <thead><tr><th>Item</th><th>Category</th><th className="num">Price</th><th /></tr></thead>
          <tbody>
            {menu.data?.map((m) => (
              <tr key={m.id} className={m.active ? '' : 'inactive'}>
                <td>{m.name}</td>
                <td>{m.category}</td>
                <td className="num">{money(m.priceCents)}</td>
                <td><button className="btn ghost small" onClick={() => toggle(m)}>{m.active ? 'Hide' : 'Show'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card">
        <h2>Add menu item</h2>
        <form onSubmit={add}>
          <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label>Category<input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required /></label>
          <label>Price ($)<input type="number" min="0" step="0.05" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required /></label>
          {error && <p className="error">{error}</p>}
          <button className="btn primary">Add</button>
        </form>
      </section>
    </div>
  );
}
