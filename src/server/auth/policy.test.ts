import { describe, expect, it } from "vitest";

import { AuthorizationError, authorize, can, type HouseholdActor } from "./policy";

const homeowner: HouseholdActor = {
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

describe("household role policy", () => {
  it("allows a homeowner to review, publish and assign within their household", () => {
    expect(can(homeowner, "recipe:review", { householdId: "household-1" })).toBe(true);
    expect(can(homeowner, "recipe:publish", { householdId: "household-1" })).toBe(true);
    expect(can(homeowner, "assignment:manage", { householdId: "household-1" })).toBe(true);
  });

  it("denies househelp recipe and shopping authority", () => {
    expect(can(househelp, "recipe:publish", { householdId: "household-1" })).toBe(false);
    expect(can(househelp, "shopping:manage", { householdId: "household-1" })).toBe(false);
    expect(() =>
      authorize(househelp, "recipe:review", { householdId: "household-1" }),
    ).toThrow(AuthorizationError);
  });

  it("lets househelp view only their own assigned work", () => {
    expect(
      can(househelp, "assignment:view", {
        householdId: "household-1",
        assigneeId: "househelp-1",
      }),
    ).toBe(true);
    expect(
      can(househelp, "assignment:view", {
        householdId: "household-1",
        assigneeId: "someone-else",
      }),
    ).toBe(false);
  });

  it("denies every cross-household action", () => {
    expect(can(homeowner, "recipe:publish", { householdId: "household-2" })).toBe(false);
    expect(
      can(househelp, "assignment:view", {
        householdId: "household-2",
        assigneeId: "househelp-1",
      }),
    ).toBe(false);
  });
});
