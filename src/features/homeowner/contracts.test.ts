import { describe, expect, it } from "vitest";

import { interpretImportApiPayload } from "@/features/homeowner/contracts";

describe("homeowner import API adapter", () => {
  it("turns an unavailable import API into a recoverable manual-entry state", () => {
    expect(
      interpretImportApiPayload(
        { error: "The import service is temporarily unavailable." },
        false,
      ),
    ).toEqual({
      kind: "failure",
      message: "The import service is temporarily unavailable.",
      retryable: false,
    });
  });

  it("accepts an import-owned persisted draft without duplicating it", () => {
    expect(
      interpretImportApiPayload({ job: { id: "job-1", recipeVersionId: "version-1" } }),
    ).toEqual({ kind: "draft", versionId: "version-1" });
  });

  it("keeps a running job on its named stage", () => {
    expect(
      interpretImportApiPayload({ id: "job-1", status: "running", stage: "extracting" }),
    ).toEqual({ kind: "pending", jobId: "job-1", stage: "extracting" });
  });
});
