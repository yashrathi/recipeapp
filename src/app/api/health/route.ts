import { NextResponse } from "next/server";

import { getDatabaseHandle } from "@/server/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { client } = getDatabaseHandle();
    client.prepare("SELECT 1").get();
    const migration = client
      .prepare("SELECT name FROM app_migrations ORDER BY name DESC LIMIT 1")
      .get() as { name: string } | undefined;

    return NextResponse.json({
      status: "ok",
      database: "ready",
      migration: migration?.name ?? null,
    });
  } catch {
    return NextResponse.json(
      { status: "degraded", database: "not_initialized" },
      { status: 503 },
    );
  }
}
