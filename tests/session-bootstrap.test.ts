import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathsReferToSameLocation } from "../src/path-utils";
import { prepareSessionBootstrap } from "../src/session-bootstrap";
import type { PersistedSessionInfo, SessionConfig } from "../src/types";
import { createWorktree, getBranchName } from "../src/worktree";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf-8" }).trim();
}

describe("prepareSessionBootstrap()", () => {
  it("recovers the original repo dir for resumed worktree sessions with legacy self-referential metadata", () => {
    const repoDir = mkdtempSync(join(tmpdir(), "session-bootstrap-"));
    try {
      git(repoDir, "init", "-b", "main");
      git(repoDir, "config", "user.name", "Test User");
      git(repoDir, "config", "user.email", "test@example.com");
      writeFileSync(join(repoDir, "README.md"), "hello\n", "utf-8");
      git(repoDir, "add", "README.md");
      git(repoDir, "commit", "-m", "init");

      const worktreePath = createWorktree(repoDir, "resume-self-reference");
      const branchName = getBranchName(worktreePath);
      assert.ok(branchName, "worktree branch should exist");

      const config: SessionConfig = {
        prompt: "Resume the fix",
        workdir: worktreePath,
        resumeWorktreeFrom: "sess-1",
        multiTurn: true,
        route: {
          provider: "telegram",
          target: "12345",
          sessionKey: "agent:main:telegram:group:12345",
        },
      };

      const bootstrap = prepareSessionBootstrap(
        config,
        "resume-self-reference",
        (_ref): PersistedSessionInfo | undefined => ({
          harnessSessionId: "sess-1",
          name: "resume-self-reference",
          prompt: "Resume the fix",
          workdir: worktreePath,
          status: "running",
          costUsd: 0,
          worktreePath,
          worktreeBranch: branchName,
        }),
      );

      assert.equal(bootstrap.actualWorkdir, worktreePath);
      assert.equal(pathsReferToSameLocation(bootstrap.originalWorkdir, repoDir), true);
      assert.equal(bootstrap.worktreePath, worktreePath);
      assert.equal(bootstrap.worktreeBranchName, branchName);
      assert.match(
        bootstrap.effectiveSystemPrompt ?? "",
        new RegExp(`Do NOT edit files directly in ${(bootstrap.originalWorkdir ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
      );
      assert.doesNotMatch(
        bootstrap.effectiveSystemPrompt ?? "",
        new RegExp(`Do NOT edit files directly in ${worktreePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
      );
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("keeps fresh Codex worktree launches on the original repo and lets the backend allocate the native worktree", () => {
    const repoDir = mkdtempSync(join(tmpdir(), "session-bootstrap-codex-native-"));
    try {
      git(repoDir, "init", "-b", "main");
      git(repoDir, "config", "user.name", "Test User");
      git(repoDir, "config", "user.email", "test@example.com");
      writeFileSync(join(repoDir, "README.md"), "hello\n", "utf-8");
      git(repoDir, "add", "README.md");
      git(repoDir, "commit", "-m", "init");

      const config: SessionConfig = {
        prompt: "Implement the fix",
        workdir: repoDir,
        harness: "codex",
        worktreeStrategy: "ask",
        multiTurn: true,
        route: {
          provider: "telegram",
          target: "12345",
          sessionKey: "agent:main:telegram:group:12345",
        },
      };

      const bootstrap = prepareSessionBootstrap(config, "codex-native", () => undefined);

      assert.equal(bootstrap.actualWorkdir, repoDir);
      assert.equal(bootstrap.originalWorkdir, repoDir);
      assert.equal(bootstrap.worktreePath, undefined);
      assert.equal(bootstrap.worktreeBranchName, undefined);
      assert.equal(bootstrap.effectiveSystemPrompt, config.systemPrompt);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });

  it("does not recreate missing native Codex worktrees during resume bootstrap", () => {
    const repoDir = mkdtempSync(join(tmpdir(), "session-bootstrap-codex-resume-"));
    const missingWorktreePath = join(repoDir, ".codex", "worktrees", "abcd", "openclaw");
    try {
      git(repoDir, "init", "-b", "main");
      git(repoDir, "config", "user.name", "Test User");
      git(repoDir, "config", "user.email", "test@example.com");
      writeFileSync(join(repoDir, "README.md"), "hello\n", "utf-8");
      git(repoDir, "add", "README.md");
      git(repoDir, "commit", "-m", "init");

      const config: SessionConfig = {
        prompt: "Resume the Codex session",
        workdir: repoDir,
        harness: "codex",
        resumeSessionId: "thread-1",
        worktreeStrategy: "ask",
        multiTurn: true,
        route: {
          provider: "telegram",
          target: "12345",
          sessionKey: "agent:main:telegram:group:12345",
        },
      };

      const bootstrap = prepareSessionBootstrap(
        config,
        "codex-native-resume",
        (_ref): PersistedSessionInfo | undefined => ({
          sessionId: "session-1",
          harnessSessionId: "thread-1",
          backendRef: {
            kind: "codex-app-server",
            conversationId: "thread-1",
            worktreeId: "abcd",
            worktreePath: missingWorktreePath,
          },
          name: "codex-native-resume",
          prompt: "Resume the Codex session",
          workdir: repoDir,
          status: "killed",
          lifecycle: "suspended",
          runtimeState: "stopped",
          costUsd: 0,
          route: {
            provider: "telegram",
            target: "12345",
            sessionKey: "agent:main:telegram:group:12345",
          },
          worktreePath: missingWorktreePath,
          worktreeBranch: "agent/codex-native-resume",
          worktreeStrategy: "ask",
        }),
      );

      assert.equal(bootstrap.actualWorkdir, repoDir);
      assert.equal(bootstrap.originalWorkdir, repoDir);
      assert.equal(bootstrap.worktreePath, undefined);
      assert.equal(bootstrap.worktreeBranchName, "agent/codex-native-resume");
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });
});
