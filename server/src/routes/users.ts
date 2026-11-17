import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { requireRole } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import { ROLES } from '../types.js';

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
  role: z.enum(ROLES),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  role: z.enum(ROLES).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

const toUser = (r: any) => ({
  id: r.id,
  name: r.name,
  email: r.email,
  role: r.role,
  active: r.active,
  createdAt: r.created_at,
});

export function userRoutes({ db }: AppDeps) {
  const router = Router();
  router.use(requireRole('manager'));

  router.get('/', async (_req, res) => {
    const { rows } = await db.query('SELECT * FROM users ORDER BY role, name');
    res.json({ users: rows.map(toUser) });
  });

  router.post('/', async (req, res) => {
    const input = createSchema.parse(req.body);
    const hash = await bcrypt.hash(input.password, 10);
    try {
      const { rows } = await db.query(
        'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING *',
        [input.name, input.email, hash, input.role],
      );
      res.status(201).json({ user: toUser(rows[0]) });
    } catch (err: any) {
      if (err.code === '23505') throw new HttpError(409, 'A staff member with that email already exists');
      throw err;
    }
  });

  router.patch('/:id', async (req, res) => {
    const id = Number(req.params.id);
    const input = updateSchema.parse(req.body);
    if (id === req.user!.id && (input.active === false || (input.role && input.role !== 'manager'))) {
      throw new HttpError(400, 'You cannot deactivate yourself or remove your own manager role');
    }
    const hash = input.password ? await bcrypt.hash(input.password, 10) : null;
    const { rows } = await db.query(
      `UPDATE users SET
         name = COALESCE($2, name),
         role = COALESCE($3, role),
         active = COALESCE($4, active),
         password_hash = COALESCE($5, password_hash)
       WHERE id = $1 RETURNING *`,
      [id, input.name, input.role, input.active, hash],
    );
    if (!rows[0]) throw new HttpError(404, 'Staff member not found');
    res.json({ user: toUser(rows[0]) });
  });

  return router;
}
