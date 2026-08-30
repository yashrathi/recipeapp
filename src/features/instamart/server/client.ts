import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import type { HouseholdActor } from "@/server/auth/policy";
import { InstamartSpikeError } from "@/features/instamart/server/errors";
import {
  actorKey,
  type InstamartMemoryRegistry,
  instamartRegistry,
  type SwiggyConnection,
} from "@/features/instamart/server/registry";

const MCP_URL = new URL("https://mcp.swiggy.com/im");
const ALLOWED_TOOLS = ["get_addresses", "search_products"] as const;
export type AllowedInstamartTool = (typeof ALLOWED_TOOLS)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function extractSwiggyEnvelope(result: unknown): Record<string, unknown> {
  if (!isRecord(result)) throw new InstamartSpikeError("INVALID_RESPONSE", "Swiggy returned an unreadable response.", 502);

  if (isRecord(result.structuredContent)) return result.structuredContent;
  if (Array.isArray(result.content)) {
    for (const block of result.content) {
      if (isRecord(block) && block.type === "text" && typeof block.text === "string") {
        try {
          const parsed: unknown = JSON.parse(block.text);
          if (isRecord(parsed)) return parsed;
        } catch {
          continue;
        }
      }
    }
  }
  throw new InstamartSpikeError("INVALID_RESPONSE", "Swiggy returned an unreadable response.", 502);
}

export function unwrapSwiggyData(result: unknown): unknown {
  const envelope = extractSwiggyEnvelope(result);
  if (envelope.success === false || (!("success" in envelope) && "error" in envelope)) {
    const message = isRecord(envelope.error) && typeof envelope.error.message === "string"
      ? envelope.error.message
      : "Swiggy could not complete the price lookup.";
    throw new InstamartSpikeError("SWIGGY_DOMAIN_ERROR", message, 422);
  }
  if ("data" in envelope) return envelope.data;
  if (envelope.success === true) {
    throw new InstamartSpikeError("INVALID_RESPONSE", "Swiggy returned an incomplete response.", 502);
  }
  return envelope;
}

export class InstamartReadOnlyClient {
  constructor(private readonly registry: InstamartMemoryRegistry = instamartRegistry) {}

  async call(actor: HouseholdActor, tool: AllowedInstamartTool, args: Record<string, unknown>): Promise<unknown> {
    if (!ALLOWED_TOOLS.includes(tool)) {
      throw new InstamartSpikeError("TOOL_NOT_ALLOWED", "This price checker cannot modify a Swiggy account.", 403);
    }

    try {
      const connection = await this.connectionFor(actor);
      return await connection.client.callTool({ name: tool, arguments: args }, undefined, { timeout: 30_000 });
    } catch (error) {
      if (error instanceof InstamartSpikeError) throw error;
      if (error instanceof StreamableHTTPError && error.code === 401) {
        await this.disconnect(actor);
        throw new InstamartSpikeError("SWIGGY_REAUTH_REQUIRED", "Reconnect Swiggy to continue.", 401);
      }
      throw new InstamartSpikeError("SWIGGY_UNAVAILABLE", "Swiggy prices are temporarily unavailable.", 502);
    }
  }

  async disconnect(actor: HouseholdActor): Promise<void> {
    const key = actorKey(actor);
    this.registry.tokensByActor.delete(key);
    const pending = this.registry.connectionsByActor.get(key);
    this.registry.connectionsByActor.delete(key);
    if (pending) {
      try {
        const connection = await pending;
        await connection.client.close();
      } catch {
        // The local connection is already unusable; removing it is sufficient.
      }
    }
  }

  private async connectionFor(actor: HouseholdActor): Promise<SwiggyConnection> {
    const token = this.registry.getActiveToken(actor);
    if (!token) {
      throw new InstamartSpikeError("SWIGGY_NOT_CONNECTED", "Connect Swiggy before checking prices.", 409);
    }

    const key = actorKey(actor);
    const existing = this.registry.connectionsByActor.get(key);
    if (existing) {
      const connection = await existing;
      if (connection.tokenExpiresAt === token.expiresAt) return connection;
      await connection.client.close();
      this.registry.connectionsByActor.delete(key);
    }

    const connecting = this.createConnection(token.accessToken, token.expiresAt);
    this.registry.connectionsByActor.set(key, connecting);
    try {
      return await connecting;
    } catch (error) {
      this.registry.connectionsByActor.delete(key);
      throw error;
    }
  }

  private async createConnection(accessToken: string, tokenExpiresAt: number): Promise<SwiggyConnection> {
    const transport = new StreamableHTTPClientTransport(MCP_URL, {
      requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const client = new Client({ name: "recipe-app-instamart-prices", version: "0.1.0" });
    await client.connect(transport);
    const tools = await client.listTools(undefined, { timeout: 30_000 });
    const available = new Set(tools.tools.map((tool) => tool.name));
    if (ALLOWED_TOOLS.some((tool) => !available.has(tool))) {
      await client.close();
      throw new InstamartSpikeError("CONTRACT_MISMATCH", "Swiggy's price tools do not match the published contract.", 502);
    }
    return { client, transport, tokenExpiresAt };
  }
}
