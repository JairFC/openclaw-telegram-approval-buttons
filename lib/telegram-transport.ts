// ─────────────────────────────────────────────────────────────────────────────
// telegram-approval-buttons · lib/telegram-transport.ts
// Explicit Telegram HTTP transport powered by got + https-proxy-agent.
// ─────────────────────────────────────────────────────────────────────────────

import got from "got";
import { HttpsProxyAgent } from "https-proxy-agent";

import type { Logger } from "../types.js";

export interface ProxyConfig {
  enabled?: boolean;
  url: string;
  strict?: boolean;
  insecureTls?: boolean;
}

export interface TransportResult<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

export class TelegramTransport {
  constructor(
    private readonly proxy?: ProxyConfig,
    private readonly timeoutMs = 10_000,
    private readonly log?: Logger,
  ) {}

  async postJson<T = unknown>(url: string, body: Record<string, unknown>): Promise<TransportResult<T>> {
    try {
      const https = this.proxy?.enabled && this.proxy.url
        ? new HttpsProxyAgent(this.proxy.url, {
            rejectUnauthorized: !(this.proxy.insecureTls === true),
          })
        : undefined;

      const response = await got.post(url, {
        json: body,
        responseType: "json",
        timeout: { request: this.timeoutMs },
        https: {
          rejectUnauthorized: !(this.proxy?.insecureTls === true),
        },
        agent: https ? { https } : undefined,
        throwHttpErrors: false,
      });

      return {
        ok: response.statusCode >= 200 && response.statusCode < 300,
        status: response.statusCode,
        data: response.body as T,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.log?.error(`[telegram-transport] request failed: ${message}`);
      return { ok: false, status: 0, error: message };
    }
  }
}
