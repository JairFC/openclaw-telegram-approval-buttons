// ─────────────────────────────────────────────────────────────────────────────
// approval-buttons · lib/slack-api.ts
// Isolated Slack Web API wrapper — only depends on fetch (Node built-in)
// ─────────────────────────────────────────────────────────────────────────────

import type { Logger } from "../types.js";

const API_BASE = "https://slack.com/api/";
const REQUEST_TIMEOUT_MS = 10_000;

// ─── Internal helpers ───────────────────────────────────────────────────────

interface SlackResponse<T = unknown> {
  ok: boolean;
  error?: string;
  ts?: string;
  channel?: string;
  [key: string]: unknown;
}

async function slackFetch<T = unknown>(
  token: string,
  method: string,
  body: Record<string, unknown>,
  log?: Logger,
): Promise<SlackResponse<T>> {
  const url = `${API_BASE}${method}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timer);

    const data = (await res.json()) as SlackResponse<T>;
    if (!data.ok && log) {
      log.warn(`[slack-api] ${method} failed: ${data.error}`);
    }
    return data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log?.error(`[slack-api] ${method} network error: ${msg}`);
    return { ok: false, error: msg };
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Slack Web API client.
 * Instantiate with a bot OAuth token; all methods are self-contained.
 */
export class SlackApi {
  constructor(
    private readonly token: string,
    private readonly log?: Logger,
  ) {}

  // ── Connectivity ────────────────────────────────────────────────────────

  /**
   * Call auth.test to verify the bot token and get bot info.
   */
  async authTest(): Promise<{ ok: true; botId: string; teamName: string } | { ok: false; error: string }> {
    const res = await slackFetch<{ bot_id: string; team: string }>(
      this.token,
      "auth.test",
      {},
      this.log,
    );
    if (res.ok) {
      return {
        ok: true,
        botId: (res as any).bot_id ?? (res as any).user_id ?? "unknown",
        teamName: (res as any).team ?? "unknown",
      };
    }
    return { ok: false, error: res.error ?? "unknown error" };
  }

  // ── Messaging ───────────────────────────────────────────────────────────

  /**
   * Send a message with Block Kit blocks to a channel or DM.
   * For DMs, pass the user's Slack ID as channelId — Slack opens the DM automatically.
   * Returns the message timestamp (ts) on success, null on failure.
   */
  async postMessage(
    channelId: string,
    text: string,
    blocks: object[],
  ): Promise<string | null> {
    const res = await slackFetch(
      this.token,
      "chat.postMessage",
      {
        channel: channelId,
        text, // fallback for notifications
        blocks,
      },
      this.log,
    );
    return res.ok ? (res.ts as string ?? null) : null;
  }

  /**
   * Update an existing message's text and blocks.
   * Returns true on success.
   */
  async updateMessage(
    channelId: string,
    ts: string,
    text: string,
    blocks: object[],
  ): Promise<boolean> {
    const res = await slackFetch(
      this.token,
      "chat.update",
      {
        channel: channelId,
        ts,
        text,
        blocks,
      },
      this.log,
    );
    return res.ok;
  }
}
