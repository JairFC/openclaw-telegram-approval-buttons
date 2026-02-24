// ─────────────────────────────────────────────────────────────────────────────
// approval-buttons · lib/slack-formatter.ts
// Block Kit message formatting for Slack (approval requests & resolutions)
// ─────────────────────────────────────────────────────────────────────────────

import type { ApprovalAction, ApprovalInfo } from "../types.js";

// ─── Approval request format ────────────────────────────────────────────────

/**
 * Format an approval request as Slack Block Kit blocks.
 */
export function formatSlackApprovalRequest(info: ApprovalInfo): object[] {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: "Exec Approval", emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `\`\`\`${info.command}\`\`\`` },
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `${info.agent} · \`${info.cwd}\` · ${info.expires}` },
        { type: "mrkdwn", text: `ID: \`${info.id}\`` },
      ],
    },
    ...buildSlackApprovalActions(info.id),
  ];
}

/**
 * Build the actions block with approval buttons.
 */
function buildSlackApprovalActions(approvalId: string): object[] {
  return [
    {
      type: "actions",
      block_id: `approval_${approvalId}`,
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Allow Once", emoji: true },
          style: "primary",
          action_id: "approval_allow_once",
          value: `/approve ${approvalId} allow-once`,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Always Allow", emoji: true },
          action_id: "approval_allow_always",
          value: `/approve ${approvalId} allow-always`,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Deny", emoji: true },
          style: "danger",
          action_id: "approval_deny",
          value: `/approve ${approvalId} deny`,
        },
      ],
    },
  ];
}

// ─── Resolved approval format ───────────────────────────────────────────────

const ACTION_ICONS: Record<ApprovalAction, string> = {
  "allow-once": ":white_check_mark:",
  "allow-always": ":lock:",
  deny: ":x:",
};

const ACTION_LABELS: Record<ApprovalAction, string> = {
  "allow-once": "Allowed (once)",
  "allow-always": "Always allowed",
  deny: "Denied",
};

/**
 * Format a resolved approval as Slack Block Kit blocks (no buttons).
 */
export function formatSlackApprovalResolved(
  info: ApprovalInfo,
  action: ApprovalAction,
): object[] {
  const icon = ACTION_ICONS[action] ?? ":white_check_mark:";
  const label = ACTION_LABELS[action] ?? action;

  return [
    {
      type: "header",
      text: { type: "plain_text", text: label, emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `\`\`\`${info.command}\`\`\`` },
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `${icon} ${info.agent} · ID: \`${info.id}\`` }],
    },
  ];
}

// ─── Stale approval format ──────────────────────────────────────────────────

/**
 * Format a stale/expired approval as Slack Block Kit blocks (no buttons).
 */
export function formatSlackApprovalExpired(info: ApprovalInfo): object[] {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: "Expired", emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `\`\`\`${info.command}\`\`\`` },
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `:clock1: ${info.agent} · ID: \`${info.id}\`` }],
    },
  ];
}

// ─── Fallback text ──────────────────────────────────────────────────────────

/**
 * Plain-text fallback for Slack notifications (shown in push notifications).
 */
export function slackFallbackText(info: ApprovalInfo): string {
  return `Exec Approval Request — ${info.command} (${info.agent}@${info.host})`;
}
