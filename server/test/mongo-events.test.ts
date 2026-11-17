import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoEventStore } from '../src/events/store.js';

// Runs against a real MongoDB when MONGO_TEST_URL is set (CI provides one; locally use `npm run db:up`).
const url = process.env.MONGO_TEST_URL;

describe.skipIf(!url)('MongoEventStore', () => {
  let store: MongoEventStore;
  const orderId = Math.floor(Math.random() * 1e9);

  beforeAll(async () => {
    store = await MongoEventStore.connect(url!, 'prime_coffee_test');
  });
  afterAll(async () => {
    await store?.close();
  });

  it('records events and returns an order timeline in order', async () => {
    const actor = { id: 1, name: 'Bailey Barista', role: 'barista' as const };
    await store.record({ orderId, type: 'order.created', actor, at: new Date('2026-01-01T10:00:00Z') });
    await store.record({ orderId, type: 'order.completed', actor, at: new Date('2026-01-01T10:03:00Z'), meta: { prepSeconds: 180 } });
    await store.record({ orderId, type: 'order.started', actor, at: new Date('2026-01-01T10:01:00Z') });

    const events = await store.forOrder(orderId);
    expect(events.map((e) => e.type)).toEqual(['order.created', 'order.started', 'order.completed']);
    expect(events[2].meta).toEqual({ prepSeconds: 180 });
    expect(events[0]).not.toHaveProperty('_id');
  });
});
