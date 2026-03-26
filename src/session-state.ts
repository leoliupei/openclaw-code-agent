import type {
  PlanApprovalContext,
  SessionApprovalState,
  SessionDeliveryState,
  SessionLifecycle,
  SessionRuntimeState,
  SessionStatus,
  SessionWorktreeState,
} from "./types";

export interface SessionControlState {
  status: SessionStatus;
  lifecycle: SessionLifecycle;
  approvalState: SessionApprovalState;
  worktreeState: SessionWorktreeState;
  runtimeState: SessionRuntimeState;
  deliveryState: SessionDeliveryState;
  pendingPlanApproval: boolean;
  planApprovalContext?: PlanApprovalContext;
  planModeApproved: boolean;
}

export const SESSION_STATUS_TRANSITIONS: Record<SessionStatus, readonly SessionStatus[]> = {
  starting: ["running", "failed", "killed"],
  running: ["completed", "failed", "killed"],
  completed: [],
  failed: [],
  killed: [],
};

export type SessionControlEvent =
  | { type: "initialize"; hasWorktree: boolean }
  | { type: "status.transition"; status: SessionStatus }
  | { type: "turn.started" }
  | { type: "input.requested" }
  | { type: "plan.requested"; context: PlanApprovalContext }
  | { type: "plan.cleared" }
  | { type: "plan.approved" }
  | { type: "plan.changes_requested" }
  | { type: "terminal.entered"; suspended?: boolean }
  | { type: "worktree.decision_requested" }
  | { type: "worktree.state_set"; worktreeState: SessionWorktreeState }
  | { type: "delivery.state_set"; deliveryState: SessionDeliveryState };

export interface SessionControlPatch {
  lifecycle?: SessionLifecycle;
  approvalState?: SessionApprovalState;
  worktreeState?: SessionWorktreeState;
  runtimeState?: SessionRuntimeState;
  deliveryState?: SessionDeliveryState;
  pendingPlanApproval?: boolean;
  planApprovalContext?: PlanApprovalContext;
  pendingWorktreeDecisionSince?: string;
}

const RESOLVED_WORKTREE_STATES = new Set<SessionWorktreeState>([
  "merged",
  "pr_open",
  "dismissed",
  "cleanup_failed",
]);

export function reduceSessionControlState(
  state: SessionControlState,
  event: SessionControlEvent,
): SessionControlState {
  switch (event.type) {
    case "initialize":
      return {
        ...state,
        worktreeState: event.hasWorktree && state.worktreeState === "none" ? "provisioned" : state.worktreeState,
        lifecycle: state.status === "starting" ? "starting" : state.lifecycle,
        runtimeState: state.status === "starting" ? "live" : state.runtimeState,
      };

    case "status.transition":
      if (event.status === "starting") {
        return { ...state, status: event.status, lifecycle: "starting", runtimeState: "live" };
      }
      if (event.status === "running") {
        return {
          ...state,
          status: event.status,
          lifecycle: state.lifecycle === "starting" || state.lifecycle === "suspended" ? "active" : state.lifecycle,
          runtimeState: "live",
        };
      }
      return {
        ...state,
        status: event.status,
        runtimeState: "stopped",
        lifecycle: state.lifecycle === "suspended" ? "suspended" : "terminal",
      };

    case "turn.started":
      return {
        ...state,
        lifecycle: "active",
        runtimeState: "live",
      };

    case "input.requested":
      return {
        ...state,
        lifecycle: state.pendingPlanApproval ? "awaiting_plan_decision" : "awaiting_user_input",
      };

    case "plan.requested":
      if (state.planModeApproved) return state;
      return {
        ...state,
        pendingPlanApproval: true,
        planApprovalContext: event.context,
        approvalState: "pending",
        lifecycle: "awaiting_plan_decision",
      };

    case "plan.cleared":
      return {
        ...state,
        pendingPlanApproval: false,
        planApprovalContext: undefined,
        approvalState: state.approvalState === "pending" ? "not_required" : state.approvalState,
      };

    case "plan.approved":
      return {
        ...state,
        pendingPlanApproval: false,
        planApprovalContext: undefined,
        planModeApproved: true,
        approvalState: "approved",
        lifecycle: state.status === "running" ? "active" : state.lifecycle,
      };

    case "plan.changes_requested":
      return {
        ...state,
        approvalState: "changes_requested",
      };

    case "terminal.entered":
      return {
        ...state,
        lifecycle: event.suspended ? "suspended" : "terminal",
        runtimeState: "stopped",
      };

    case "worktree.decision_requested":
      return {
        ...state,
        lifecycle: "awaiting_worktree_decision",
        worktreeState: "pending_decision",
      };

    case "worktree.state_set":
      return {
        ...state,
        worktreeState: event.worktreeState,
        lifecycle: event.worktreeState === "pending_decision"
          ? "awaiting_worktree_decision"
          : (RESOLVED_WORKTREE_STATES.has(event.worktreeState) ? "terminal" : state.lifecycle),
      };

    case "delivery.state_set":
      return {
        ...state,
        deliveryState: event.deliveryState,
      };
  }
}

export function applySessionControlPatch(
  state: SessionControlState,
  patch: SessionControlPatch,
): SessionControlState {
  let next: SessionControlState = {
    ...state,
    ...(patch.lifecycle !== undefined ? { lifecycle: patch.lifecycle } : {}),
    ...(patch.approvalState !== undefined ? { approvalState: patch.approvalState } : {}),
    ...(patch.worktreeState !== undefined ? { worktreeState: patch.worktreeState } : {}),
    ...(patch.runtimeState !== undefined ? { runtimeState: patch.runtimeState } : {}),
    ...(patch.deliveryState !== undefined ? { deliveryState: patch.deliveryState } : {}),
    ...(patch.pendingPlanApproval !== undefined ? { pendingPlanApproval: patch.pendingPlanApproval } : {}),
    ...(patch.planApprovalContext !== undefined ? { planApprovalContext: patch.planApprovalContext } : {}),
  };

  if (next.pendingPlanApproval) {
    next = {
      ...next,
      approvalState: "pending",
      lifecycle: "awaiting_plan_decision",
    };
  }

  if (patch.pendingWorktreeDecisionSince !== undefined || next.worktreeState === "pending_decision") {
    next = reduceSessionControlState(next, { type: "worktree.decision_requested" });
  } else if (RESOLVED_WORKTREE_STATES.has(next.worktreeState)) {
    next = {
      ...next,
      lifecycle: "terminal",
    };
  }

  return next;
}
