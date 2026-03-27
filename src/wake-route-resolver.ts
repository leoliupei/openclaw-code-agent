import type { SessionRoute } from "./types";
import { resolveNotificationRoute } from "./session-route";

export type NotificationRoute = {
  channel: string;
  target: string;
  accountId?: string;
  threadId?: string;
  sessionKey?: string;
};

type RoutableSession = {
  route?: SessionRoute;
  originChannel?: string;
  originThreadId?: string | number;
  originSessionKey?: string;
};

export class WakeRouteResolver {
  resolve(session: RoutableSession): NotificationRoute | undefined {
    const route = resolveNotificationRoute(session);
    if (!route?.provider || !route.target) return undefined;
    return {
      channel: route.provider,
      target: route.target,
      accountId: route.accountId,
      threadId: route.threadId,
      sessionKey: route.sessionKey,
    };
  }

  summary(route?: NotificationRoute): string {
    if (!route) return "system";
    const account = route.accountId ? `|${route.accountId}` : "";
    const thread = route.threadId ? `#${route.threadId}` : "";
    return `${route.channel}${account}|${route.target}${thread}`;
  }
}
