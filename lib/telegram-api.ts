// ─────────────────────────────────────────────────────────────────────────────
// telegram-approval-buttons · lib/telegram-api.ts
// Telegram Bot API wrapper backed by explicit transport.
// ─────────────────────────────────────────────────────────────────────────────

import type { Logger, ResolvedTelegramConfig } from "../types.js";
import { TelegramTransport } from "./telegram-transport.js";

const API_BASE = "https://api.telegram.org/bot";

interface TgResponse<T = unknown> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

export class TelegramApi {
  private readonly transport: TelegramTransport;

  constructor(
    private readonly token: string,
    telegramConfigOrLog?: ResolvedTelegramConfig | Logger,
    maybeLog?: Logger,
  ) {
    const telegramConfig = telegramConfigOrLog && "chatId" in telegramConfigOrLog
      ? telegramConfigOrLog as ResolvedTelegramConfig
      : undefined;
    const log = telegramConfig ? maybeLog : telegramConfigOrLog as Logger | undefined;
    this.transport = new TelegramTransport(
      telegramConfig?.proxy,
      10_000,
      log,
    );
    this.log = log;
  }

  private readonly log?: Logger;

  private async call<T = unknown>(method: string, body: Record<string, unknown>): Promise<TgResponse<T>> {
    const res = await this.transport.postJson<TgResponse<T>>(`${API_BASE}${this.token}/${method}`, body);
    if (!res.ok) {
      return { ok: false, description: res.error || `HTTP ${res.status}` };
    }
    const data = res.data as TgResponse<T> | undefined;
    if (!data?.ok && this.log) {
      this.log.warn(`[telegram-api] ${method} failed: ${data?.error_code} ${data?.description}`);
    }
    return data ?? { ok: false, description: "empty response" };
  }

  async getMe(): Promise<{ ok: true; username: string } | { ok: false; error: string }> {
    const res = await this.call<{ username: string }>("getMe", {});
    if (res.ok && res.result?.username) {
      return { ok: true, username: res.result.username };
    }
    return { ok: false, error: res.description ?? "unknown error" };
  }

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
    const res = await this.call<{ message_id: number }>("sendMessage", body);
    return res.ok ? (res.result?.message_id ?? null) : null;
  }

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
    if (replyMarkup) body.reply_markup = replyMarkup;
    const res = await this.call("editMessageText", body);
    return res.ok;
  }

  async answerCallbackQuery(
    callbackQueryId: string,
    text?: string,
  ): Promise<boolean> {
    const body: Record<string, unknown> = {
      callback_query_id: callbackQueryId,
    };
    if (text) body.text = text;
    const res = await this.call("answerCallbackQuery", body);
    return res.ok;
  }

  async deleteMessage(chatId: string, messageId: number): Promise<boolean> {
    const res = await this.call("deleteMessage", { chat_id: chatId, message_id: messageId });
    return res.ok;
  }
}
