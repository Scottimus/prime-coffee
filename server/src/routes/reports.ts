import { Router } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { requireRole } from '../middleware/auth.js';

const rangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export function reportRoutes({ db, events }: AppDeps) {
  const router = Router();
  router.use(requireRole('manager'));

  // Orders completed per barista, with average prep time (start to finish). Orders marked done
  // straight from the queue have no separate start, so they are left out of the prep average.
  router.get('/baristas', async (req, res) => {
    const { from, to } = rangeSchema.parse(req.query);
    const { rows } = await db.query(
      `SELECT u.id, u.name, u.active,
              COUNT(o.id)::int AS completed,
              COALESCE(SUM(o.total_cents), 0)::int AS revenue_cents,
              ROUND(AVG(EXTRACT(EPOCH FROM (o.completed_at - o.started_at))) FILTER (WHERE o.completed_at > o.started_at))::int AS avg_prep_seconds,
              MAX(o.completed_at) AS last_completed_at
       FROM users u
       LEFT JOIN orders o ON o.completed_by = u.id
         AND ($1::timestamptz IS NULL OR o.completed_at >= $1)
         AND ($2::timestamptz IS NULL OR o.completed_at < $2)
       WHERE u.role = 'barista'
       GROUP BY u.id
       ORDER BY completed DESC, u.name`,
      [from ?? null, to ?? null],
    );
    res.json({
      baristas: rows.map((r) => ({
        id: r.id,
        name: r.name,
        active: r.active,
        completed: r.completed,
        revenueCents: r.revenue_cents,
        avgPrepSeconds: r.avg_prep_seconds,
        lastCompletedAt: r.last_completed_at,
      })),
    });
  });

  // Order counts by status since midnight (server time), for the dashboard header.
  router.get('/summary', async (_req, res) => {
    const { rows } = await db.query(
      `SELECT status, COUNT(*)::int AS count, COALESCE(SUM(total_cents), 0)::int AS total_cents
       FROM orders WHERE created_at >= date_trunc('day', now())
       GROUP BY status`,
    );
    const summary = { pending: 0, in_progress: 0, completed: 0, cancelled: 0, revenueCents: 0 };
    for (const r of rows) {
      summary[r.status as keyof typeof summary] = r.count;
      if (r.status === 'completed') summary.revenueCents = r.total_cents;
    }
    res.json({ summary });
  });

  router.get('/activity', async (req, res) => {
    const limit = z.coerce.number().int().min(1).max(200).default(50).parse(req.query.limit);
    res.json({ events: await events.recent(limit) });
  });

  return router;
}
