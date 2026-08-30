import { getDatabaseHandle } from "../src/server/db/client";
import { runMigrations } from "../src/server/db/migrate";

const { client } = getDatabaseHandle();
const applied = runMigrations(client);

console.log(applied.length ? `Applied migrations: ${applied.join(", ")}` : "Database is up to date.");
client.close();
