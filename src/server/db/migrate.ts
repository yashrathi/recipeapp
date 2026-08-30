import type Database from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function runMigrations(
  client: Database.Database,
  migrationsDirectory = join(process.cwd(), "db", "migrations"),
): string[] {
  client.exec(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const applied = new Set(
    client.prepare("SELECT name FROM app_migrations").all().map((row) => (row as { name: string }).name),
  );
  const pending = readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .filter((name) => !applied.has(name));

  const apply = client.transaction((name: string) => {
    client.exec(readFileSync(join(migrationsDirectory, name), "utf8"));
    client
      .prepare("INSERT INTO app_migrations (name, applied_at) VALUES (?, ?)")
      .run(name, new Date().toISOString());
  });

  pending.forEach((name) => apply(name));
  return pending;
}
