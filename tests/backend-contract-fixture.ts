import assert from "node:assert/strict";
import type { AgentHarness } from "../src/harness/types";

export function assertStructuredBackendContract(harness: AgentHarness): void {
  assert.ok(harness.supportedPermissionModes.includes("default"));
  assert.ok(harness.supportedPermissionModes.includes("plan"));
  assert.ok(harness.supportedPermissionModes.includes("bypassPermissions"));
  assert.equal(typeof harness.capabilities.nativePendingInput, "boolean");
  assert.equal(typeof harness.capabilities.nativePlanArtifacts, "boolean");
  assert.ok(["plugin-managed", "native-execution", "native-restore"].includes(harness.capabilities.worktrees));
}
