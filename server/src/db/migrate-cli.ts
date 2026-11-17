import { config } from '../config.js';
import { createPool } from './pool.js';
import { migrate } from './migrate.js';

const db = createPool(config.databaseUrl);
await migrate(db);
await db.end();
console.log('Schema applied.');
