import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { authenticate, signToken } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import type { AuthUser } from '../types.js';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export function authRoutes({ db, jwtSecret, jwtExpiresIn }: AppDeps) {
  const router = Router();

  router.post('/login', async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const { rows } = await db.query(
      'SELECT id, name, email, role, active, password_hash FROM users WHERE email = $1',
      [email],
    );
    const row = rows[0];
    const ok = row && row.active && (await bcrypt.compare(password, row.password_hash));
    if (!ok) throw new HttpError(401, 'Incorrect email or password');
    const user: AuthUser = { id: row.id, name: row.name, email: row.email, role: row.role };
    res.json({ token: signToken(user, jwtSecret, jwtExpiresIn), user });
  });

  router.get('/me', authenticate(jwtSecret), (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}
