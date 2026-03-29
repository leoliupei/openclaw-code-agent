import type { SessionRoute } from "./types";

export interface SessionRouteSource {
  route?: SessionRoute;
  originChannel?: string;
  originThreadId?: string | number;
  originSessionKey?: string;
}

function parseDiscordTargetKind(sessionKey?: string): "channel" | "user" | undefined {
  if (!sessionKey) return undefined;
  const match = sessionKey.match(/^agent:[^:]+:discord:(direct|dm|channel|group):/i);
  if (!match?.[1]) return undefined;
  const kind = match[1].toLowerCase();
  return kind === "direct" || kind === "dm" ? "user" : "channel";
}

function normalizeDiscordTarget(target: string, sessionKey?: string): string {
  if (!/^\d+$/.test(target)) return target;
  const kind = parseDiscordTargetKind(sessionKey);
  return kind ? `${kind}:${target}` : `channel:${target}`;
}

function routeToChannelString(route?: SessionRoute): string | undefined {
  if (!route?.provider || !route.target) return undefined;
  if (route.provider === "system" || route.target === "system") return undefined;
  return route.accountId
    ? `${route.provider}|${route.accountId}|${route.target}`
    : `${route.provider}|${route.target}`;
}

function routeFromSessionKey(originSessionKey?: string): SessionRoute | undefined {
  const trimmed = originSessionKey?.trim();
  if (!trimmed) return undefined;

  const match = trimmed.match(/^agent:[^:]+:([^:]+):([^:]+):([^:]+)(?::topic:([^:]+))?$/i);
  if (!match) return undefined;

  const [, providerRaw, kindRaw, targetRaw, threadId] = match;
  const provider = providerRaw.toLowerCase();
  const kind = kindRaw.toLowerCase();
  const target = provider === "discord"
    ? (kind === "direct" || kind === "dm" ? `user:${targetRaw}` : `channel:${targetRaw}`)
    : targetRaw;

  return {
    provider,
    target,
    threadId,
    sessionKey: trimmed,
  };
}

export function parseThreadIdFromSessionKey(sessionKey?: string): number | undefined {
  const match = sessionKey?.match(/:topic:(\d+)$/);
  return match ? parseInt(match[1], 10) : undefined;
}

export function isDirectSessionRoute(route?: SessionRoute): boolean {
  return Boolean(route?.provider && route.target && route.provider !== "system" && route.target !== "system");
}

export function routeFromOriginMetadata(
  originChannel?: string,
  originThreadId?: string | number,
  originSessionKey?: string,
): SessionRoute | undefined {
  const sessionKeyRoute = routeFromSessionKey(originSessionKey);
  const explicitThreadId = originThreadId != null ? String(originThreadId) : undefined;
  const normalizedChannel = originChannel?.trim();
  if (!normalizedChannel || normalizedChannel === "unknown") {
    if (sessionKeyRoute) {
      return {
        ...sessionKeyRoute,
        threadId: explicitThreadId ?? sessionKeyRoute.threadId,
      };
    }
    return {
      provider: "system",
      target: "system",
      sessionKey: originSessionKey?.trim() || undefined,
    };
  }

  const parts = normalizedChannel.split("|").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) {
    if (sessionKeyRoute) {
      return {
        ...sessionKeyRoute,
        threadId: explicitThreadId ?? sessionKeyRoute.threadId,
      };
    }
    return {
      provider: "system",
      target: "system",
      sessionKey: originSessionKey?.trim() || undefined,
    };
  }

  const [provider, second, third] = parts;
  const rawTarget = third ?? second;
  const accountId = third ? second : undefined;
  if (!provider || !rawTarget) return undefined;

  const target = provider === "discord"
    ? normalizeDiscordTarget(rawTarget, originSessionKey)
    : rawTarget;

  return {
    provider,
    accountId,
    target,
    threadId: explicitThreadId ?? (sessionKeyRoute?.provider === provider ? sessionKeyRoute.threadId : undefined),
    sessionKey: originSessionKey?.trim() || undefined,
  };
}

export function canonicalizeSessionRoute(source: SessionRouteSource): SessionRoute | undefined {
  return routeFromOriginMetadata(
    routeToChannelString(source.route) ?? source.originChannel,
    source.route?.threadId ?? source.originThreadId,
    source.route?.sessionKey ?? source.originSessionKey,
  ) ?? source.route;
}

export function resolveNotificationRoute(source: SessionRouteSource): SessionRoute | undefined {
  const route = canonicalizeSessionRoute(source);
  return isDirectSessionRoute(route) ? route : undefined;
}
