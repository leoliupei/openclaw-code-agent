# openclaw-code-agent: Coding-Agent orchestration for OpenClaw

> Current comparison against OpenClaw core ACP.
> https://github.com/goldmar/openclaw-code-agent

---

This plugin was originally created because OpenClaw's built-in ACP support did not provide a coding-agent orchestration layer. Early ACP integration was mainly a relay into ACP backends: useful for launching a session, but not for reviewing plans, revising them inline, forking work, tracking costs, or sending explicit async notifications back to the originating chat. OpenClaw ACP has since evolved and now covers more of the basics, especially multi-turn sessions, resume flows, and backend coverage. The remaining difference is no longer "ACP can do nothing"; it is that ACP still does not replace the orchestration model this plugin adds.

## Version baseline

This comparison is based on the local OpenClaw core checkout at:

- `openclaw --version` → `OpenClaw 2026.3.11 (29dc654)`
- Core repo `HEAD` → `29dc65403faf41dc52944c02a0db9fa4b8457395`

## OpenClaw core ACP vs. openclaw-code-agent

OpenClaw core ACP now spans two related surfaces:

- the `openclaw acp` stdio bridge for ACP-native IDE/tooling
- ACP runtime sessions inside OpenClaw via `/acp ...` and `sessions_spawn({ runtime: "acp" })`

OpenClaw core ACP is now broader than a one-shot relay, but it still focuses on ACP session routing/runtime control rather than coding-agent orchestration.

| Area | OpenClaw core ACP | openclaw-code-agent |
|------|-------------------|---------------------|
| Run Codex / Claude Code from OpenClaw | ✅ Via ACP runtime backends such as `acpx` | ✅ Via native harnesses |
| Multi-turn sessions | ✅ ACP sessions can stay thread-bound and accept follow-ups | ✅ Background sessions are multi-turn by default |
| Resume previous work | ✅ `resumeSessionId`, `session/load`, and `loadSession` exist; fidelity still depends on ACP/backend path | ✅ Resume by internal ID, name, or harness session ID with persisted metadata |
| Fork a prior session | ❌ No documented fork flow | ✅ `fork_session` and `/agent_resume --fork` |
| Plan approval before coding | ❌ No dedicated propose/revise/approve workflow | ✅ Native ask/delegate/approve flow |
| Revise a plan inline | ❌ No explicit plan-revision control loop | ✅ Send feedback, iterate, then `approve=true` |
| Runtime controls on active sessions | ✅ `/acp status`, `/acp model`, `/acp permissions`, `/acp timeout`, `/acp cwd`, `session/set_mode` | ⚠️ Mostly launch-time options plus respond/approval flow |
| Parallel sessions | ✅ `maxConcurrentSessions` and ACP runtime session management | ✅ `maxSessions` with dedicated session manager |
| Live streaming | ✅ Message/tool streaming, `tool_call_update`, best-effort file locations, optional `streamTo: "parent"` summaries | ✅ `agent_output`, turn-end notifications, wake notifications |
| Persistence across restarts | ⚠️ Some ACP sessions can be rehydrated/resumed, but behavior is still path-specific and transcript recovery is not a dedicated job catalog | ✅ Serialized to disk with persisted output and metadata |
| Usage / cost reporting | ❌ No built-in per-session or aggregate cost accounting | ✅ Per-session USD plus `agent_stats` aggregates |
| Session history / operator view | ⚠️ `/acp sessions` and status exist, but not a dedicated persisted session catalog with operator-facing stats | ✅ `agent_sessions`, `agent_output`, `agent_stats` |
| Multiple harness backends | ✅ Current docs cover `codex`, `claude`, `opencode`, `gemini`, `pi`, `kimi` via ACP backends | ⚠️ Claude Code + Codex today |
| Origin-targeted async notifications | ⚠️ Thread-bound ACP replies route back into the active conversation, but there is no separate wake/notification pipeline for background orchestration | ✅ Explicit notification + wake routing back to the origin chat/thread |
| IDE-native ACP server | ✅ `openclaw acp` | ❌ Not an ACP server |
| Setup complexity | ⚠️ The bridge is built-in, but ACP coding runtimes still require ACP backend/plugin setup | ⚠️ Requires plugin install + config |

---

## In practice

OpenClaw core ACP is now good enough for straightforward ACP routing: launch a supported runtime, keep the conversation thread-bound, and resume some prior work. If that is all you need, built-in ACP may be enough.

`openclaw-code-agent` is still the better fit when you want the coding agent to behave like a managed background job with explicit orchestration:

```
You: Build a REST API for todos

Alice → agent_launch(prompt="...", permission_mode="plan")

[Claude Code proposes plan: 5 files, REST endpoints, PostgreSQL]

Alice: Here's the plan — want any changes?
You: Add rate limiting

Alice → agent_respond(session, "Add rate limiting to all endpoints")
Alice → agent_respond(session, approve=true)  // once revised

[Claude Code implements — silently, in the background]
[You get a notification when it's done]
```

That is the remaining gap in practice. ACP can route and continue sessions, but it still does not provide this plugin's plan review loop, fork workflow, dedicated session catalog/stats view, cost accounting, or explicit async notification pipeline back to the origin chat.

---

## Tool surface

```
agent_launch     — start a session (background)
agent_respond    — reply mid-session or approve a plan
agent_output     — stream live output
agent_sessions   — list all active/recent sessions
agent_kill       — terminate a session
agent_stats      — usage metrics and costs
```

---

**When to use OpenClaw core ACP:** When you want ACP-native interoperability, built-in persistent ACP sessions, runtime controls, or broader ACP backend coverage from core OpenClaw.

**When to use openclaw-code-agent:** When you want coding-agent orchestration rather than ACP compatibility: review/approve plans before execution, revise them inline, fork and resume work with a persisted session catalog, track cost/stats, and get explicit async notifications when work needs attention or completes.
