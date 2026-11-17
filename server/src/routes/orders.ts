import { Router } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { requireRole } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import { ORDER_STATUSES, type AuthUser } from '../types.js';
import type { EventStore, EventType } from '../events/store.js';

const createSchema = z.object({
  customerName: z.string().trim().min(1).max(80),
  notes: z.string().trim().max(500).optional(),
  items: z
    .array(
      z.object({
        menuItemId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(50),
        notes: z.string().trim().max(200).optional(),
      }),
    )
    .min(1, 'An order needs at least one item'),
});

const listSchema = z.object({
  status: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',') : undefined))
    .pipe(z.array(z.enum(ORDER_STATUSES)).optional()),
  completedBy: z.coerce.number().int().optional(),
  mine: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const ORDER_SELECT = `
  SELECT o.*,
         cu.name AS created_by_name,
         su.name AS started_by_name,
         du.name AS completed_by_name,
         xu.name AS cancelled_by_name,
         COALESCE(
           (SELECT json_agg(json_build_object(
              'id', i.id, 'menuItemId', i.menu_item_id, 'name', i.name,
              'quantity', i.quantity, 'unitPriceCents', i.unit_price_cents, 'notes', i.notes
            ) ORDER BY i.id)
            FROM order_items i WHERE i.order_id = o.id),
           '[]'::json) AS items
  FROM orders o
  JOIN users cu ON cu.id = o.created_by
  LEFT JOIN users su ON su.id = o.started_by
  LEFT JOIN users du ON du.id = o.completed_by
  LEFT JOIN users xu ON xu.id = o.cancelled_by`;

const ref = (id: number | null, name: string | null) => (id ? { id, name } : null);

export const toOrder = (r: any) => ({
  id: r.id,
  customerName: r.customer_name,
  notes: r.notes,
  status: r.status,
  totalCents: r.total_cents,
  items: r.items,
  createdBy: ref(r.created_by, r.created_by_name),
  startedBy: ref(r.started_by, r.started_by_name),
  completedBy: ref(r.completed_by, r.completed_by_name),
  cancelledBy: ref(r.cancelled_by, r.cancelled_by_name),
  createdAt: r.created_at,
  startedAt: r.started_at,
  completedAt: r.completed_at,
  cancelledAt: r.cancelled_at,
});

async function logEvent(events: EventStore, orderId: number, type: EventType, user: AuthUser, meta?: object) {
  try {
    await events.record({
      orderId,
      type,
      actor: { id: user.id, name: user.name, role: user.role },
      at: new Date(),
      meta: meta as Record<string, unknown>,
    });
  } catch (err) {
    // The audit log must never block service at the counter; Postgres already holds the state.
    console.warn(`Could not record ${type} for order ${orderId}:`, err);
  }
}

export function orderRoutes({ db, events }: AppDeps) {
  const router = Router();

  async function fetchOrder(id: number) {
    const { rows } = await db.query(`${ORDER_SELECT} WHERE o.id = $1`, [id]);
    return rows[0] ? toOrder(rows[0]) : null;
  }

  /** Explains why a status change was refused: 404 if missing, else 409 with the current state. */
  async function conflict(id: number, action: string): Promise<never> {
    const order = await fetchOrder(id);
    if (!order) throw new HttpError(404, 'Order not found');
    const who =
      order.status === 'in_progress' && order.startedBy ? ` (being made by ${order.startedBy.name})` : '';
    throw new HttpError(409, `Cannot ${action} order #${id}: it is ${order.status.replace('_', ' ')}${who}`);
  }

  router.get('/', async (req, res) => {
    const q = listSchema.parse(req.query);
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.status) {
      params.push(q.status);
      where.push(`o.status = ANY($${params.length})`);
    }
    if (q.completedBy) {
      params.push(q.completedBy);
      where.push(`o.completed_by = $${params.length}`);
    }
    if (q.mine === 'true') {
      params.push(req.user!.id);
      where.push(`(o.created_by = $${params.length} OR o.started_by = $${params.length} OR o.completed_by = $${params.length})`);
    }
    params.push(q.limit);
    // The queue is served oldest first; history is newest first.
    const queueOnly = q.status && q.status.every((s) => s === 'pending' || s === 'in_progress');
    const { rows } = await db.query(
      `${ORDER_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY o.created_at ${queueOnly ? 'ASC' : 'DESC'}, o.id ${queueOnly ? 'ASC' : 'DESC'}
       LIMIT $${params.length}`,
      params,
    );
    res.json({ orders: rows.map(toOrder) });
  });

  router.get('/:id', async (req, res) => {
    const order = await fetchOrder(Number(req.params.id));
    if (!order) throw new HttpError(404, 'Order not found');
    res.json({ order });
  });

  router.get('/:id/events', requireRole('manager'), async (req, res) => {
    res.json({ events: await events.forOrder(Number(req.params.id)) });
  });

  router.post('/', requireRole('cashier', 'manager'), async (req, res) => {
    const input = createSchema.parse(req.body);
    const ids = [...new Set(input.items.map((i) => i.menuItemId))];
    const client = await db.connect();
    let orderId: number;
    try {
      await client.query('BEGIN');
      const { rows: menu } = await client.query(
        'SELECT id, name, price_cents FROM menu_items WHERE id = ANY($1) AND active',
        [ids],
      );
      const byId = new Map(menu.map((m) => [m.id, m]));
      const missing = ids.filter((id) => !byId.has(id));
      if (missing.length) throw new HttpError(400, `Menu item(s) not available: ${missing.join(', ')}`);

      // Prices come from the menu, never from the client.
      const total = input.items.reduce((sum, i) => sum + byId.get(i.menuItemId).price_cents * i.quantity, 0);
      const { rows } = await client.query(
        'INSERT INTO orders (customer_name, notes, total_cents, created_by) VALUES ($1, $2, $3, $4) RETURNING id',
        [input.customerName, input.notes || null, total, req.user!.id],
      );
      orderId = rows[0].id;
      for (const item of input.items) {
        const m = byId.get(item.menuItemId);
        await client.query(
          `INSERT INTO order_items (order_id, menu_item_id, name, quantity, unit_price_cents, notes)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [orderId, m.id, m.name, item.quantity, m.price_cents, item.notes || null],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    const order = (await fetchOrder(orderId))!;
    await logEvent(events, orderId, 'order.created', req.user!, {
      customerName: order.customerName,
      totalCents: order.totalCents,
      items: order.items.map((i: any) => ({ name: i.name, quantity: i.quantity })),
    });
    res.status(201).json({ order });
  });

  // A barista claims a pending order. The conditional UPDATE makes the claim atomic,
  // so two baristas tapping at once cannot both get it.
  router.post('/:id/start', requireRole('barista'), async (req, res) => {
    const id = Number(req.params.id);
    const { rowCount } = await db.query(
      `UPDATE orders SET status = 'in_progress', started_by = $2, started_at = now()
       WHERE id = $1 AND status = 'pending'`,
      [id, req.user!.id],
    );
    if (!rowCount) await conflict(id, 'start');
    await logEvent(events, id, 'order.started', req.user!);
    res.json({ order: await fetchOrder(id) });
  });

  // Completing records the barista who finished the order. A barista can complete a pending
  // order directly, or one they started; not one another barista is making.
  router.post('/:id/complete', requireRole('barista'), async (req, res) => {
    const id = Number(req.params.id);
    const { rowCount } = await db.query(
      `UPDATE orders SET status = 'completed',
         started_by = COALESCE(started_by, $2), started_at = COALESCE(started_at, now()),
         completed_by = $2, completed_at = now()
       WHERE id = $1 AND (status = 'pending' OR (status = 'in_progress' AND started_by = $2))`,
      [id, req.user!.id],
    );
    if (!rowCount) await conflict(id, 'complete');
    const order = (await fetchOrder(id))!;
    const prepSeconds = Math.round((+new Date(order.completedAt) - +new Date(order.startedAt)) / 1000);
    await logEvent(events, id, 'order.completed', req.user!, { prepSeconds });
    res.json({ order });
  });

  // Cashiers can cancel orders nobody has started; managers can also cancel ones in progress.
  router.post('/:id/cancel', requireRole('cashier', 'manager'), async (req, res) => {
    const id = Number(req.params.id);
    const allowed = req.user!.role === 'manager' ? ['pending', 'in_progress'] : ['pending'];
    const reason = z.object({ reason: z.string().trim().max(200).optional() }).parse(req.body ?? {}).reason;
    const { rowCount } = await db.query(
      `UPDATE orders SET status = 'cancelled', cancelled_by = $2, cancelled_at = now()
       WHERE id = $1 AND status = ANY($3)`,
      [id, req.user!.id, allowed],
    );
    if (!rowCount) await conflict(id, 'cancel');
    await logEvent(events, id, 'order.cancelled', req.user!, reason ? { reason } : undefined);
    res.json({ order: await fetchOrder(id) });
  });

  return router;
}
