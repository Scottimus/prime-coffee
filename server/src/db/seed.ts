import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { createPool, type Db } from './pool.js';
import { migrate } from './migrate.js';

export const SEED_PASSWORD = 'primecoffee';

export const SEED_USERS = [
  { name: 'Morgan Manager', email: 'manager@primecoffee.test', role: 'manager' },
  { name: 'Casey Cashier', email: 'cashier@primecoffee.test', role: 'cashier' },
  { name: 'Jordan Cashier', email: 'cashier2@primecoffee.test', role: 'cashier' },
  { name: 'Bailey Barista', email: 'barista@primecoffee.test', role: 'barista' },
  { name: 'Riley Barista', email: 'barista2@primecoffee.test', role: 'barista' },
] as const;

export const SEED_MENU = [
  { name: 'Espresso', category: 'coffee', priceCents: 300 },
  { name: 'Americano', category: 'coffee', priceCents: 350 },
  { name: 'Cappuccino', category: 'coffee', priceCents: 450 },
  { name: 'Latte', category: 'coffee', priceCents: 475 },
  { name: 'Flat White', category: 'coffee', priceCents: 450 },
  { name: 'Mocha', category: 'coffee', priceCents: 525 },
  { name: 'Cold Brew', category: 'cold', priceCents: 450 },
  { name: 'Iced Latte', category: 'cold', priceCents: 500 },
  { name: 'Chai Latte', category: 'tea', priceCents: 475 },
  { name: 'Matcha Latte', category: 'tea', priceCents: 525 },
  { name: 'Croissant', category: 'food', priceCents: 375 },
  { name: 'Blueberry Muffin', category: 'food', priceCents: 350 },
];

/** Idempotent: safe to run more than once. Existing users keep their passwords. */
export async function seed(db: Db): Promise<void> {
  await migrate(db);
  const hash = await bcrypt.hash(SEED_PASSWORD, 10);
  for (const u of SEED_USERS) {
    await db.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING`,
      [u.name, u.email, hash, u.role],
    );
  }
  for (const m of SEED_MENU) {
    await db.query(
      `INSERT INTO menu_items (name, category, price_cents) VALUES ($1, $2, $3)
       ON CONFLICT (name) DO NOTHING`,
      [m.name, m.category, m.priceCents],
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = createPool(config.databaseUrl);
  await seed(db);
  await db.end();
  console.log(`Seeded ${SEED_USERS.length} staff accounts (password "${SEED_PASSWORD}") and ${SEED_MENU.length} menu items.`);
}
