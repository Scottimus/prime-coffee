import { config } from './config.js';
import { createApp } from './app.js';
import { createPool } from './db/pool.js';
import { migrate } from './db/migrate.js';
import { MemoryEventStore, MongoEventStore, type EventStore } from './events/store.js';

const db = createPool(config.databaseUrl);
await migrate(db);

let events: EventStore;
try {
  events = await MongoEventStore.connect(config.mongoUrl, config.mongoDb);
  console.log('Connected to MongoDB for the order event log');
} catch (err) {
  console.warn('MongoDB unavailable, order events will be kept in memory only:', (err as Error).message);
  events = new MemoryEventStore();
}

const app = createApp({ db, events, jwtSecret: config.jwtSecret, jwtExpiresIn: config.jwtExpiresIn, corsOrigin: config.corsOrigin });
const server = app.listen(config.port, () => {
  console.log(`Prime Coffee API listening on http://localhost:${config.port}`);
});

async function shutdown() {
  server.close();
  await Promise.allSettled([db.end(), events.close()]);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
