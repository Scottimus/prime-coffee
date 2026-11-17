import request from 'supertest';
import { createApp } from '../src/app.js';
import { createPool } from '../src/db/pool.js';
import { seed, SEED_PASSWORD } from '../src/db/seed.js';
import { MemoryEventStore } from '../src/events/store.js';

export const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://prime:prime@localhost:5432/prime_coffee_test';

export async function setup() {
  const db = createPool(TEST_DB_URL);
  await db.query('DROP TABLE IF EXISTS order_items, orders, menu_items, users CASCADE');
  await seed(db);
  const events = new MemoryEventStore();
  const app = createApp({ db, events, jwtSecret: 'test-secret', jwtExpiresIn: '1h' });

  async function login(email: string) {
    const res = await request(app).post('/api/auth/login').send({ email, password: SEED_PASSWORD });
    if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`);
    return { token: res.body.token as string, user: res.body.user };
  }

  const [manager, cashier, barista, barista2] = await Promise.all([
    login('manager@primecoffee.test'),
    login('cashier@primecoffee.test'),
    login('barista@primecoffee.test'),
    login('barista2@primecoffee.test'),
  ]);

  const { rows } = await db.query('SELECT id, name, price_cents FROM menu_items ORDER BY id');
  const menu = rows as { id: number; name: string; price_cents: number }[];

  const as = (who: { token: string }) => ({
    get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${who.token}`),
    post: (url: string, body: object = {}) =>
      request(app).post(url).set('Authorization', `Bearer ${who.token}`).send(body),
    patch: (url: string, body: object) =>
      request(app).patch(url).set('Authorization', `Bearer ${who.token}`).send(body),
  });

  return { app, db, events, manager, cashier, barista, barista2, menu, as, login };
}
