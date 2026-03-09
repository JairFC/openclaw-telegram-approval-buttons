import type { LocaleDict } from "./en.js";

export const zhCN: LocaleDict = {
  approval: {
    title: "执行审批",
    allowOnce: "允许一次",
    allowAlways: "永久允许",
    deny: "拒绝",
    allowedOnce: "已允许（一次）",
    alwaysAllowed: "已设为永久允许",
    denied: "已拒绝",
    expired: "已过期",
    slackExpiredTitle: "已过期",
    slackRequestFallback: (command: string, agent: string, host: string) =>
      `执行审批请求 — ${command} (${agent}@${host})`,
  },
  health: {
    titleOk: "🟢 审批按钮状态",
    titleError: "🔴 审批按钮状态",
    telegramNotConfigured: "Telegram：未配置",
    slackNotConfigured: "Slack：未配置",
    telegramLine: (chat: boolean, token: boolean) => `Telegram：chatId=${chat ? "✓" : "✗"} · token=${token ? "✓" : "✗"}`,
    slackLine: (token: boolean, channel: boolean) => `Slack：token=${token ? "✓" : "✗"} · channel=${channel ? "✓" : "✗"}`,
    connectedTelegram: (username: string) => `  ✓ 已连接 (@${username})`,
    connectedSlack: (teamName: string) => `  ✓ 已连接 (${teamName})`,
    failed: (error: string) => `  ✗ ${error}`,
    pendingProcessed: (pending: number, processed: number) => `待处理：${pending} · 已处理：${processed}`,
    uptime: (minutes: number) => `运行时间：${minutes} 分钟`,
  },
};
