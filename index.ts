// ─────────────────────────────────────────────────────────────────────────────
// telegram-approval-buttons · index.ts (v4.1.0)
// Plugin entry point — orchestration only, all logic lives in lib/
//
// Adds inline keyboard buttons to exec approval messages in Telegram.
// When a user taps a button, OpenClaw processes the /approve command
// automatically via its callback_query → synthetic text message pipeline.
// ─────────────────────────────────────────────────────────────────────────────

import type { PluginConfig } from "./types.js";

// ── Modules ─────────────────────────────────────────────────────────────────

import { TelegramApi } from "./lib/telegram-api.js";
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
  resolveConfig,
  runHealthCheck,
  logStartupDiagnostics,
  runStartupChecks,
} from "./lib/diagnostics.js";

// ── Constants ───────────────────────────────────────────────────────────────

const PLUGIN_VERSION = "4.1.0";
const TAG = "telegram-approval-buttons";

// ── Plugin registration ─────────────────────────────────────────────────────

function register(api: any): void {
  const log = api.logger;
  const startedAt = Date.now();

  // ─── 1. Resolve config ────────────────────────────────────────────────

  const pluginCfg: PluginConfig = api.pluginConfig ?? {};
  const telegramCfg = api.config?.channels?.telegram ?? {};

  const config = resolveConfig(
    {
      pluginConfig: pluginCfg,
      telegramChannelConfig: {
        token: telegramCfg.token || telegramCfg.botToken,
        allowFrom: telegramCfg.allowFrom,
      },
      env: {
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
        TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
      },
    },
    log,
  );

  if (!config) {
    log.warn(`[${TAG}] v${PLUGIN_VERSION} loaded (DISABLED — missing config)`);
    return;
  }

  logStartupDiagnostics(config, log);

  // ─── 2. Initialize modules ───────────────────────────────────────────

  const tg = new TelegramApi(config.botToken, config.verbose ? log : undefined);

  const store = new ApprovalStore(
    config.staleMins * 60_000,
    config.verbose ? log : undefined,
    // onExpired: edit the Telegram message to show "expired"
    (entry) => {
      tg.editMessageText(
        config.chatId,
        entry.messageId,
        formatApprovalExpired(entry.info),
      ).catch(() => { });
    },
  );

  // ─── 3. Register background service (cleanup timer) ──────────────────

  api.registerService({
    id: `${TAG}-cleanup`,
    start: () => {
      store.start();
      // Non-blocking connectivity check
      runStartupChecks(tg, log).catch(() => { });
    },
    stop: () => store.stop(),
  });

  // ─── 4. Register /approvalstatus command ─────────────────────────────

  api.registerCommand({
    name: "approvalstatus",
    description: "Show approval buttons plugin health and stats",
    acceptsArgs: false,
    requireAuth: true,
    handler: async () => {
      const health = await runHealthCheck(config, tg, store, startedAt);
      return { text: formatHealthCheck(health) };
    },
  });

  // ─── 5. Register message_sending hook ────────────────────────────────

  api.on(
    "message_sending",
    async (
      event: { to: string; content: string; metadata?: Record<string, unknown> },
      ctx: { channelId: string; accountId?: string },
    ) => {
      // Only intercept Telegram messages
      if (ctx.channelId !== "telegram") return;

      // ── 5a. Check for approval resolution ───────────────────────────
      const resolution = detectApprovalResult(event.content, store.entries());
      if (resolution) {
        const entry = store.resolve(resolution.id);
        if (entry) {
          log.info(
            `[${TAG}] resolved ${resolution.id.slice(0, 8)}… → ${resolution.action}`,
          );
          const edited = await tg.editMessageText(
            config.chatId,
            entry.messageId,
            formatApprovalResolved(entry.info, resolution.action),
          );
          if (edited && config.verbose) {
            log.info(`[${TAG}] edited msg=${entry.messageId}`);
          }
        }
        // Don't cancel — let resolution messages pass through
        return;
      }

      // ── 5b. Check for new approval request ─────────────────────────
      const info = parseApprovalText(event.content);
      if (!info) return;

      // Duplicate guard
      if (store.has(info.id)) {
        if (config.verbose) {
          log.info(`[${TAG}] skipping duplicate ${info.id.slice(0, 8)}…`);
        }
        return { cancel: true };
      }

      log.info(`[${TAG}] intercepting ${info.id.slice(0, 8)}…`);

      // Send formatted message with inline buttons
      const messageId = await tg.sendMessage(
        config.chatId,
        formatApprovalRequest(info),
        buildApprovalKeyboard(info.id),
      );

      if (messageId === null) {
        log.warn(`[${TAG}] send failed for ${info.id.slice(0, 8)}… — falling back to plain text`);
        // Don't cancel: let the plain-text message through as fallback
        return;
      }

      // Track it
      store.add(info.id, messageId, info);
      log.info(`[${TAG}] sent buttons for ${info.id.slice(0, 8)}… (msg=${messageId})`);

      // Cancel the original plain-text message
      return { cancel: true };
    },
  );

  // ─── Done ─────────────────────────────────────────────────────────────

  log.info(`[${TAG}] v${PLUGIN_VERSION} loaded ✓`);
}

// ─── Plugin export ──────────────────────────────────────────────────────────

export default {
  id: "telegram-approval-buttons",
  name: "Telegram Approval Buttons",
  description:
    "Adds inline keyboard buttons to exec approval messages in Telegram. " +
    "Tap to approve/deny without typing commands.",
  version: PLUGIN_VERSION,
  kind: "extension" as const,
  register,
};
