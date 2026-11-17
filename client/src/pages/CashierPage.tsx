import { useEffect, useMemo, useReducer, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth';
import { cartCount, cartReducer, cartTotal } from '../lib/cart';
import { money, time } from '../lib/format';
import { usePolling } from '../lib/usePolling';
import { StatusBadge } from '../components/StatusBadge';
import { OrderItems } from '../components/OrderItems';
import type { MenuItem, Order } from '../types';

export function CashierPage() {
  const { user } = useAuth();
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [cart, dispatch] = useReducer(cartReducer, []);
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    api<{ items: MenuItem[] }>('/menu').then((r) => setMenu(r.items));
  }, []);

  const recent = usePolling(
    () => api<{ orders: Order[] }>(`/orders?mine=true&limit=15`).then((r) => r.orders),
    5000,
  );

  const byCategory = useMemo(() => {
    const groups = new Map<string, MenuItem[]>();
    for (const item of menu) groups.set(item.category, [...(groups.get(item.category) ?? []), item]);
    return [...groups.entries()];
  }, [menu]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!cart.length) return;
    setBusy(true);
    setMessage(null);
    try {
      const { order } = await api<{ order: Order }>('/orders', {
        body: {
          customerName,
          notes: notes || undefined,
          items: cart.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity, notes: l.notes || undefined })),
        },
      });
      dispatch({ type: 'clear' });
      setCustomerName('');
      setNotes('');
      setMessage({ kind: 'ok', text: `Order #${order.id} for ${order.customerName} sent to the bar (${money(order.totalCents)}).` });
      recent.refresh();
    } catch (err) {
      setMessage({ kind: 'error', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function cancel(order: Order) {
    try {
      await api(`/orders/${order.id}/cancel`, { body: {} });
      recent.refresh();
    } catch (err) {
      setMessage({ kind: 'error', text: (err as Error).message });
    }
  }

  return (
    <div className="cashier">
      <section className="menu">
        <h2>Menu</h2>
        {byCategory.map(([category, items]) => (
          <div key={category}>
            <h3 className="category">{category}</h3>
            <div className="menu-grid">
              {items.map((item) => (
                <button key={item.id} className="menu-item" onClick={() => dispatch({ type: 'add', item })}>
                  <span>{item.name}</span>
                  <span className="price">{money(item.priceCents)}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="card cart">
        <h2>New order</h2>
        <form onSubmit={submit}>
          <label>
            Customer name
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required maxLength={80} />
          </label>
          {cart.length === 0 ? (
            <p className="muted">Tap menu items to add them.</p>
          ) : (
            <ul className="cart-lines">
              {cart.map((line) => (
                <li key={line.menuItemId}>
                  <div className="cart-row">
                    <span>{line.name}</span>
                    <span className="qty">
                      <button type="button" aria-label={`One less ${line.name}`} onClick={() => dispatch({ type: 'decrement', menuItemId: line.menuItemId })}>−</button>
                      {line.quantity}
                      <button type="button" aria-label={`One more ${line.name}`} onClick={() => dispatch({ type: 'add', item: menu.find((m) => m.id === line.menuItemId)! })}>+</button>
                    </span>
                    <span className="price">{money(line.unitPriceCents * line.quantity)}</span>
                  </div>
                  <input
                    className="line-notes"
                    placeholder="Notes (oat milk, extra shot…)"
                    value={line.notes}
                    onChange={(e) => dispatch({ type: 'notes', menuItemId: line.menuItemId, notes: e.target.value })}
                  />
                </li>
              ))}
            </ul>
          )}
          <label>
            Order notes
            <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
          </label>
          <div className="total">
            <span>{cartCount(cart)} items</span>
            <strong>{money(cartTotal(cart))}</strong>
          </div>
          {message && <p className={message.kind === 'ok' ? 'success' : 'error'} role="status">{message.text}</p>}
          <button className="btn primary block" disabled={busy || !cart.length}>
            {busy ? 'Sending…' : 'Send to barista'}
          </button>
        </form>
      </section>

      <section className="recent">
        <h2>Your recent orders</h2>
        {recent.error && <p className="error">{recent.error}</p>}
        {recent.data?.length === 0 && <p className="muted">No orders yet this shift.</p>}
        <ul className="order-list">
          {recent.data?.map((o) => (
            <li key={o.id} className="card order-row">
              <div className="order-head">
                <strong>#{o.id} {o.customerName}</strong>
                <StatusBadge status={o.status} />
              </div>
              <OrderItems items={o.items} />
              <div className="muted small">
                {time(o.createdAt)} · {money(o.totalCents)}
                {o.completedBy && <> · made by {o.completedBy.name}</>}
                {o.status === 'in_progress' && o.startedBy && <> · {o.startedBy.name} is on it</>}
              </div>
              {o.status === 'pending' && (o.createdBy.id === user?.id || user?.role === 'manager') && (
                <button className="btn ghost small" onClick={() => cancel(o)}>Cancel</button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
