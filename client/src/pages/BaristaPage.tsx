import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth';
import { elapsed, time } from '../lib/format';
import { usePolling } from '../lib/usePolling';
import { OrderItems } from '../components/OrderItems';
import type { Order } from '../types';

export function BaristaPage() {
  const { user } = useAuth();
  const isBarista = user?.role === 'barista';
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const queue = usePolling(
    () => api<{ orders: Order[] }>('/orders?status=pending,in_progress').then((r) => r.orders),
    4000,
  );
  const done = usePolling(
    () =>
      user && isBarista
        ? api<{ orders: Order[] }>(`/orders?status=completed&completedBy=${user.id}&limit=10`).then((r) => r.orders)
        : Promise.resolve([] as Order[]),
    10000,
  );

  async function act(order: Order, action: 'start' | 'complete') {
    setBusyId(order.id);
    setError(null);
    try {
      await api(`/orders/${order.id}/${action}`, { body: {} });
      await queue.refresh();
      if (action === 'complete') await done.refresh();
    } catch (err) {
      setError((err as Error).message);
      queue.refresh();
    } finally {
      setBusyId(null);
    }
  }

  const orders = queue.data ?? [];
  const mine = orders.filter((o) => o.status === 'in_progress' && o.startedBy?.id === user?.id);
  const waiting = orders.filter((o) => o.status === 'pending');
  const others = orders.filter((o) => o.status === 'in_progress' && o.startedBy?.id !== user?.id);

  const column = (title: string, list: Order[], empty: string, render: (o: Order) => React.ReactNode) => (
    <section className="column">
      <h2>
        {title} <span className="count">{list.length}</span>
      </h2>
      {list.length === 0 && <p className="muted">{empty}</p>}
      {list.map((o) => (
        <article key={o.id} className={`card ticket ticket-${o.status}`}>
          <div className="order-head">
            <strong>#{o.id} {o.customerName}</strong>
            <span className="timer">{elapsed(o.createdAt, now)}</span>
          </div>
          <OrderItems items={o.items} />
          {o.notes && <p className="note">Note: {o.notes}</p>}
          {render(o)}
        </article>
      ))}
    </section>
  );

  return (
    <div className="barista">
      {!isBarista && <p className="info">You're viewing the bar queue as a manager. Only baristas can start and complete orders.</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {queue.error && <p className="error">{queue.error}</p>}
      <div className="board">
        {column('Waiting', waiting, 'No orders waiting. Nice work!', (o) =>
          isBarista ? (
            <div className="actions">
              <button className="btn primary" disabled={busyId === o.id} onClick={() => act(o, 'start')}>Start</button>
              <button className="btn ghost" disabled={busyId === o.id} onClick={() => act(o, 'complete')}>Done</button>
            </div>
          ) : (
            <p className="muted small">Taken by {o.createdBy.name}</p>
          ),
        )}
        {isBarista &&
          column('You are making', mine, 'Start an order from the queue.', (o) => (
            <div className="actions">
              <span className="muted small">Started {time(o.startedAt)}</span>
              <button className="btn success" disabled={busyId === o.id} onClick={() => act(o, 'complete')}>Mark complete</button>
            </div>
          ))}
        {column(isBarista ? 'Other baristas' : 'In progress', others, 'Nobody else is making anything.', (o) => (
          <p className="muted small">{o.startedBy?.name} · started {time(o.startedAt)}</p>
        ))}
      </div>
      {isBarista && (
        <section className="recent">
          <h2>Recently completed by you</h2>
          {done.data?.length === 0 && <p className="muted">Nothing yet this shift.</p>}
          <ul className="done-list">
            {done.data?.map((o) => (
              <li key={o.id}>
                #{o.id} {o.customerName} · {o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')} · {time(o.completedAt)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
