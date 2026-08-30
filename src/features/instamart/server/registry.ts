import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import type { HouseholdActor } from "@/server/auth/policy";

export interface PendingAuthorization {
  actorKey: string;
  clientId: string;
  codeVerifier: string;
  redirectUri: string;
  expiresAt: number;
}

export interface SwiggyTokenSession {
  accessToken: string;
  expiresAt: number;
}

export interface SwiggyConnection {
  client: Client;
  transport: StreamableHTTPClientTransport;
  tokenExpiresAt: number;
}

export function actorKey(actor: Pick<HouseholdActor, "householdId" | "userId">): string {
  return `${actor.householdId}:${actor.userId}`;
}

export class InstamartMemoryRegistry {
  readonly clientsByRedirectUri = new Map<string, string>();
  readonly pendingByState = new Map<string, PendingAuthorization>();
  readonly tokensByActor = new Map<string, SwiggyTokenSession>();
  readonly connectionsByActor = new Map<string, Promise<SwiggyConnection>>();

  getActiveToken(actor: Pick<HouseholdActor, "householdId" | "userId">, now = Date.now()): SwiggyTokenSession | null {
    const key = actorKey(actor);
    const token = this.tokensByActor.get(key);
    if (!token || token.expiresAt <= now + 60_000) {
      this.tokensByActor.delete(key);
      return null;
    }
    return token;
  }

  clearExpiredPending(now = Date.now()): void {
    for (const [state, pending] of this.pendingByState) {
      if (pending.expiresAt <= now) this.pendingByState.delete(state);
    }
  }

  consumePending(state: string): PendingAuthorization | null {
    const pending = this.pendingByState.get(state) ?? null;
    this.pendingByState.delete(state);
    return pending;
  }
}

declare global {
  var __recipeAppInstamartRegistry: InstamartMemoryRegistry | undefined;
}

export const instamartRegistry =
  globalThis.__recipeAppInstamartRegistry ??= new InstamartMemoryRegistry();

