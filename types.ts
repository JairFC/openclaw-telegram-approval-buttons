// ─────────────────────────────────────────────────────────────────────────────
// telegram-approval-buttons · types.ts
// Shared TypeScript interfaces for the plugin
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parsed representation of an OpenClaw exec approval request.
 */
export interface ApprovalInfo {
  /** UUID of the approval request */
  id: string;
  /** Shell command requiring approval */
  command: string;
  /** Working directory where the command would execute */
  cwd: string;
  /** Host machine name */
  host: string;
  /** Agent that requested the command */
  agent: string;
  /** Security policy that triggered the approval */
  security: string;
  /** Ask mode (e.g., "on-miss", "always") */
  ask: string;
  /** Time until approval expires (e.g., "120s") */
  expires: string;
}

/**
 * Which channel the approval was sent on.
 */
export type ApprovalChannel = "telegram" | "slack";

/**
 * A tracked approval that was sent with inline buttons.
 */
export interface SentApproval {
  /** Which channel sent this approval */
  channel: ApprovalChannel;
  /** Telegram message_id (set when channel is "telegram") */
  messageId: number;
  /** Slack message timestamp (set when channel is "slack") */
  slackTs: string;
  /** Parsed approval details */
  info: ApprovalInfo;
  /** Unix timestamp (ms) when the message was sent */
  sentAt: number;
}

/**
 * Resolution of an approval (allow-once, allow-always, deny).
 */
export type ApprovalAction = "allow-once" | "allow-always" | "deny";

/**
 * Result of detecting an approval resolution in a message.
 */
export interface ApprovalResolution {
  /** Approval UUID */
  id: string;
  /** Action that was taken */
  action: ApprovalAction;
}

/**
 * Plugin configuration (from openclaw.json → plugins.entries.<id>.config).
 */
export interface PluginConfig {
  /** Telegram chat ID to send approval buttons to */
  chatId?: string;
  /** Telegram bot token (optional — falls back to channels.telegram.token) */
  botToken?: string;
  /** Slack bot OAuth token (optional — falls back to channels.slack.token) */
  slackBotToken?: string;
  /** Slack channel/DM ID to send approval buttons to (optional — falls back to channels.slack config) */
  slackChannelId?: string;
  /** Stale approval timeout in minutes (default: 10) */
  staleMins?: number;
  /** Enable verbose diagnostic logging (default: false) */
  verbose?: boolean;
}

/**
 * Resolved Telegram configuration.
 */
export interface ResolvedTelegramConfig {
  chatId: string;
  botToken: string;
}

/**
 * Resolved Slack configuration.
 */
export interface ResolvedSlackConfig {
  channelId: string;
  botToken: string;
}

/**
 * Resolved (validated) configuration with all defaults applied.
 */
export interface ResolvedConfig {
  telegram: ResolvedTelegramConfig | null;
  slack: ResolvedSlackConfig | null;
  staleMins: number;
  verbose: boolean;
}

/**
 * Diagnostic health check result.
 */
export interface HealthCheck {
  ok: boolean;
  config: { telegramChatId: boolean; telegramToken: boolean; slackToken: boolean; slackChannel: boolean };
  telegram: { reachable: boolean; botUsername?: string; error?: string };
  slack: { reachable: boolean; teamName?: string; error?: string };
  store: { pending: number; totalProcessed: number };
  uptime: number;
}

/**
 * Minimal logger interface matching OpenClaw's plugin logger.
 */
export interface Logger {
  debug?: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}
