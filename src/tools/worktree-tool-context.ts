import type { PersistedSessionInfo } from "../types";
import type { Session } from "../session";
import { getPersistedMutationRefs, getPrimarySessionLookupRef } from "../session-backend-ref";
import type { SessionManager } from "../session-manager";

export interface ResolvedWorktreeToolTarget {
  activeSession?: Session;
  persistedSession?: PersistedSessionInfo;
  persistedRef?: string;
  sessionName: string;
  worktreePath?: string;
  originalWorkdir?: string;
  branchName?: string;
  notificationTarget?: {
    id: string;
    harnessSessionId?: string;
    backendRef?: Session["backendRef"] | PersistedSessionInfo["backendRef"];
    route?: PersistedSessionInfo["route"];
  };
}

export function resolveWorktreeToolTarget(sessionManager: SessionManager, ref: string): ResolvedWorktreeToolTarget {
  const activeSession = sessionManager.resolve(ref);
  const persistedSession = sessionManager.getPersistedSession(ref);
  const persistedRef = activeSession
    ? getPrimarySessionLookupRef(activeSession)
    : (persistedSession ? getPrimarySessionLookupRef(persistedSession) : undefined);

  return {
    activeSession,
    persistedSession,
    persistedRef,
    sessionName: activeSession?.name ?? persistedSession?.name ?? ref,
    worktreePath: activeSession?.worktreePath ?? persistedSession?.worktreePath,
    originalWorkdir: activeSession?.originalWorkdir ?? persistedSession?.workdir,
    branchName: activeSession?.worktreeBranch ?? persistedSession?.worktreeBranch,
    notificationTarget: activeSession ?? (persistedSession
      ? {
          id: persistedRef ?? ref,
          harnessSessionId: persistedSession.harnessSessionId,
          backendRef: persistedSession.backendRef,
          route: persistedSession.route,
        }
      : undefined),
  };
}

export function getPersistedTargetMutationRefs(target: ResolvedWorktreeToolTarget): string[] {
  return target.persistedSession ? getPersistedMutationRefs(target.persistedSession) : [];
}
