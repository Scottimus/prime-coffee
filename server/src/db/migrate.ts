import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Db } from './pool.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Applies the idempotent schema. Small enough that a migration framework would be overkill for now. */
export async function migrate(db: Db): Promise<void> {
  // schema.sql sits next to this file in src/, and is copied next to it in dist/ by the build.
  const candidates = [path.join(here, 'schema.sql'), path.join(here, '../../src/db/schema.sql')];
  let sql: string | undefined;
  for (const file of candidates) {
    try {
      sql = await readFile(file, 'utf8');
      break;
    } catch {
      /* try next */
    }
  }
  if (!sql) throw new Error('schema.sql not found');
  await db.query(sql);
}
