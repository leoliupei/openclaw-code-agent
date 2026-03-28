import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { getSessionOutputText } from "../src/application/session-view";
import { appendSessionOutput, getSessionOutputFilePath } from "../src/session-output";

describe("session output buffering", () => {
  const sessionId = "session-output-test";
  const outputPath = getSessionOutputFilePath(sessionId);

  afterEach(() => {
    if (existsSync(outputPath)) {
      rmSync(outputPath, { force: true });
    }
  });

  it("coalesces token-sized deltas into a single output line", () => {
    const buffer: string[] = [];

    appendSessionOutput(buffer, sessionId, "Hello");
    appendSessionOutput(buffer, sessionId, " world");
    appendSessionOutput(buffer, sessionId, "!");

    assert.deepEqual(buffer, ["Hello world!"]);
    assert.equal(readFileSync(outputPath, "utf-8"), "Hello world!");
  });

  it("starts a new output line only when the streamed text contains a newline", () => {
    const buffer: string[] = [];

    appendSessionOutput(buffer, sessionId, "First line\nSecond");
    appendSessionOutput(buffer, sessionId, " line");

    assert.deepEqual(buffer, ["First line", "Second line"]);
    assert.equal(readFileSync(outputPath, "utf-8"), "First line\nSecond line");
  });

  it("renders live session output without inserting one line per token", () => {
    const buffer: string[] = [];

    appendSessionOutput(buffer, sessionId, "Investigating");
    appendSessionOutput(buffer, sessionId, " output");
    appendSessionOutput(buffer, sessionId, " formatting.");

    const sm: any = {
      resolve: () => ({
        id: sessionId,
        name: "live-session",
        status: "running",
        phase: "active",
        lifecycle: "active",
        duration: 1000,
        costUsd: 0,
        getOutput: () => buffer,
      }),
    };

    const text = getSessionOutputText(sm, "live-session");
    assert.match(text, /Investigating output formatting\./);
    assert.doesNotMatch(text, /Investigating\n output\n formatting\./);
  });
});
