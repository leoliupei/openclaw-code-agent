export {
  definePluginEntry,
  type OpenClawPluginApi,
  type OpenClawPluginToolContext,
  type OpenClawPluginService,
  type OpenClawPluginServiceContext,
  type PluginLogger,
} from "openclaw/plugin-sdk/core";

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";

type InteractiveHandlerRegistration = Parameters<OpenClawPluginApi["registerInteractiveHandler"]>[0];
type TelegramInteractiveRegistration = Extract<InteractiveHandlerRegistration, { channel: "telegram" }>;
type DiscordInteractiveRegistration = Extract<InteractiveHandlerRegistration, { channel: "discord" }>;

export type PluginInteractiveTelegramHandlerContext = Parameters<TelegramInteractiveRegistration["handler"]>[0];
export type PluginInteractiveTelegramHandlerResult = Awaited<ReturnType<TelegramInteractiveRegistration["handler"]>>;
export type PluginInteractiveDiscordHandlerContext = Parameters<DiscordInteractiveRegistration["handler"]>[0];
export type PluginInteractiveDiscordHandlerResult = Awaited<ReturnType<DiscordInteractiveRegistration["handler"]>>;
