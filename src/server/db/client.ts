import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

import { getEnvironment } from "@/server/config/env";
import * as schema from "@/server/db/schema";

type AppDatabase = BetterSQLite3Database<typeof schema>;

interface DatabaseHandle {
  client: Database.Database;
  orm: AppDatabase;
}

declare global {
  var recipeAppDatabase: DatabaseHandle | undefined;
}

function resolveDatabasePath(configuredPath: string): string {
  if (configuredPath === ":memory:") return configuredPath;
  return isAbsolute(configuredPath)
    ? configuredPath
    : resolve(/* turbopackIgnore: true */ process.cwd(), configuredPath);
}

export function createDatabaseHandle(path = getEnvironment().DATABASE_PATH): DatabaseHandle {
  const databasePath = resolveDatabasePath(path);
  if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });

  const client = new Database(databasePath);
  client.pragma("foreign_keys = ON");
  if (databasePath !== ":memory:") client.pragma("journal_mode = WAL");

  return { client, orm: drizzle(client, { schema }) };
}

export function getDatabaseHandle(): DatabaseHandle {
  globalThis.recipeAppDatabase ??= createDatabaseHandle();
  return globalThis.recipeAppDatabase;
}
