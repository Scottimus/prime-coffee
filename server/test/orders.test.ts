import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setup } from './helpers.js';

let ctx: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  ctx = await setup();
});
afterAll(async () => {
  await ctx.db.end();
});

async function placeOrder(customerName = 'Alex') {
  const [latte, croissant] = [ctx.menu[3], ctx.menu[10]];
  const res = await ctx.as(ctx.cashier).post('/api/orders', {
    customerName,
    items: [
      { menuItemId: latte.id, quantity: 2, notes: 'oat milk' },
      { menuItemId: croissant.id, quantity: 1 },
    ],
  });
  expect(res.status).toBe(201);
  return res.body.order;
}

describe('order workflow', () => {
  it('cashier creates an order priced from the menu', async () => {
    const order = await placeOrder();
    const [latte, croissant] = [ctx.menu[3], ctx.menu[10]];
    expect(order.status).toBe('pending');
    expect(order.createdBy).toEqual({ id: ctx.cashier.user.id, name: 'Casey Cashier' });
    expect(order.totalCents).toBe(latte.price_cents * 2 + croissant.price_cents);
    expect(order.items).toHaveLength(2);
    expect(order.items[0]).toMatchObject({ name: 'Latte', quantity: 2, notes: 'oat milk' });
  });

  it('rejects empty orders and unknown menu items', async () => {
    expect((await ctx.as(ctx.cashier).post('/api/orders', { customerName: 'A', items: [] })).status).toBe(400);
    const res = await ctx.as(ctx.cashier).post('/api/orders', {
      customerName: 'A',
      items: [{ menuItemId: 99999, quantity: 1 }],
    });
    expect(res.status).toBe(400);
  });

  it('baristas cannot create orders and cashiers cannot complete them', async () => {
    const res = await ctx.as(ctx.barista).post('/api/orders', {
      customerName: 'A',
      items: [{ menuItemId: ctx.menu[0].id, quantity: 1 }],
    });
    expect(res.status).toBe(403);
    const order = await placeOrder();
    expect((await ctx.as(ctx.cashier).post(`/api/orders/${order.id}/complete`)).status).toBe(403);
  });

  it('hands off to a barista and records who completed it', async () => {
    const order = await placeOrder('Sam');

    const queue = await ctx.as(ctx.barista).get('/api/orders?status=pending,in_progress');
    expect(queue.body.orders.map((o: any) => o.id)).toContain(order.id);

    const started = await ctx.as(ctx.barista).post(`/api/orders/${order.id}/start`);
    expect(started.status).toBe(200);
    expect(started.body.order).toMatchObject({ status: 'in_progress', startedBy: { name: 'Bailey Barista' } });

    const done = await ctx.as(ctx.barista).post(`/api/orders/${order.id}/complete`);
    expect(done.status).toBe(200);
    expect(done.body.order.status).toBe('completed');
    expect(done.body.order.completedBy).toEqual({ id: ctx.barista.user.id, name: 'Bailey Barista' });
    expect(done.body.order.completedAt).toBeTruthy();

    const { rows } = await ctx.db.query('SELECT completed_by FROM orders WHERE id = $1', [order.id]);
    expect(rows[0].completed_by).toBe(ctx.barista.user.id);
  });

  it('only one barista can claim an order, even when both tap at once', async () => {
    const order = await placeOrder();
    const results = await Promise.all([
      ctx.as(ctx.barista).post(`/api/orders/${order.id}/start`),
      ctx.as(ctx.barista2).post(`/api/orders/${order.id}/start`),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('a barista cannot complete an order another barista is making', async () => {
    const order = await placeOrder();
    await ctx.as(ctx.barista).post(`/api/orders/${order.id}/start`);
    const res = await ctx.as(ctx.barista2).post(`/api/orders/${order.id}/complete`);
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Bailey Barista');
  });

  it('a barista can complete a pending order in one step', async () => {
    const order = await placeOrder();
    const res = await ctx.as(ctx.barista2).post(`/api/orders/${order.id}/complete`);
    expect(res.status).toBe(200);
    expect(res.body.order.startedBy.name).toBe('Riley Barista');
    expect(res.body.order.completedBy.name).toBe('Riley Barista');
  });

  it('completed orders cannot be completed again', async () => {
    const order = await placeOrder();
    await ctx.as(ctx.barista).post(`/api/orders/${order.id}/complete`);
    expect((await ctx.as(ctx.barista).post(`/api/orders/${order.id}/complete`)).status).toBe(409);
    expect((await ctx.as(ctx.barista).post('/api/orders/999999/complete')).status).toBe(404);
  });

  it('cashiers cancel only pending orders; managers can cancel in-progress ones', async () => {
    const a = await placeOrder();
    expect((await ctx.as(ctx.cashier).post(`/api/orders/${a.id}/cancel`)).body.order.status).toBe('cancelled');

    const b = await placeOrder();
    await ctx.as(ctx.barista).post(`/api/orders/${b.id}/start`);
    expect((await ctx.as(ctx.cashier).post(`/api/orders/${b.id}/cancel`)).status).toBe(409);
    const res = await ctx.as(ctx.manager).post(`/api/orders/${b.id}/cancel`, { reason: 'customer left' });
    expect(res.status).toBe(200);
    expect(res.body.order.cancelledBy.name).toBe('Morgan Manager');
  });

  it('writes an audit trail of every step', async () => {
    const order = await placeOrder();
    await ctx.as(ctx.barista).post(`/api/orders/${order.id}/start`);
    await ctx.as(ctx.barista).post(`/api/orders/${order.id}/complete`);

    const res = await ctx.as(ctx.manager).get(`/api/orders/${order.id}/events`);
    expect(res.body.events.map((e: any) => e.type)).toEqual(['order.created', 'order.started', 'order.completed']);
    expect(res.body.events[2].actor).toMatchObject({ name: 'Bailey Barista', role: 'barista' });
    expect((await ctx.as(ctx.cashier).get(`/api/orders/${order.id}/events`)).status).toBe(403);
  });

  it('keeps taking orders if the event log fails', async () => {
    const original = ctx.events.record;
    ctx.events.record = async () => {
      throw new Error('mongo down');
    };
    try {
      await placeOrder();
    } finally {
      ctx.events.record = original;
    }
  });
});

describe('manager reports', () => {
  it('counts completed orders per barista', async () => {
    const res = await ctx.as(ctx.manager).get('/api/reports/baristas');
    expect(res.status).toBe(200);
    const bailey = res.body.baristas.find((b: any) => b.name === 'Bailey Barista');
    const { rows } = await ctx.db.query(
      'SELECT COUNT(*)::int AS n FROM orders WHERE completed_by = $1',
      [ctx.barista.user.id],
    );
    expect(bailey.completed).toBe(rows[0].n);
    expect(bailey.completed).toBeGreaterThan(0);
    expect(typeof bailey.avgPrepSeconds).toBe('number');
    // Riley only ever completed straight from the queue, so has no prep average.
    expect(res.body.baristas.find((b: any) => b.name === 'Riley Barista').avgPrepSeconds).toBeNull();
  });

  it('filters history by the barista who completed it', async () => {
    const res = await ctx.as(ctx.manager).get(`/api/orders?status=completed&completedBy=${ctx.barista2.user.id}`);
    expect(res.body.orders.length).toBeGreaterThan(0);
    expect(res.body.orders.every((o: any) => o.completedBy.id === ctx.barista2.user.id)).toBe(true);
  });

  it('summarises today and is manager-only', async () => {
    const res = await ctx.as(ctx.manager).get('/api/reports/summary');
    expect(res.body.summary.completed).toBeGreaterThan(0);
    expect((await ctx.as(ctx.barista).get('/api/reports/summary')).status).toBe(403);
  });
});

describe('menu', () => {
  it('managers can add and hide items; others cannot', async () => {
    const created = await ctx.as(ctx.manager).post('/api/menu', { name: 'Cortado', priceCents: 400 });
    expect(created.status).toBe(201);
    expect((await ctx.as(ctx.cashier).post('/api/menu', { name: 'X', priceCents: 1 })).status).toBe(403);

    await ctx.as(ctx.manager).patch(`/api/menu/${created.body.item.id}`, { active: false });
    const menu = await ctx.as(ctx.cashier).get('/api/menu');
    expect(menu.body.items.map((i: any) => i.name)).not.toContain('Cortado');
  });
});
