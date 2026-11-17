import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import type { Db } from './db/pool.js';
import type { EventStore } from './events/store.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler } from './middleware/errors.js';
import { authRoutes } from './routes/auth.js';
import { menuRoutes } from './routes/menu.js';
import { orderRoutes } from './routes/orders.js';
import { userRoutes } from './routes/users.js';
import { reportRoutes } from './routes/reports.js';

export interface AppDeps {
  db: Db;
  events: EventStore;
  jwtSecret: string;
  jwtExpiresIn: string;
  corsOrigin?: string;
}

export function createApp(deps: AppDeps) {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: deps.corsOrigin ?? true }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', authRoutes(deps));

  const requireAuth = authenticate(deps.jwtSecret);
  app.use('/api/menu', requireAuth, menuRoutes(deps));
  app.use('/api/orders', requireAuth, orderRoutes(deps));
  app.use('/api/users', requireAuth, userRoutes(deps));
  app.use('/api/reports', requireAuth, reportRoutes(deps));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  app.use(errorHandler);
  return app;
}
