import { MongoClient, type Collection } from 'mongodb';
import type { Role } from '../types.js';

/**
 * Order events are an append-only audit trail of everything that happens to an order
 * (created, started, completed, cancelled). They live in MongoDB: the shape of each event's
 * metadata varies by type, it is write-heavy and never updated, and managers read it as a
 * per-order timeline. Postgres stays the source of truth for the order's current state.
 */
export const EVENT_TYPES = ['order.created', 'order.started', 'order.completed', 'order.cancelled'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface OrderEvent {
  orderId: number;
  type: EventType;
  actor: { id: number; name: string; role: Role };
  at: Date;
  meta?: Record<string, unknown>;
}

export interface EventStore {
  record(event: OrderEvent): Promise<void>;
  forOrder(orderId: number): Promise<OrderEvent[]>;
  recent(limit: number): Promise<OrderEvent[]>;
  close(): Promise<void>;
}

export class MongoEventStore implements EventStore {
  private constructor(
    private client: MongoClient,
    private events: Collection<OrderEvent>,
  ) {}

  static async connect(url: string, dbName: string): Promise<MongoEventStore> {
    const client = new MongoClient(url, { serverSelectionTimeoutMS: 3000 });
    await client.connect();
    const events = client.db(dbName).collection<OrderEvent>('order_events');
    await events.createIndex({ orderId: 1, at: 1 });
    await events.createIndex({ at: -1 });
    return new MongoEventStore(client, events);
  }

  async record(event: OrderEvent): Promise<void> {
    await this.events.insertOne({ ...event });
  }

  async forOrder(orderId: number): Promise<OrderEvent[]> {
    return this.events.find({ orderId }, { projection: { _id: 0 } }).sort({ at: 1 }).toArray();
  }

  async recent(limit: number): Promise<OrderEvent[]> {
    return this.events.find({}, { projection: { _id: 0 } }).sort({ at: -1 }).limit(limit).toArray();
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

/** Used by tests, and as a fallback so the shop keeps taking orders if MongoDB is down. */
export class MemoryEventStore implements EventStore {
  events: OrderEvent[] = [];

  async record(event: OrderEvent): Promise<void> {
    this.events.push(event);
  }

  async forOrder(orderId: number): Promise<OrderEvent[]> {
    return this.events.filter((e) => e.orderId === orderId);
  }

  async recent(limit: number): Promise<OrderEvent[]> {
    return [...this.events].reverse().slice(0, limit);
  }

  async close(): Promise<void> {}
}
