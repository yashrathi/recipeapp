import { describe, expect, it, vi } from "vitest";

import type { HouseholdActor } from "@/server/auth/policy";
import { InstamartSpikeError } from "@/features/instamart/server/errors";
import { extractSwiggyEnvelope, unwrapSwiggyData } from "@/features/instamart/server/client";
import { SwiggyOAuthService } from "@/features/instamart/server/oauth";
import { InstamartMemoryRegistry, actorKey } from "@/features/instamart/server/registry";
import { InstamartPriceService, type InstamartToolCaller } from "@/features/instamart/server/service";

const homeowner: HouseholdActor & { role: "homeowner" } = {
  userId: "homeowner-1",
  householdId: "household-1",
  membershipId: "membership-1",
  role: "homeowner",
};

const househelp: HouseholdActor = {
  userId: "househelp-1",
  householdId: "household-1",
  membershipId: "membership-2",
  role: "househelp",
};

const addressData = {
  addresses: [{ id: "address-1", addressLine: "12 Test Road", addressCategory: "HOME" }],
  pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1, hasMore: false },
};

const searchData = {
  nextOffset: "",
  products: [{
    displayName: "Tomatoes",
    brand: "Fresh",
    inStock: true,
    isAvail: true,
    productId: "product-1",
    parentProductId: "parent-1",
    variations: [{
      spinId: "spin-1",
      skuId: "sku-1",
      quantityDescription: "500 g",
      displayName: "Fresh tomatoes",
      brandName: "Fresh",
      price: { mrp: 45, offerPrice: 39 },
      isInStockAndAvailable: true,
    }],
  }],
};

function result(data: unknown): unknown {
  return { structuredContent: { success: true, data } };
}

describe("Instamart response handling", () => {
  it("prefers structured MCP content and falls back to JSON text", () => {
    expect(extractSwiggyEnvelope(result(addressData))).toMatchObject({ success: true, data: addressData });
    expect(extractSwiggyEnvelope({ content: [{ type: "text", text: JSON.stringify({ success: true, data: searchData }) }] }))
      .toMatchObject({ success: true, data: searchData });
  });

  it("accepts Swiggy's live direct structured-content shape", () => {
    expect(unwrapSwiggyData({ structuredContent: addressData })).toEqual(addressData);
  });

  it("surfaces a safe domain error and rejects incomplete responses", () => {
    expect(() => unwrapSwiggyData({ structuredContent: { success: false, error: { message: "Address not serviceable" } } }))
      .toThrow("Address not serviceable");
    expect(() => unwrapSwiggyData({ structuredContent: { success: true } })).toThrow("incomplete");
  });
});

describe("Instamart price service", () => {
  it("uses only the two read tools and validates their documented payloads", async () => {
    const call = vi.fn<InstamartToolCaller["call"]>(async (_actor, tool) =>
      ({ structuredContent: tool === "get_addresses" ? addressData : searchData }));
    const service = new InstamartPriceService({ call });

    await expect(service.listAddresses(homeowner)).resolves.toEqual(addressData);
    await expect(service.search(homeowner, { addressId: "address-1", query: " tomatoes " }))
      .resolves.toMatchObject({ products: searchData.products, checkedAt: expect.any(String) });
    expect(call).toHaveBeenNthCalledWith(1, homeowner, "get_addresses", { page: 1, pageSize: 10 });
    expect(call).toHaveBeenNthCalledWith(2, homeowner, "search_products", { addressId: "address-1", query: "tomatoes" });
  });

  it("denies househelp before any Swiggy tool call", async () => {
    const call = vi.fn<InstamartToolCaller["call"]>();
    const service = new InstamartPriceService({ call });
    await expect(service.listAddresses(househelp)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.search(househelp, { addressId: "address-1", query: "tomatoes" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(call).not.toHaveBeenCalled();
  });

  it("rejects empty addresses and underspecified search terms", async () => {
    const call = vi.fn<InstamartToolCaller["call"]>();
    const service = new InstamartPriceService({ call });
    await expect(service.search(homeowner, { addressId: "", query: "t" })).rejects.toBeTruthy();
    expect(call).not.toHaveBeenCalled();
  });
});

describe("Swiggy OAuth state", () => {
  it("registers a localhost client, binds PKCE state to the homeowner, and stores only the token session", async () => {
    const registry = new InstamartMemoryRegistry();
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const mockedFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = input.toString();
      requests.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      if (url.endsWith("/register")) {
        return Response.json({ client_id: "client-1" });
      }
      return Response.json({ access_token: "secret-token", expires_in: 3600 });
    }) as unknown as typeof fetch;
    let randomCall = 0;
    const oauth = new SwiggyOAuthService(registry, {
      fetch: mockedFetch,
      now: () => 1_000,
      random: (size) => Buffer.alloc(size, ++randomCall),
    });

    const redirectUri = "http://localhost:3000/api/homeowner/instamart/callback";
    const authorizationUrl = await oauth.begin(homeowner, redirectUri);
    expect(authorizationUrl.origin + authorizationUrl.pathname).toBe("https://mcp.swiggy.com/auth/authorize");
    expect(authorizationUrl.searchParams.get("resource")).toBe("https://mcp.swiggy.com/im");
    expect(authorizationUrl.searchParams.get("scope")).toBe("mcp:tools");
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(requests[0]).toMatchObject({
      url: "https://mcp.swiggy.com/auth/register",
      body: { redirect_uris: [redirectUri], token_endpoint_auth_method: "none" },
    });

    const state = authorizationUrl.searchParams.get("state");
    if (!state) throw new Error("state missing");
    await oauth.complete(homeowner, state, "authorization-code");
    expect(registry.getActiveToken(homeowner, 2_000)).toEqual({ accessToken: "secret-token", expiresAt: 3_601_000 });
    expect(requests[1]).toMatchObject({
      url: "https://mcp.swiggy.com/auth/token",
      body: { code: "authorization-code", client_id: "client-1", redirect_uri: redirectUri },
    });
    expect(registry.pendingByState.size).toBe(0);
  });

  it("rejects expired or cross-household callback state", async () => {
    const registry = new InstamartMemoryRegistry();
    registry.pendingByState.set("state", {
      actorKey: actorKey(homeowner),
      clientId: "client",
      codeVerifier: "verifier",
      redirectUri: "http://localhost/callback",
      expiresAt: 2_000,
    });
    const oauth = new SwiggyOAuthService(registry, {
      fetch: vi.fn() as unknown as typeof fetch,
      now: () => 1_000,
      random: (size) => Buffer.alloc(size),
    });
    const other = { ...homeowner, householdId: "other-household" };
    await expect(oauth.complete(other, "state", "code")).rejects.toBeInstanceOf(InstamartSpikeError);
    expect(registry.tokensByActor.size).toBe(0);
  });

  it("expires access tokens before their last minute", () => {
    const registry = new InstamartMemoryRegistry();
    registry.tokensByActor.set(actorKey(homeowner), { accessToken: "token", expiresAt: 61_000 });
    expect(registry.getActiveToken(homeowner, 1_000)).toBeNull();
  });
});
