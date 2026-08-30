import { getDatabaseHandle } from "../src/server/db/client";
import { seedDemoData } from "../src/server/db/seed";

const { client } = getDatabaseHandle();
seedDemoData(client);
console.log("Deterministic demo data is ready.");
client.close();
