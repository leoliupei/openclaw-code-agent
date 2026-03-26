import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applySessionControlPatch,
  reduceSessionControlState,
  type SessionControlState,
} from "../src/session-state";

function baseState(overrides: Partial<SessionControlState> = {}): SessionControlState {
  return {
    status: "starting",
    lifecycle: "starting",
    approvalState: "not_required",
    worktreeState: "none",
    runtimeState: "live",
    deliveryState: "idle",
    pendingPlanApproval: false,
    planApprovalContext: undefined,
    planModeApproved: false,
    ...overrides,
  };
}

describe("session-state reducer", () => {
  it("initializes provisioned worktree state deterministically", () => {
    const next = reduceSessionControlState(baseState(), {
      type: "initialize",
      hasWorktree: true,
    });

    assert.equal(next.worktreeState, "provisioned");
    assert.equal(next.lifecycle, "starting");
  });

  it("marks plan approval as pending with explicit lifecycle", () => {
    const next = reduceSessionControlState(baseState({
      status: "running",
      lifecycle: "active",
    }), {
      type: "plan.requested",
      context: "plan-mode",
    });

    assert.equal(next.pendingPlanApproval, true);
    assert.equal(next.planApprovalContext, "plan-mode");
    assert.equal(next.approvalState, "pending");
    assert.equal(next.lifecycle, "awaiting_plan_decision");
  });

  it("moves into awaiting_user_input without plan approval", () => {
    const next = reduceSessionControlState(baseState({
      status: "running",
      lifecycle: "active",
    }), {
      type: "input.requested",
    });

    assert.equal(next.lifecycle, "awaiting_user_input");
  });

  it("marks idle terminal entry as suspended and stopped", () => {
    const next = reduceSessionControlState(baseState({
      status: "running",
      lifecycle: "active",
      runtimeState: "live",
    }), {
      type: "terminal.entered",
      suspended: true,
    });

    assert.equal(next.lifecycle, "suspended");
    assert.equal(next.runtimeState, "stopped");
  });

  it("normalizes pending worktree decisions through patch application", () => {
    const next = applySessionControlPatch(baseState({
      status: "completed",
      lifecycle: "terminal",
      runtimeState: "stopped",
      worktreeState: "provisioned",
    }), {
      pendingWorktreeDecisionSince: "2026-03-25T00:00:00.000Z",
    });

    assert.equal(next.lifecycle, "awaiting_worktree_decision");
    assert.equal(next.worktreeState, "pending_decision");
  });

  it("normalizes resolved worktree states to terminal lifecycle", () => {
    const next = applySessionControlPatch(baseState({
      status: "completed",
      lifecycle: "awaiting_worktree_decision",
      runtimeState: "stopped",
      worktreeState: "pending_decision",
    }), {
      worktreeState: "pr_open",
    });

    assert.equal(next.lifecycle, "terminal");
    assert.equal(next.worktreeState, "pr_open");
  });
});
