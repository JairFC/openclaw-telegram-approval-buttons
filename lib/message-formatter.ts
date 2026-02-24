// ─────────────────────────────────────────────────────────────────────────────
// approval-buttons · lib/message-formatter.ts
// HTML message formatting for Telegram (approval requests & resolutions)
// ─────────────────────────────────────────────────────────────────────────────

import type { ApprovalAction, ApprovalInfo } from "../types.js";

// ─── HTML escaping ──────────────────────────────────────────────────────────

/** Escape text for Telegram HTML parse mode. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ─── Approval request format ────────────────────────────────────────────────

/**
 * Format an approval request as a rich HTML message for Telegram.
 */
export function formatApprovalRequest(info: ApprovalInfo): string {
  const e = escapeHtml;
  return [
    `🔐 <b>Exec Approval</b>`,
    ``,
    `<pre>${e(info.command)}</pre>`,
    ``,
    `📁 <code>${e(info.cwd)}</code>`,
    `🤖 ${e(info.agent)} · ⏱️ ${e(info.expires)}`,
    `🆔 <code>${e(info.id)}</code>`,
  ].join("\n");
}

// ─── Resolved approval format ───────────────────────────────────────────────

const ACTION_ICONS: Record<ApprovalAction, string> = {
  "allow-once": "✅",
  "allow-always": "🔏",
  deny: "❌",
};

const ACTION_LABELS: Record<ApprovalAction, string> = {
  "allow-once": "Allowed (once)",
  "allow-always": "Always allowed",
  deny: "Denied",
};

/**
 * Format a resolved approval (post-decision) as an HTML message.
 * Buttons are removed and the header shows the resolution.
 */
export function formatApprovalResolved(
  info: ApprovalInfo,
  action: ApprovalAction,
): string {
  const e = escapeHtml;
  const icon = ACTION_ICONS[action] ?? "✅";
  const label = ACTION_LABELS[action] ?? action;

  return [
    `${icon} <b>${label}</b>`,
    ``,
    `<pre>${e(info.command)}</pre>`,
    ``,
    `🤖 ${e(info.agent)} · 🆔 <code>${e(info.id)}</code>`,
  ].join("\n");
}

// ─── Inline keyboard ────────────────────────────────────────────────────────

/**
 * Build the inline keyboard markup for an approval request.
 *
 * Each button uses `/approve <id> <action>` as callback_data.
 * OpenClaw's Telegram integration converts unknown callback_data
 * into synthetic text messages, so these are processed as commands
 * automatically — no webhook needed.
 */
export function buildApprovalKeyboard(approvalId: string): object {
  return {
    inline_keyboard: [
      [
        { text: "✅ Allow Once", callback_data: `/approve ${approvalId} allow-once` },
        { text: "🔏 Always", callback_data: `/approve ${approvalId} allow-always` },
      ],
      [{ text: "❌ Deny", callback_data: `/approve ${approvalId} deny` }],
    ],
  };
}

// ─── Stale approval format ──────────────────────────────────────────────────

/**
 * Format a stale/expired approval message.
 */
export function formatApprovalExpired(info: ApprovalInfo): string {
  const e = escapeHtml;
  return [
    `⏰ <b>Expired</b>`,
    ``,
    `<pre>${e(info.command)}</pre>`,
    ``,
    `🤖 ${e(info.agent)} · 🆔 <code>${e(info.id)}</code>`,
  ].join("\n");
}

// ─── Health / diagnostics format ────────────────────────────────────────────

/**
 * Format a health check result for display.
 */
export function formatHealthCheck(health: {
  ok: boolean;
  config: { telegramChatId: boolean; telegramToken: boolean; slackToken: boolean; slackChannel: boolean };
  telegram: { reachable: boolean; botUsername?: string; error?: string };
  slack: { reachable: boolean; teamName?: string; error?: string };
  store: { pending: number; totalProcessed: number };
  uptime: number;
}): string {
  const uptimeMin = Math.floor(health.uptime / 60_000);
  const lines = [
    `${health.ok ? "🟢" : "🔴"} Approval Buttons Status`,
    ``,
  ];

  // Telegram status
  const tgConfigured = health.config.telegramChatId && health.config.telegramToken;
  if (tgConfigured) {
    lines.push(`Telegram: chatId=${health.config.telegramChatId ? "✓" : "✗"} · token=${health.config.telegramToken ? "✓" : "✗"}`);
    if (health.telegram.reachable) {
      lines.push(`  ✓ connected (@${health.telegram.botUsername ?? "?"})`);
    } else {
      lines.push(`  ✗ ${health.telegram.error ?? "unreachable"}`);
    }
  } else {
    lines.push(`Telegram: not configured`);
  }

  // Slack status
  const slackConfigured = health.config.slackToken && health.config.slackChannel;
  if (slackConfigured) {
    lines.push(`Slack: token=${health.config.slackToken ? "✓" : "✗"} · channel=${health.config.slackChannel ? "✓" : "✗"}`);
    if (health.slack.reachable) {
      lines.push(`  ✓ connected (${health.slack.teamName ?? "?"})`);
    } else {
      lines.push(`  ✗ ${health.slack.error ?? "unreachable"}`);
    }
  } else {
    lines.push(`Slack: not configured`);
  }

  lines.push(
    ``,
    `Pending: ${health.store.pending} · Processed: ${health.store.totalProcessed}`,
    `Uptime: ${uptimeMin}m`,
  );

  return lines.join("\n");
}
