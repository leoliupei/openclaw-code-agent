import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SessionSemanticAdapter } from "../src/session-semantic-adapter";

describe("SessionSemanticAdapter", () => {
  it("passes through no-change deliverable classification", async () => {
    const adapter = new SessionSemanticAdapter({
      classify: async () => ({ classification: "report_worthy_no_change", reason: "substantive findings" }),
    } as any);

    const result = await adapter.classifyNoChangeDeliverable({
      harnessName: "codex",
      sessionName: "session",
      prompt: "investigate",
      workdir: "/tmp",
      outputText: "Findings:\nThis is substantive.",
    });

    assert.equal(result.classification, "report_worthy_no_change");
    assert.equal(result.reason, "substantive findings");
  });
});
