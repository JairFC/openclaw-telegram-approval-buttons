// ─────────────────────────────────────────────────────────────────────────────
// telegram-approval-buttons · index.ts (v5.0.1)
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

const PLUGIN_VERSION = "5.0.1";
const TAG = "telegram-approval-buttons";

const RE_RICH_APPROVAL_HEADER = /^\s*🔐\s+<b>Exec Approval<\/b>/i;

function approvalIdVariants(id: string): string[] {
  const clean = id.trim();
  const short = clean.slice(0, 8);
  if (!short || short === clean) return [clean];
  return [clean, short];
}

type CompletionSnapshot = { output: string; capturedAt: number };
type ResolvedSnapshot = { id: string; command: string; resolvedAt: number };

const RE_ASYNC_COMPLETION = /An async command the user already approved has completed\./i;
const RE_COMPLETION_OUTPUT = /Exact completion details:\r?\nExec finished[^\r\n]*\r?\n([\s\S]+?)\r?\n\r?\nReply to the user/i;

function parseAsyncCompletionOutput(text: string): string | null {
  if (!RE_ASYNC_COMPLETION.test(text)) return null;
  const match = text.match(RE_COMPLETION_OUTPUT);
  const output = match?.[1]?.trim();
  return output || null;
}

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
        ).catch(() => { });
      } else if (entry.channel === "slack" && slack && config.slack) {
        slack.updateMessage(
          config.slack.channelId,
          entry.slackTs,
          "Exec Approval Expired",
          formatSlackApprovalExpired(entry.info),
        ).catch(() => { });
      }
    },
  );

  let lastCompletionGlobal: CompletionSnapshot | null = null;
  let lastResolvedGlobal: ResolvedSnapshot | null = null;

  // ─── 4. Register background service (cleanup timer) ──────────────────

  api.registerService({
    id: `${TAG}-cleanup`,
    start: () => {
      store.start();
      runStartupChecks(tg, slack, log).catch(() => { });
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
    "message_received",
    async (
      event: { content: string },
      _ctx: { channelId: string },
    ) => {
      const output = parseAsyncCompletionOutput(event.content);
      if (!output) return;
      lastCompletionGlobal = {
        output,
        capturedAt: Date.now(),
      };
      if (config.verbose) {
        log.info(`[${TAG}] captured async completion output (${output.length} chars)`);
      }
    },
  );

  api.on(
    "message_sending",
    async (
      event: { to: string; content: string; metadata?: Record<string, unknown> },
      ctx: { channelId: string; accountId?: string },
    ) => {
      // ── Telegram ──────────────────────────────────────────────────
      if (ctx.channelId === "telegram" && tg && config.telegram) {
        return handleTelegram(
          event,
          config.telegram.chatId,
          tg,
          store,
          log,
          () => lastCompletionGlobal,
          () => { lastCompletionGlobal = null; },
          () => lastResolvedGlobal,
          (next) => { lastResolvedGlobal = next; },
        );
      }

      // ── Slack ─────────────────────────────────────────────────────
      if (ctx.channelId === "slack" && slack && config.slack) {
        return handleSlack(event, config.slack.channelId, slack, store, log);
      }
    },
  );

  // Some OpenClaw builds deliver approval prompts before plugins can cancel.
  // In that case, rewrite the already-sent native approval message in-place
  // to avoid a second "button message".
  api.on(
    "message_sent",
    async (
      event: { content: string; messageId?: string; metadata?: Record<string, unknown> },
      ctx: { channelId: string },
    ) => {
      if (ctx.channelId !== "telegram" || !tg || !config.telegram) return;
      if (RE_RICH_APPROVAL_HEADER.test(event.content)) return;

      const info = parseApprovalText(event.content);
      if (!info) return;

      const rawMsgId =
        event.messageId
        ?? (typeof event.metadata?.message_id === "string" ? event.metadata.message_id : undefined)
        ?? (typeof event.metadata?.messageId === "string" ? event.metadata.messageId : undefined);

      const messageId = rawMsgId ? Number(rawMsgId) : NaN;
      if (!Number.isFinite(messageId)) return;

      const edited = await tg.editMessageText(
        config.telegram.chatId,
        messageId,
        formatApprovalRequest(info),
        buildApprovalKeyboard(info.id),
      );
      if (!edited) return;

      if (!store.has(info.id)) {
        store.add(info.id, "telegram", { messageId }, info);
      }
      log.info(`[${TAG}] telegram upgraded native approval ${info.id.slice(0, 8)}… (msg=${messageId})`);
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
  getLastCompletion: () => CompletionSnapshot | null,
  clearLastCompletion: () => void,
  getLastResolved: () => ResolvedSnapshot | null,
  setLastResolved: (next: ResolvedSnapshot | null) => void,
): Promise<{ cancel: true } | void> {
  // If the agent emits NO_REPLY right after an async exec completion event,
  // convert it into a short delivery so Telegram users still get the result.
  if (event.content.trim() === "NO_REPLY") {
    const completion = getLastCompletion();
    if (completion && Date.now() - completion.capturedAt <= 120_000) {
      await tg.sendMessage(
        chatId,
        [
          "✅ <b>Comando ejecutado</b>",
          "",
          `<pre>${completion.output.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`,
        ].join("\n"),
      );
      clearLastCompletion();
      setLastResolved(null);
      return { cancel: true };
    }

    const resolved = getLastResolved();
    if (resolved && Date.now() - resolved.resolvedAt <= 120_000) {
      await tg.sendMessage(
        chatId,
        [
          "✅ <b>Comando ejecutado</b>",
          "",
          `<code>${resolved.command.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code>`,
          "",
          "La salida no se reenvio por el agente (NO_REPLY).",
        ].join("\n"),
      );
      setLastResolved(null);
      return { cancel: true };
    }

    if (log?.info) log.info(`[${TAG}] NO_REPLY without completion snapshot`);
  }

  // Check for approval resolution
  const resolution = detectApprovalResult(event.content, store.entries());
  if (resolution) {
    const entry = store.resolve(resolution.id);
    if (entry && entry.channel === "telegram") {
      log.info(`[${TAG}] telegram resolved ${resolution.id.slice(0, 8)}… → ${resolution.action}`);
      setLastResolved({
        id: resolution.id,
        command: entry.info.command,
        resolvedAt: Date.now(),
      });
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

  const looksLikeAssistantFallback =
    /\/approve\s+[a-f0-9-]{8,}\s+allow-once/i.test(event.content)
    && !/Exec approval required/i.test(event.content)
    && !/\bApproval required\b/i.test(event.content);

  // Newer OpenClaw builds already send a native approval card/message.
  // Suppress the assistant's plain `/approve ...` fallback so users don't
  // receive a second approval prompt.
  if (looksLikeAssistantFallback) return { cancel: true };

  // If this is the model's fallback "/approve ..." guidance and we already
  // converted the native approval prompt, suppress this duplicate text.
  for (const variant of approvalIdVariants(info.id)) {
    if (store.has(variant)) return { cancel: true };
    for (const pendingId of store.entries().keys()) {
      if (pendingId.startsWith(variant) || variant.startsWith(pendingId)) {
        return { cancel: true };
      }
    }
  }

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
  id: "telegram-approval-buttons",
  name: "Telegram Approval Buttons",
  description:
    "Adds inline buttons to exec approval messages in Telegram and Slack. " +
    "Tap to approve/deny without typing commands.",
  version: PLUGIN_VERSION,
  kind: "extension" as const,
  register,
};
