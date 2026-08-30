import { z } from "zod";

import { MilestoneOneSpokenLocaleSchema } from "@/domain/contracts";

const IdempotencyKeySchema = z.string().trim().min(1).max(300);
const RevisionSchema = z.number().int().nonnegative();

export const HousehelpAdHocStartSchema = z.object({
  locale: MilestoneOneSpokenLocaleSchema,
});

export const HousehelpMutationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("locale"), locale: MilestoneOneSpokenLocaleSchema }),
  z.object({
    type: z.literal("start"),
    idempotencyKey: IdempotencyKeySchema,
    expectedRevision: RevisionSchema,
  }),
  z.object({
    type: z.literal("ingredient"),
    ingredientId: z.string().trim().min(1).max(128),
    decision: z.enum(["have", "missing"]),
    ingredientIndex: z.number().int().nonnegative(),
    idempotencyKey: IdempotencyKeySchema,
    expectedRevision: RevisionSchema,
  }),
  z.object({
    type: z.literal("start_cooking"),
    idempotencyKey: IdempotencyKeySchema,
    expectedRevision: RevisionSchema,
  }),
  z.object({
    type: z.literal("step"),
    stepId: z.string().trim().min(1).max(128),
    stepIndex: z.number().int().nonnegative(),
    idempotencyKey: IdempotencyKeySchema,
    expectedRevision: RevisionSchema,
  }),
  z.object({
    type: z.literal("issue"),
    issueType: z.enum([
      "ingredient_missing",
      "instruction_unclear",
      "cannot_complete",
      "tell_homeowner",
      "audio_failure",
    ]),
    entityId: z.string().trim().min(1).max(128),
    idempotencyKey: IdempotencyKeySchema,
    expectedRevision: RevisionSchema,
  }),
  z.object({
    type: z.literal("timer"),
    timerId: z.string().trim().min(1).max(128),
    stepId: z.string().trim().min(1).max(128),
    durationSeconds: z.number().int().positive().max(86_400),
    endsAt: z.string().datetime({ offset: true }),
    status: z.enum(["pending", "running", "elapsed", "dismissed"]),
    idempotencyKey: IdempotencyKeySchema.optional(),
    expectedRevision: RevisionSchema,
  }),
  z.object({
    type: z.literal("done"),
    idempotencyKey: IdempotencyKeySchema,
    expectedRevision: RevisionSchema,
  }),
]);

export type HousehelpMutation = z.infer<typeof HousehelpMutationSchema>;
