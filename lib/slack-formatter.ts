// ─────────────────────────────────────────────────────────────────────────────
// telegram-approval-buttons · lib/slack-formatter.ts
// Block Kit message formatting for Slack (approval requests & resolutions)
// ─────────────────────────────────────────────────────────────────────────────

import type { ApprovalAction, ApprovalInfo } from "../types.js";
import type { LocaleDict } from "../locales/en.js";

export function formatSlackApprovalRequest(info: ApprovalInfo, t: LocaleDict): object[] {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: t.approval.title, emoji: true },
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
    ...buildSlackApprovalActions(info.id, t),
  ];
}

function buildSlackApprovalActions(approvalId: string, t: LocaleDict): object[] {
  return [
    {
      type: "actions",
      block_id: `approval_${approvalId}`,
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: t.approval.allowOnce, emoji: true },
          style: "primary",
          action_id: "approval_allow_once",
          value: `/approve ${approvalId} allow-once`,
        },
        {
          type: "button",
          text: { type: "plain_text", text: t.approval.allowAlways, emoji: true },
          action_id: "approval_allow_always",
          value: `/approve ${approvalId} allow-always`,
        },
        {
          type: "button",
          text: { type: "plain_text", text: t.approval.deny, emoji: true },
          style: "danger",
          action_id: "approval_deny",
          value: `/approve ${approvalId} deny`,
        },
      ],
    },
  ];
}

const ACTION_ICONS: Record<ApprovalAction, string> = {
  "allow-once": ":white_check_mark:",
  "allow-always": ":lock:",
  deny: ":x:",
};

function actionLabel(action: ApprovalAction, t: LocaleDict): string {
  if (action === "allow-once") return t.approval.allowedOnce;
  if (action === "allow-always") return t.approval.alwaysAllowed;
  return t.approval.denied;
}

export function formatSlackApprovalResolved(
  info: ApprovalInfo,
  action: ApprovalAction,
  t: LocaleDict,
): object[] {
  const icon = ACTION_ICONS[action] ?? ":white_check_mark:";
  const label = actionLabel(action, t);

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

export function formatSlackApprovalExpired(info: ApprovalInfo, t: LocaleDict): object[] {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: t.approval.slackExpiredTitle, emoji: true },
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

export function slackFallbackText(info: ApprovalInfo, t: LocaleDict): string {
  return t.approval.slackRequestFallback(info.command, info.agent, info.host);
}
