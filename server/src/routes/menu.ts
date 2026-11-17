import { Router } from 'express';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { requireRole } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';

const itemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(40).default('coffee'),
  priceCents: z.number().int().min(0).max(100_000),
  active: z.boolean().default(true),
});

const toItem = (r: any) => ({
  id: r.id,
  name: r.name,
  category: r.category,
  priceCents: r.price_cents,
  active: r.active,
});

export function menuRoutes({ db }: AppDeps) {
  const router = Router();

  router.get('/', async (req, res) => {
    const includeInactive = req.query.all === 'true' && req.user?.role === 'manager';
    const { rows } = await db.query(
      `SELECT * FROM menu_items ${includeInactive ? '' : 'WHERE active'} ORDER BY category, name`,
    );
    res.json({ items: rows.map(toItem) });
  });

  router.post('/', requireRole('manager'), async (req, res) => {
    const item = itemSchema.parse(req.body);
    const { rows } = await db.query(
      'INSERT INTO menu_items (name, category, price_cents, active) VALUES ($1, $2, $3, $4) RETURNING *',
      [item.name, item.category, item.priceCents, item.active],
    );
    res.status(201).json({ item: toItem(rows[0]) });
  });

  router.patch('/:id', requireRole('manager'), async (req, res) => {
    const patch = itemSchema.partial().parse(req.body);
    const { rows } = await db.query(
      `UPDATE menu_items SET
         name = COALESCE($2, name),
         category = COALESCE($3, category),
         price_cents = COALESCE($4, price_cents),
         active = COALESCE($5, active)
       WHERE id = $1 RETURNING *`,
      [Number(req.params.id), patch.name, patch.category, patch.priceCents, patch.active],
    );
    if (!rows[0]) throw new HttpError(404, 'Menu item not found');
    res.json({ item: toItem(rows[0]) });
  });

  return router;
}
