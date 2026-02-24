// ─────────────────────────────────────────────────────────────────────────────
// approval-buttons · lib/diagnostics.ts
// Self-diagnostics: config validation, connectivity check, auto-repair
// ─────────────────────────────────────────────────────────────────────────────

import type { HealthCheck, Logger, PluginConfig, ResolvedConfig } from "../types.js";
import type { TelegramApi } from "./telegram-api.js";
import type { SlackApi } from "./slack-api.js";
import type { ApprovalStore } from "./approval-store.js";

// ─── Config resolution ─────────────────────────────────────────────────────

export interface ConfigSources {
  pluginConfig: PluginConfig;
  telegramChannelConfig: { token?: string; allowFrom?: (string | number)[] };
  slackChannelConfig: { token?: string; botToken?: string; allowFrom?: (string | number)[] };
  env: {
    TELEGRAM_BOT_TOKEN?: string;
    TELEGRAM_CHAT_ID?: string;
    SLACK_BOT_TOKEN?: string;
    SLACK_CHANNEL_ID?: string;
  };
}

/**
 * Resolve plugin configuration from multiple sources with priority:
 * 1. pluginConfig (explicit config in openclaw.json)
 * 2. channels.telegram / channels.slack (shared channel config)
 * 3. Environment variables (fallback)
 *
 * Returns null only if BOTH Telegram and Slack are unconfigurable.
 * Either channel can be independently enabled/disabled.
 */
export function resolveConfig(
  sources: ConfigSources,
  log: Logger,
): ResolvedConfig | null {
  const { pluginConfig, telegramChannelConfig, slackChannelConfig, env } = sources;

  // ── Telegram config ─────────────────────────────────────────────────
  const tgBotToken =
    pluginConfig.botToken ||
    telegramChannelConfig.token ||
    env.TELEGRAM_BOT_TOKEN ||
    "";

  let tgChatId = pluginConfig.chatId || env.TELEGRAM_CHAT_ID || "";

  if (!tgChatId && Array.isArray(telegramChannelConfig.allowFrom)) {
    const first = telegramChannelConfig.allowFrom[0];
    const candidate = String(first ?? "");
    if (/^-?\d+$/.test(candidate)) {
      tgChatId = candidate;
      log.info(
        `[diagnostics] Auto-resolved Telegram chatId from channels.telegram.allowFrom: ${tgChatId}`,
      );
    }
  }

  const telegram =
    tgBotToken && tgChatId
      ? { chatId: tgChatId, botToken: tgBotToken }
      : null;

  if (!telegram) {
    log.info("[diagnostics] Telegram not configured (optional)");
  }

  // ── Slack config ────────────────────────────────────────────────────
  const slackBotToken =
    pluginConfig.slackBotToken ||
    slackChannelConfig.botToken ||
    slackChannelConfig.token ||
    env.SLACK_BOT_TOKEN ||
    "";

  let slackChannelId = pluginConfig.slackChannelId || env.SLACK_CHANNEL_ID || "";

  // Auto-detect from Slack channel's allowFrom (user/channel ID)
  if (!slackChannelId && Array.isArray(slackChannelConfig.allowFrom)) {
    const first = slackChannelConfig.allowFrom[0];
    const candidate = String(first ?? "");
    // Slack IDs start with U (user), D (DM), C (channel), G (group)
    if (/^[UDCGW][A-Z0-9]+$/.test(candidate)) {
      slackChannelId = candidate;
      log.info(
        `[diagnostics] Auto-resolved Slack channelId from channels.slack.allowFrom: ${slackChannelId}`,
      );
    }
  }

  const slack =
    slackBotToken && slackChannelId
      ? { channelId: slackChannelId, botToken: slackBotToken }
      : null;

  if (!slack) {
    log.info("[diagnostics] Slack not configured (optional)");
  }

  // ── At least one channel required ─────────────────────────────────
  if (!telegram && !slack) {
    log.error(
      "[diagnostics] Plugin disabled — neither Telegram nor Slack is configured",
    );
    return null;
  }

  // ── Optional config with defaults ───────────────────────────────────
  const staleMins =
    typeof pluginConfig.staleMins === "number" && pluginConfig.staleMins > 0
      ? pluginConfig.staleMins
      : 10;

  const verbose = pluginConfig.verbose === true;

  return { telegram, slack, staleMins, verbose };
}

// ─── Health check ───────────────────────────────────────────────────────────

/**
 * Run a full health check: config + connectivity + store stats.
 */
export async function runHealthCheck(
  config: ResolvedConfig | null,
  tg: TelegramApi | null,
  slackApi: SlackApi | null,
  store: ApprovalStore,
  startedAt: number,
): Promise<HealthCheck> {
  const health: HealthCheck = {
    ok: false,
    config: {
      telegramChatId: !!config?.telegram?.chatId,
      telegramToken: !!config?.telegram?.botToken,
      slackToken: !!config?.slack?.botToken,
      slackChannel: !!config?.slack?.channelId,
    },
    telegram: { reachable: false },
    slack: { reachable: false },
    store: {
      pending: store.pendingCount,
      totalProcessed: store.processedCount,
    },
    uptime: Date.now() - startedAt,
  };

  // Telegram connectivity
  if (config?.telegram && tg) {
    const me = await tg.getMe();
    if (me.ok) {
      health.telegram.reachable = true;
      health.telegram.botUsername = me.username;
    } else {
      health.telegram.error = me.error;
    }
  } else {
    health.telegram.error = "not configured";
  }

  // Slack connectivity
  if (config?.slack && slackApi) {
    const auth = await slackApi.authTest();
    if (auth.ok) {
      health.slack.reachable = true;
      health.slack.teamName = auth.teamName;
    } else {
      health.slack.error = auth.error;
    }
  } else {
    health.slack.error = "not configured";
  }

  health.ok = health.telegram.reachable || health.slack.reachable;
  return health;
}

// ─── Startup diagnostics ────────────────────────────────────────────────────

/**
 * Log startup diagnostic summary.
 */
export function logStartupDiagnostics(
  config: ResolvedConfig,
  log: Logger,
): void {
  const channels: string[] = [];

  if (config.telegram) {
    const maskedToken = config.telegram.botToken.slice(0, 6) + "…" + config.telegram.botToken.slice(-4);
    const maskedChatId = config.telegram.chatId.slice(0, 3) + "…" + config.telegram.chatId.slice(-2);
    channels.push(`telegram(chatId=${maskedChatId}, token=${maskedToken})`);
  }

  if (config.slack) {
    const maskedToken = config.slack.botToken.slice(0, 8) + "…" + config.slack.botToken.slice(-4);
    const maskedChannel = config.slack.channelId.slice(0, 3) + "…" + config.slack.channelId.slice(-2);
    channels.push(`slack(channel=${maskedChannel}, token=${maskedToken})`);
  }

  log.info(
    `[diagnostics] Config OK → ${channels.join(", ")}, ` +
      `staleMins=${config.staleMins}, verbose=${config.verbose}`,
  );
}

/**
 * Run async startup checks (non-blocking).
 */
export async function runStartupChecks(
  tg: TelegramApi | null,
  slackApi: SlackApi | null,
  log: Logger,
): Promise<void> {
  if (tg) {
    const me = await tg.getMe();
    if (me.ok) {
      log.info(`[diagnostics] Telegram connected → @${me.username}`);
    } else {
      log.warn(`[diagnostics] Telegram unreachable: ${me.error}`);
    }
  }

  if (slackApi) {
    const auth = await slackApi.authTest();
    if (auth.ok) {
      log.info(`[diagnostics] Slack connected → ${auth.teamName}`);
    } else {
      log.warn(`[diagnostics] Slack unreachable: ${auth.error}`);
    }
  }
}
