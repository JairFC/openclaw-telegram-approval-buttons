export const en = {
  approval: {
    title: "Exec Approval",
    allowOnce: "Allow Once",
    allowAlways: "Always",
    deny: "Deny",
    allowedOnce: "Allowed (once)",
    alwaysAllowed: "Always allowed",
    denied: "Denied",
    expired: "Expired",
    slackExpiredTitle: "Expired",
    slackRequestFallback: (command: string, agent: string, host: string) =>
      `Exec Approval Request — ${command} (${agent}@${host})`,
  },
  health: {
    titleOk: "🟢 Approval Buttons Status",
    titleError: "🔴 Approval Buttons Status",
    telegramNotConfigured: "Telegram: not configured",
    slackNotConfigured: "Slack: not configured",
    telegramLine: (chat: boolean, token: boolean) => `Telegram: chatId=${chat ? "✓" : "✗"} · token=${token ? "✓" : "✗"}`,
    slackLine: (token: boolean, channel: boolean) => `Slack: token=${token ? "✓" : "✗"} · channel=${channel ? "✓" : "✗"}`,
    connectedTelegram: (username: string) => `  ✓ connected (@${username})`,
    connectedSlack: (teamName: string) => `  ✓ connected (${teamName})`,
    failed: (error: string) => `  ✗ ${error}`,
    pendingProcessed: (pending: number, processed: number) => `Pending: ${pending} · Processed: ${processed}`,
    uptime: (minutes: number) => `Uptime: ${minutes}m`,
  },
};
export type LocaleDict = typeof en;
