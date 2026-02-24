// ─────────────────────────────────────────────────────────────────────────────
// approval-buttons · index.ts (v5.0.0)
// Plugin entry point — orchestration only, all logic lives in lib/
//
// Adds inline keyboard/button approval messages to Telegram and Slack.
// When a user taps a button, OpenClaw processes the /approve command
// automatically via the channel's callback mechanism.
// ─────────────────────────────────────────────────────────────────────────────

import type { PluginConfig } from "./types.js";

// ── Modules ─────────────────────────────────────────────────────────────────

import { TelegramApi } from "./lib/telegram-api.js";
import { SlackApi } from "./lib/slack-api.js";
import { ApprovalStore } from "./lib/approval-store.js";
import { parseApprovalText, detectApprovalResult } from "./lib/approval-parser.js";
import {
  formatApprovalRequest,
  formatApprovalResolved,
  formatApprovalExpired,
  buildApprovalKeyboard,
  formatHealthCheck,
} from "./lib/message-formatter.js";
import {
  formatSlackApprovalRequest,
  formatSlackApprovalResolved,
  formatSlackApprovalExpired,
  slackFallbackText,
} from "./lib/slack-formatter.js";
import {
  resolveConfig,
  runHealthCheck,
  logStartupDiagnostics,
  runStartupChecks,
} from "./lib/diagnostics.js";

// ── Constants ───────────────────────────────────────────────────────────────

const PLUGIN_VERSION = "5.0.0";
const TAG = "approval-buttons";

// ── Plugin registration ─────────────────────────────────────────────────────

function register(api: any): void {
  const log = api.logger;
  const startedAt = Date.now();

  // ─── 1. Resolve config ────────────────────────────────────────────────

  const pluginCfg: PluginConfig = api.pluginConfig ?? {};
  const telegramCfg = api.config?.channels?.telegram ?? {};
  const slackCfg = api.config?.channels?.slack ?? {};

  const config = resolveConfig(
    {
      pluginConfig: pluginCfg,
      telegramChannelConfig: {
        token: telegramCfg.token || telegramCfg.botToken,
        allowFrom: telegramCfg.allowFrom,
      },
      slackChannelConfig: {
        token: slackCfg.token,
        botToken: slackCfg.botToken,
        allowFrom: slackCfg.allowFrom,
      },
      env: {
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
        TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
        SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
        SLACK_CHANNEL_ID: process.env.SLACK_CHANNEL_ID,
      },
    },
    log,
  );

  if (!config) {
    log.warn(`[${TAG}] v${PLUGIN_VERSION} loaded (DISABLED — no channels configured)`);
    return;
  }

  logStartupDiagnostics(config, log);

  // ─── 2. Initialize API clients ────────────────────────────────────────

  const tg = config.telegram
    ? new TelegramApi(config.telegram.botToken, config.verbose ? log : undefined)
    : null;

  const slack = config.slack
    ? new SlackApi(config.slack.botToken, config.verbose ? log : undefined)
    : null;

  // ─── 3. Initialize store with expiry handler ──────────────────────────

  const store = new ApprovalStore(
    config.staleMins * 60_000,
    config.verbose ? log : undefined,
    // onExpired: edit the message to show "expired"
    (entry) => {
      if (entry.channel === "telegram" && tg && config.telegram) {
        tg.editMessageText(
          config.telegram.chatId,
          entry.messageId,
          formatApprovalExpired(entry.info),
        ).catch(() => {});
      } else if (entry.channel === "slack" && slack && config.slack) {
        slack.updateMessage(
          config.slack.channelId,
          entry.slackTs,
          "Exec Approval Expired",
          formatSlackApprovalExpired(entry.info),
        ).catch(() => {});
      }
    },
  );

  // ─── 4. Register background service (cleanup timer) ──────────────────

  api.registerService({
    id: `${TAG}-cleanup`,
    start: () => {
      store.start();
      runStartupChecks(tg, slack, log).catch(() => {});
    },
    stop: () => store.stop(),
  });

  // ─── 5. Register /approvalstatus command ─────────────────────────────

  api.registerCommand({
    name: "approvalstatus",
    description: "Show approval buttons plugin health and stats",
    acceptsArgs: false,
    requireAuth: true,
    handler: async () => {
      const health = await runHealthCheck(config, tg, slack, store, startedAt);
      return { text: formatHealthCheck(health) };
    },
  });

  // ─── 6. Register message_sending hook ────────────────────────────────

  api.on(
    "message_sending",
    async (
      event: { to: string; content: string; metadata?: Record<string, unknown> },
      ctx: { channelId: string; accountId?: string },
    ) => {
      // ── Telegram ──────────────────────────────────────────────────
      if (ctx.channelId === "telegram" && tg && config.telegram) {
        return handleTelegram(event, config.telegram.chatId, tg, store, log);
      }

      // ── Slack ─────────────────────────────────────────────────────
      if (ctx.channelId === "slack" && slack && config.slack) {
        return handleSlack(event, config.slack.channelId, slack, store, log);
      }
    },
  );

  // ─── Done ─────────────────────────────────────────────────────────────

  const channels = [config.telegram && "Telegram", config.slack && "Slack"]
    .filter(Boolean)
    .join(" + ");
  log.info(`[${TAG}] v${PLUGIN_VERSION} loaded ✓ (${channels})`);
}

// ─── Channel handlers ───────────────────────────────────────────────────────

async function handleTelegram(
  event: { content: string },
  chatId: string,
  tg: TelegramApi,
  store: ApprovalStore,
  log: any,
): Promise<{ cancel: true } | void> {
  // Check for approval resolution
  const resolution = detectApprovalResult(event.content, store.entries());
  if (resolution) {
    const entry = store.resolve(resolution.id);
    if (entry && entry.channel === "telegram") {
      log.info(`[${TAG}] telegram resolved ${resolution.id.slice(0, 8)}… → ${resolution.action}`);
      await tg.editMessageText(
        chatId,
        entry.messageId,
        formatApprovalResolved(entry.info, resolution.action),
      );
    }
    return;
  }

  // Check for new approval request
  const info = parseApprovalText(event.content);
  if (!info) return;

  if (store.has(info.id)) return { cancel: true };

  log.info(`[${TAG}] telegram intercepting ${info.id.slice(0, 8)}…`);

  const messageId = await tg.sendMessage(
    chatId,
    formatApprovalRequest(info),
    buildApprovalKeyboard(info.id),
  );

  if (messageId === null) {
    log.warn(`[${TAG}] telegram send failed for ${info.id.slice(0, 8)}… — falling back`);
    return;
  }

  store.add(info.id, "telegram", { messageId }, info);
  log.info(`[${TAG}] telegram sent buttons for ${info.id.slice(0, 8)}… (msg=${messageId})`);
  return { cancel: true };
}

async function handleSlack(
  event: { content: string },
  channelId: string,
  slackApi: SlackApi,
  store: ApprovalStore,
  log: any,
): Promise<{ cancel: true } | void> {
  // Check for approval resolution
  const resolution = detectApprovalResult(event.content, store.entries());
  if (resolution) {
    const entry = store.resolve(resolution.id);
    if (entry && entry.channel === "slack") {
      log.info(`[${TAG}] slack resolved ${resolution.id.slice(0, 8)}… → ${resolution.action}`);
      await slackApi.updateMessage(
        channelId,
        entry.slackTs,
        `Exec ${resolution.action}`,
        formatSlackApprovalResolved(entry.info, resolution.action),
      );
    }
    return;
  }

  // Check for new approval request
  const info = parseApprovalText(event.content);
  if (!info) return;

  if (store.has(info.id)) return { cancel: true };

  log.info(`[${TAG}] slack intercepting ${info.id.slice(0, 8)}…`);

  const ts = await slackApi.postMessage(
    channelId,
    slackFallbackText(info),
    formatSlackApprovalRequest(info),
  );

  if (ts === null) {
    log.warn(`[${TAG}] slack send failed for ${info.id.slice(0, 8)}… — falling back`);
    return;
  }

  store.add(info.id, "slack", { slackTs: ts }, info);
  log.info(`[${TAG}] slack sent buttons for ${info.id.slice(0, 8)}… (ts=${ts})`);
  return { cancel: true };
}

// ─── Plugin export ──────────────────────────────────────────────────────────

export default {
  id: "approval-buttons",
  name: "Approval Buttons",
  description:
    "Adds inline buttons to exec approval messages in Telegram and Slack. " +
    "Tap to approve/deny without typing commands.",
  version: PLUGIN_VERSION,
  kind: "extension" as const,
  register,
};
