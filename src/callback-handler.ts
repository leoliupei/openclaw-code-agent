import { sessionManager } from "./singletons";
import { executeRespond } from "./actions/respond";
import { makeAgentMergeTool } from "./tools/agent-merge";
import { makeAgentPrTool } from "./tools/agent-pr";
import { makeAgentOutputTool } from "./tools/agent-output";

/** Interactive callback namespace registered with the gateway. */
export const CALLBACK_NAMESPACE = "code-agent";

/**
 * Minimal Telegram callback handler context (mirrors OpenClaw's
 * PluginInteractiveTelegramHandlerContext — no import from OpenClaw internals needed).
 */
interface TelegramCallbackContext {
  auth: { isAuthorizedSender: boolean };
  callback: { payload: string };
  respond: {
    reply: (params: { text: string }) => Promise<void>;
    clearButtons: () => Promise<void>;
  };
}

type InteractiveChannel = "telegram" | "discord";

function parsePayload(payload: string): string | null {
  const tokenId = payload.trim();
  return tokenId ? tokenId : null;
}

/** Extract text from a tool execute result content array. */
function toolResultText(result: unknown): string {
  if (
    result &&
    typeof result === "object" &&
    "content" in result &&
    Array.isArray((result as { content: unknown[] }).content)
  ) {
    const first = (result as { content: Array<{ text?: unknown }> }).content[0];
    return typeof first?.text === "string" ? first.text : "(done)";
  }
  return "(done)";
}

/**
 * Create the Telegram interactive handler registration for button callbacks.
 *
 * Register via: `api.registerInteractiveHandler(createCallbackHandler())`
 *
 * Flow:
 * 1. Check sender authorization.
 * 2. Treat payload as an opaque action token.
 * 3. Answer callback (clear buttons / remove spinner) immediately.
 * 4. Execute action programmatically.
 * 5. Reply with result in the same Telegram thread.
 *
 * Alice never sees raw callback_data strings.
 */
export function createCallbackHandler(channel: InteractiveChannel = "telegram") {
  return {
    channel,
    namespace: CALLBACK_NAMESPACE,
    handler: async (ctx: TelegramCallbackContext): Promise<{ handled?: boolean } | void> => {
      // Authorization check
      if (!ctx.auth.isAuthorizedSender) {
        await ctx.respond.reply({ text: "⛔ Unauthorized." });
        return { handled: true };
      }

      const tokenId = parsePayload(ctx.callback.payload);
      if (!tokenId) {
        await ctx.respond.reply({
          text: `⚠️ Unrecognized callback payload: "${ctx.callback.payload}".`,
        });
        return { handled: true };
      }

      // Guard service initialization
      if (!sessionManager) {
        await ctx.respond.reply({ text: "⚠️ Code agent service not running." });
        return { handled: true };
      }

      const token = sessionManager.consumeActionToken(tokenId);
      if (!token) {
        await ctx.respond.reply({ text: "⚠️ This action is stale or has already been used." });
        return { handled: true };
      }

      const sessionId = token.sessionId;

      // Answer the callback query immediately: removes spinner and buttons from message.
      await ctx.respond.clearButtons();

      // Route action
      switch (token.kind) {
        case "worktree-merge": {
          const result = await makeAgentMergeTool().execute("callback", { session: sessionId });
          await ctx.respond.reply({ text: toolResultText(result) });
          break;
        }

        case "worktree-decide-later": {
          const result = sessionManager.snoozeWorktreeDecision(sessionId);
          await ctx.respond.reply({ text: result.startsWith("Error") ? result : "⏭️ Snoozed 24h" });
          break;
        }

        case "worktree-dismiss": {
          const result = await sessionManager.dismissWorktree(sessionId);
          await ctx.respond.reply({ text: result.startsWith("Error") ? result : result });
          break;
        }

        case "worktree-create-pr":
        case "worktree-update-pr": {
          // Do NOT pre-clear pendingWorktreeDecisionSince here.
          // For the PR path the worktree directory must stay alive indefinitely so the
          // user can push follow-up commits for PR review.  The worktree directory was
          // already preserved by onSessionTerminal (which skips removeWorktree when
          // pendingWorktreeDecisionSince is set).  agent-pr.ts clears the flag itself
          // on success; if the PR creation fails the flag remains set so reminders
          // continue until the user tries again.
          const result = await makeAgentPrTool().execute("callback", { session: sessionId });
          await ctx.respond.reply({ text: toolResultText(result) });
          break;
        }

        case "worktree-view-pr": {
          const persisted = sessionManager.getPersistedSession(sessionId);
          const url = token.targetUrl ?? persisted?.worktreePrUrl;
          await ctx.respond.reply({ text: url ? `PR: ${url}` : "⚠️ PR URL is no longer available." });
          break;
        }

        case "plan-approve": {
          const result = await executeRespond(sessionManager, {
            session: sessionId,
            message: "Approved. Go ahead.",
            approve: true,
            userInitiated: true,
          });
          await ctx.respond.reply({ text: result.isError ? `⚠️ ${result.text}` : `👍 ${result.text}` });
          break;
        }

        case "plan-reject": {
          const active = sessionManager.resolve(sessionId);
          if (active) {
            active.approvalState = "rejected";
            sessionManager.kill(active.id, "user");
            await ctx.respond.reply({ text: `❌ Plan rejected for [${active.name}]. Session stopped.` });
          } else {
            await ctx.respond.reply({ text: `❌ Plan rejected.` });
          }
          break;
        }

        case "plan-request-changes": {
          const reviseSession = sessionManager.resolve(sessionId);
          const revisePersisted = sessionManager.getPersistedSession(sessionId);
          const reviseName = reviseSession?.name ?? revisePersisted?.name ?? sessionId;
          await ctx.respond.reply({
            text: `✏️ Type your revision feedback for [${reviseName}] and I'll forward it to the agent.`,
          });
          break;
        }

        case "session-restart":
        case "session-resume": {
          const result = await executeRespond(sessionManager, {
            session: sessionId,
            message: "Continue where you left off.",
            userInitiated: true,
          });
          await ctx.respond.reply({ text: result.isError ? `⚠️ ${result.text}` : `▶️ ${result.text}` });
          break;
        }

        case "view-output": {
          const result = await makeAgentOutputTool().execute("callback", { session: sessionId, lines: 50 });
          await ctx.respond.reply({ text: toolResultText(result) });
          break;
        }

        case "question-answer": {
          if (token.optionIndex == null) {
            await ctx.respond.reply({ text: `⚠️ Invalid question-answer action.` });
            break;
          }
          sessionManager.resolveAskUserQuestion(sessionId, token.optionIndex);
          await ctx.respond.reply({ text: `✅ Answer submitted.` });
          break;
        }

        default: {
          await ctx.respond.reply({
            text: `⚠️ Unknown callback action.`,
          });
          break;
        }
      }

      return { handled: true };
    },
  };
}
