# Architecture — OpenClaw Code Agent

## Overview

OpenClaw plugin that enables AI agents to orchestrate coding agent sessions from messaging channels (Telegram, Discord, Rocket.Chat). Agents can spawn, monitor, resume, and manage coding agent processes as background development tasks.

## System Context

```
User (Telegram/Discord) → OpenClaw Gateway → Agent → Plugin Tools → Coding Agent Sessions
                                                  ↓
                                        NotificationService → openclaw message send → User
```

## Core Components

### 1. Plugin Entry (`index.ts`)
- Registers 6 tools, 7 commands, and 1 service
- Creates SessionManager and NotificationService during service start
- Wires outbound messaging via `openclaw message send` CLI

### 2. SessionManager (`src/session-manager.ts`)
- Manages lifecycle of coding agent processes (spawn, track, kill, resume)
- Enforces `maxSessions` concurrent limit
- Persists sessions to disk for crash/restart recovery
  - Path precedence: `OPENCLAW_CODE_AGENT_SESSIONS_PATH` → `$OPENCLAW_HOME/code-agent-sessions.json` → `~/.openclaw/code-agent-sessions.json`
- Writes a stub on first `"running"` transition (captures harness, workdir, model before session completes)
- Atomic writes (`.tmp` → rename) prevent corrupt JSON on kill mid-write
- Sessions in `"running"` state at load time are marked `"killed"` (process died before they could complete)
- GC interval cleans up stale sessions every 5 minutes; evicts oldest beyond `maxPersistedSessions`
- Runtime session GC TTL is configurable via `sessionGcAgeMinutes` (default: 1440 minutes / 24h)
- Subscribes to session events (statusChange, turnEnd) instead of callbacks
- Single-index persistence with 3 maps (persisted, idIndex, nameIndex)

### 2a. Agent Harness Abstraction (`src/harness/`)
- `AgentHarness` interface: `name`, `launch()`, `buildUserMessage()`, `questionToolNames`, `planApprovalToolNames`
- **ClaudeCodeHarness** — wraps `@anthropic-ai/claude-agent-sdk`; uses `query()` with `MessageStream` for multi-turn
- **CodexHarness** — wraps `@openai/codex-sdk` (`Codex` + `Thread`) and maps SDK stream events to harness messages
  - Streams SDK events (`thread.started`, `turn.started`, `turn.completed`, `turn.failed`, `item.*`)
  - Uses a soft first-turn planning prompt when launched with `permissionMode: "plan"`
  - Emits synthetic tool-use events only for waiting-for-user detection
  - Uses per-turn `AbortController` wiring for `interrupt()` and external abort propagation
  - Emits `activity` heartbeats while turns are in-flight (keeps idle timers from false-killing silent long turns)
  - Accumulates running cost from SDK usage tokens on each `turn.completed`
  - In `bypassPermissions`, adds filesystem root + `OPENCLAW_CODEX_BYPASS_ADDITIONAL_DIRS` entries to Codex `additionalDirectories`
  - `setPermissionMode()` recreates the thread on the next turn via `resumeThread` with the same thread id
  - Resume via `codex.resumeThread(<session-id>, options)`
- Registry: `registerHarness()` / `getHarness(name)` / `getDefaultHarness()` reads `defaultHarness` config (default: `"claude-code"`)
- Permission mode mapping:
  - Claude Code uses SDK permission modes (`default` / `plan` / `acceptEdits` / `bypassPermissions`)
  - Codex always uses SDK thread options `sandboxMode: "danger-full-access"` and `approvalPolicy: "never"`; `plan` is implemented as a soft first-turn planning prompt and is not surfaced as plan state in the session API/UI

### 3. Session (`src/session.ts`)
- Wraps a single coding agent process via the configured `AgentHarness`
- Extends `EventEmitter` — emits `statusChange`, `output`, `toolUse`, `turnEnd`
- State machine with validated transitions (`starting → running → completed/failed/killed`)
- Centralized timer management via `setTimer`/`clearTimer`/`clearAllTimers`
- One named timer: `idle` (configurable, default 15 min)
- Handles output buffering and multi-turn conversation via `MessageStream`
  - `MessageStream` is an async queue backing multi-turn prompt delivery
  - `hasPending()` prevents dropping queued follow-ups when a turn ends
  - Terminal transitions set metadata (`killReason`/`completedAt`) before emitting status changes

### 4. NotificationService (`src/notifications.ts`)
- Routes notifications to appropriate channels via `emitToChannel()`
- Wraps the `sendMessage` callback for outbound delivery

### 5. Supporting Modules
- `src/session-store.ts` — persisted session/index storage abstraction
- `src/session-metrics.ts` — metrics aggregation abstraction
- `src/wake-dispatcher.ts` — wake delivery + retry abstraction
- `src/application/*` — shared app-layer logic used by both tools and commands to keep output/kill/list behavior in sync, including merged active+persisted session listing
  - Listing merge dedups by internal session ID (not name) to avoid name-collision loss

### 6. Config & Singletons
- `src/config.ts` — Plugin config singleton, channel resolution utilities (`resolveToolChannel`, `resolveAgentChannel`, etc.)
- `src/singletons.ts` — Module-level mutable references for `sessionManager` and `notificationService`
- `src/format.ts` — Formatting utilities (duration, session listing, stats, name generation)

### 6. Shared Respond Action (`src/actions/respond.ts`)
- Centralizes all respond logic used by both `agent_respond` tool and `/agent_respond` command
- Auto-resume for idle-killed sessions (`done`, idle-timeout)
- Permission mode switch (plan → bypassPermissions on approval keywords)
- Auto-respond counter management

## Data Flow

### Session Launch
```
Agent calls agent_launch → tool validates params → SessionManager.spawn()
  → Session created → coding agent process starts
  → Origin channel stored for notifications
  → SessionManager subscribes to session events
```

### Waiting for Input (Wake) — Primary + Fallback
```
Session detects end-of-turn idle
  → Session emits "turnEnd" event with hadQuestion=true
  → SessionManager triggers wake event

Primary wake path:
  → openclaw agent --agent <id> --message <text> --deliver
  → WakeDispatcher retries once on failure

Fallback path (missing originAgentId):
  → openclaw system event --mode now
  → WakeDispatcher retries once on failure
  → Direct Telegram delivery is used so the user still receives a signal

  → Orchestrator agent wakes up, reads output, forwards to user
```

### Idle-Kill + Auto-Resume
```
Turn completes without a question → session.complete("done") immediately
  → SessionManager persists harnessSessionId
  → No 💤 notification (🔄 Turn done already sent)

On next agent_respond:
  → actions/respond.ts detects terminal status + auto-resume reason + harnessSessionId
  → Auto-spawns new session with same harnessSessionId silently
  → Conversation context preserved

If session remains untouched for idleTimeoutMinutes (default: 15 min):
  → session.kill("idle-timeout")
  → Notification: "💤 Idle-killed"
  → Also auto-resumes on next agent_respond

After `sessionGcAgeMinutes` (default: 1440 / 24h):
  → Terminal session is evicted from runtime memory
  → Persisted metadata/output still available for resume/list/output
```

### Session Completion
```
Coding agent process exits
  → Session status → completed/failed/killed
  → SessionManager persists metadata/output snapshot
  → WakeDispatcher notifies orchestrator (or direct channel fallback)
  → Orchestrator retrieves output, summarizes to user
```

## Plan Approval Modes

Controls how the orchestrator handles plans when a coding agent calls `ExitPlanMode`. Set via `planApproval` in plugin config.

| Mode | Default | Behavior |
|------|---------|----------|
| `ask` | | Always forwards plan to user — orchestrator never auto-approves |
| `delegate` | ✓ | Orchestrator decides: approves low-risk plans autonomously, escalates high-risk or ambiguous plans to user |
| `approve` | | Orchestrator may auto-approve after verification (workdir, scope, codebase correctness); can still escalate complex/risky plans |

- **Permission switch** — on approval, session switches from `plan` → `bypassPermissions`
- **Revision** — responding without `approve=true` keeps the agent in plan mode; it revises and re-submits via `ExitPlanMode`

## Key Design Decisions

1. **CLI for outbound messages** — No runtime API for sending messages; uses `openclaw message send` subprocess
2. **Wake routing with retry** — Primary path wakes the originating agent via `openclaw agent --deliver`; fallback path uses `openclaw system event` only when origin agent metadata is unavailable
3. **EventEmitter over callbacks** — Session extends EventEmitter; SessionManager subscribes to events instead of wiring 6 optional callback properties
4. **State machine** — `TRANSITIONS` map validates all status changes; invalid transitions throw
5. **Done+resume (no hibernation state)** — Non-question turn completion is represented as `complete("done")`; next respond auto-resumes from persisted harness session id
6. **Shared respond action** — `actions/respond.ts` centralizes auto-resume, permission switch, and auto-respond cap logic for both tool and command callers
7. **maxAutoResponds limit** — Prevents infinite agent loops; resets on user interaction (`userInitiated: true`)
8. **Channel propagation** — `resolveToolChannel()` in `config.ts` handles channel resolution once per tool call, replacing 7 duplicated blocks

## Configuration

See `openclaw.plugin.json` for full config schema. Key settings:
- `maxSessions` (5) — concurrent session limit
- `fallbackChannel` — default notification target
- `idleTimeoutMinutes` (15) — auto-kill for idle multi-turn sessions
- `defaultHarness` (`"claude-code"`) — default agent harness (`"claude-code"` or `"codex"`)
- `maxAutoResponds` (10) — agent auto-respond limit per session
- `permissionMode` (plan) — default coding agent permission mode
