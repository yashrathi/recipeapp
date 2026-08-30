import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

import type { HouseholdActor } from "@/server/auth/policy";
import { InstamartSpikeError } from "@/features/instamart/server/errors";
import {
  actorKey,
  type InstamartMemoryRegistry,
  instamartRegistry,
} from "@/features/instamart/server/registry";

const MCP_RESOURCE = "https://mcp.swiggy.com/im";
const REGISTER_URL = "https://mcp.swiggy.com/auth/register";
const AUTHORIZE_URL = "https://mcp.swiggy.com/auth/authorize";
const TOKEN_URL = "https://mcp.swiggy.com/auth/token";
const STATE_LIFETIME_MS = 10 * 60 * 1000;

const RegistrationResponseSchema = z.object({ client_id: z.string().min(1) });
const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
});

interface OAuthDependencies {
  fetch: typeof fetch;
  now: () => number;
  random: (bytes: number) => Buffer;
}

const defaultDependencies: OAuthDependencies = {
  fetch,
  now: Date.now,
  random: randomBytes,
};

export class SwiggyOAuthService {
  constructor(
    private readonly registry: InstamartMemoryRegistry = instamartRegistry,
    private readonly dependencies: OAuthDependencies = defaultDependencies,
  ) {}

  async begin(actor: HouseholdActor & { role: "homeowner" }, redirectUri: string): Promise<URL> {
    this.registry.clearExpiredPending(this.dependencies.now());
    const clientId = await this.getOrRegisterClient(redirectUri);
    const codeVerifier = this.dependencies.random(32).toString("base64url");
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
    const state = this.dependencies.random(32).toString("base64url");

    this.registry.pendingByState.set(state, {
      actorKey: actorKey(actor),
      clientId,
      codeVerifier,
      redirectUri,
      expiresAt: this.dependencies.now() + STATE_LIFETIME_MS,
    });

    const url = new URL(AUTHORIZE_URL);
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
      scope: "mcp:tools",
      resource: MCP_RESOURCE,
    }).toString();
    return url;
  }

  async complete(
    actor: HouseholdActor & { role: "homeowner" },
    state: string,
    code: string,
  ): Promise<void> {
    const pending = this.registry.consumePending(state);
    if (
      !pending ||
      pending.expiresAt <= this.dependencies.now() ||
      pending.actorKey !== actorKey(actor)
    ) {
      throw new InstamartSpikeError(
        "OAUTH_STATE_INVALID",
        "The Swiggy connection request expired. Start again.",
        400,
      );
    }

    const response = await this.dependencies.fetch(TOKEN_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        code_verifier: pending.codeVerifier,
        client_id: pending.clientId,
        redirect_uri: pending.redirectUri,
        resource: MCP_RESOURCE,
      }),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new InstamartSpikeError(
        "TOKEN_EXCHANGE_FAILED",
        "Swiggy did not complete the connection. Start again.",
        502,
      );
    }

    const token = TokenResponseSchema.parse(await response.json());
    this.registry.tokensByActor.set(actorKey(actor), {
      accessToken: token.access_token,
      expiresAt: this.dependencies.now() + token.expires_in * 1000,
    });
  }

  private async getOrRegisterClient(redirectUri: string): Promise<string> {
    const existing = this.registry.clientsByRedirectUri.get(redirectUri);
    if (existing) return existing;

    const response = await this.dependencies.fetch(REGISTER_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Recipe App Instamart price checker",
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      }),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new InstamartSpikeError(
        "CLIENT_REGISTRATION_FAILED",
        "Swiggy did not accept this local callback. Developer access may be required.",
        502,
      );
    }

    const registration = RegistrationResponseSchema.parse(await response.json());
    this.registry.clientsByRedirectUri.set(redirectUri, registration.client_id);
    return registration.client_id;
  }
}

