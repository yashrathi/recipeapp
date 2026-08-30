import type { HouseholdActor } from "@/server/auth/policy";
import { authorize } from "@/server/auth/policy";
import {
  InstamartAddressesSchema,
  InstamartSearchInputSchema,
  InstamartSearchSchema,
  type InstamartAddresses,
  type InstamartSearch,
} from "@/features/instamart/contracts";
import {
  InstamartReadOnlyClient,
  type AllowedInstamartTool,
  unwrapSwiggyData,
} from "@/features/instamart/server/client";

export interface InstamartToolCaller {
  call(actor: HouseholdActor, tool: AllowedInstamartTool, args: Record<string, unknown>): Promise<unknown>;
}

export class InstamartPriceService {
  constructor(private readonly caller: InstamartToolCaller = new InstamartReadOnlyClient()) {}

  async listAddresses(actor: HouseholdActor, page = 1): Promise<InstamartAddresses> {
    authorize(actor, "shopping:manage", { householdId: actor.householdId });
    const result = await this.caller.call(actor, "get_addresses", { page, pageSize: 10 });
    return InstamartAddressesSchema.parse(unwrapSwiggyData(result));
  }

  async search(actor: HouseholdActor, input: unknown): Promise<InstamartSearch & { checkedAt: string }> {
    authorize(actor, "shopping:manage", { householdId: actor.householdId });
    const parsed = InstamartSearchInputSchema.parse(input);
    const result = await this.caller.call(actor, "search_products", parsed);
    return {
      ...InstamartSearchSchema.parse(unwrapSwiggyData(result)),
      checkedAt: new Date().toISOString(),
    };
  }
}

