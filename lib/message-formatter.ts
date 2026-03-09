// ─────────────────────────────────────────────────────────────────────────────
// telegram-approval-buttons · lib/message-formatter.ts
// HTML message formatting for Telegram (approval requests & resolutions)
// ─────────────────────────────────────────────────────────────────────────────

import type { ApprovalAction, ApprovalInfo } from "../types.js";
import type { LocaleDict } from "../locales/en.js";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function formatApprovalRequest(info: ApprovalInfo, t: LocaleDict): string {
  const e = escapeHtml;
  return [
    `🔐 <b>${t.approval.title}</b>`,
    ``,
    `<pre>${e(info.command)}</pre>`,
    ``,
    `📁 <code>${e(info.cwd)}</code>`,
    `🤖 ${e(info.agent)} · ⏱️ ${e(info.expires)}`,
    `🆔 <code>${e(info.id)}</code>`,
  ].join("\n");
}

const ACTION_ICONS: Record<ApprovalAction, string> = {
  "allow-once": "✅",
  "allow-always": "🔏",
  deny: "❌",
};

function actionLabel(action: ApprovalAction, t: LocaleDict): string {
  if (action === "allow-once") return t.approval.allowedOnce;
  if (action === "allow-always") return t.approval.alwaysAllowed;
  return t.approval.denied;
}

export function formatApprovalResolved(
  info: ApprovalInfo,
  action: ApprovalAction,
  t: LocaleDict,
): string {
  const e = escapeHtml;
  const icon = ACTION_ICONS[action] ?? "✅";
  const label = actionLabel(action, t);

  return [
    `${icon} <b>${label}</b>`,
    ``,
    `<pre>${e(info.command)}</pre>`,
    ``,
    `🤖 ${e(info.agent)} · 🆔 <code>${e(info.id)}</code>`,
  ].join("\n");
}

export function buildApprovalKeyboard(approvalId: string, t: LocaleDict): object {
  return {
    inline_keyboard: [
      [
        { text: `✅ ${t.approval.allowOnce}`, callback_data: `/approve ${approvalId} allow-once` },
        { text: `🔏 ${t.approval.allowAlways}`, callback_data: `/approve ${approvalId} allow-always` },
      ],
      [{ text: `❌ ${t.approval.deny}`, callback_data: `/approve ${approvalId} deny` }],
    ],
  };
}

export function formatApprovalExpired(info: ApprovalInfo, t: LocaleDict): string {
  const e = escapeHtml;
  return [
    `⏰ <b>${t.approval.expired}</b>`,
    ``,
    `<pre>${e(info.command)}</pre>`,
    ``,
    `🤖 ${e(info.agent)} · 🆔 <code>${e(info.id)}</code>`,
  ].join("\n");
}

export function formatHealthCheck(health: {
  ok: boolean;
  config: { telegramChatId: boolean; telegramToken: boolean; slackToken: boolean; slackChannel: boolean };
  telegram: { reachable: boolean; botUsername?: string; error?: string };
  slack: { reachable: boolean; teamName?: string; error?: string };
  store: { pending: number; totalProcessed: number };
  uptime: number;
}, t: LocaleDict): string {
  const uptimeMin = Math.floor(health.uptime / 60_000);
  const lines = [
    health.ok ? t.health.titleOk : t.health.titleError,
    ``,
  ];

  const tgConfigured = health.config.telegramChatId && health.config.telegramToken;
  if (tgConfigured) {
    lines.push(t.health.telegramLine(health.config.telegramChatId, health.config.telegramToken));
    if (health.telegram.reachable) {
      lines.push(t.health.connectedTelegram(health.telegram.botUsername ?? "?"));
    } else {
      lines.push(t.health.failed(health.telegram.error ?? "unreachable"));
    }
  } else {
    lines.push(t.health.telegramNotConfigured);
  }

  const slackConfigured = health.config.slackToken && health.config.slackChannel;
  if (slackConfigured) {
    lines.push(t.health.slackLine(health.config.slackToken, health.config.slackChannel));
    if (health.slack.reachable) {
      lines.push(t.health.connectedSlack(health.slack.teamName ?? "?"));
    } else {
      lines.push(t.health.failed(health.slack.error ?? "unreachable"));
    }
  } else {
    lines.push(t.health.slackNotConfigured);
  }

  lines.push(``, t.health.pendingProcessed(health.store.pending, health.store.totalProcessed), t.health.uptime(uptimeMin));
  return lines.join("\n");
}
