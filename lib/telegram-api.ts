// ─────────────────────────────────────────────────────────────────────────────
// approval-buttons · lib/telegram-api.ts
// Isolated Telegram Bot API wrapper — only depends on fetch (Node built-in)
// ─────────────────────────────────────────────────────────────────────────────

import type { Logger } from "../types.js";

const API_BASE = "https://api.telegram.org/bot";
const REQUEST_TIMEOUT_MS = 10_000;

// ─── Internal helpers ───────────────────────────────────────────────────────

interface TgResponse<T = unknown> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

async function tgFetch<T = unknown>(
  token: string,
  method: string,
  body: Record<string, unknown>,
  log?: Logger,
): Promise<TgResponse<T>> {
  const url = `${API_BASE}${token}/${method}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timer);

    const data = (await res.json()) as TgResponse<T>;
    if (!data.ok && log) {
      log.warn(
        `[telegram-api] ${method} failed: ${data.error_code} ${data.description}`,
      );
    }
    return data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log?.error(`[telegram-api] ${method} network error: ${msg}`);
    return { ok: false, description: msg };
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Telegram Bot API client.
 * Instantiate with a bot token; all methods are self-contained.
 */
export class TelegramApi {
  constructor(
    private readonly token: string,
    private readonly log?: Logger,
  ) { }

  // ── Connectivity ────────────────────────────────────────────────────────

  /**
   * Call getMe to verify the bot token and get bot info.
   * Useful for diagnostics.
   */
  async getMe(): Promise<{ ok: true; username: string } | { ok: false; error: string }> {
    const res = await tgFetch<{ username: string }>(
      this.token,
      "getMe",
      {},
      this.log,
    );
    if (res.ok && res.result?.username) {
      return { ok: true, username: res.result.username };
    }
    return { ok: false, error: res.description ?? "unknown error" };
  }

  // ── Messaging ───────────────────────────────────────────────────────────

  /**
   * Send an HTML-formatted message, optionally with inline keyboard.
   * Returns the message_id on success, null on failure.
   */
  async sendMessage(
    chatId: string,
    text: string,
    replyMarkup?: object,
  ): Promise<number | null> {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    };
    if (replyMarkup) body.reply_markup = replyMarkup;

    const res = await tgFetch<{ message_id: number }>(
      this.token,
      "sendMessage",
      body,
      this.log,
    );
    return res.ok ? (res.result?.message_id ?? null) : null;
  }

  /**
   * Edit an existing message's text and remove inline keyboard.
   * Returns true on success.
   */
  async editMessageText(
    chatId: string,
    messageId: number,
    text: string,
    replyMarkup?: object,
  ): Promise<boolean> {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
    };
    // If replyMarkup is explicitly provided, include it; otherwise omit
    // (omitting reply_markup removes all buttons)
    if (replyMarkup) body.reply_markup = replyMarkup;

    const res = await tgFetch(this.token, "editMessageText", body, this.log);
    return res.ok;
  }

  /**
   * Answer a callback query (acknowledges button press in Telegram UI).
   * Optional text shows as a toast notification to the user.
   */
  async answerCallbackQuery(
    callbackQueryId: string,
    text?: string,
  ): Promise<boolean> {
    const body: Record<string, unknown> = {
      callback_query_id: callbackQueryId,
    };
    if (text) body.text = text;

    const res = await tgFetch(this.token, "answerCallbackQuery", body, this.log);
    return res.ok;
  }

  /**
   * Delete a message from a chat.
   */
  async deleteMessage(chatId: string, messageId: number): Promise<boolean> {
    const res = await tgFetch(
      this.token,
      "deleteMessage",
      { chat_id: chatId, message_id: messageId },
      this.log,
    );
    return res.ok;
  }
}
