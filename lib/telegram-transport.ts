// ─────────────────────────────────────────────────────────────────────────────
// telegram-approval-buttons · lib/telegram-transport.ts
// Telegram HTTP transport — zero external runtime dependencies.
//
// Without proxy: uses the global fetch() available in Node 20+.
// With proxy:    uses Node's built-in http/https modules to CONNECT through
//                an HTTP proxy tunnel — no extra packages needed.
// ─────────────────────────────────────────────────────────────────────────────

import * as http from "node:http";
import * as https from "node:https";
import { URL } from "node:url";

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

// ─── Direct fetch (no proxy) ─────────────────────────────────────────────────

async function fetchDirect<T>(
  url: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<TransportResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = (await res.json()) as T;
    return { ok: res.status >= 200 && res.status < 300, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Proxied fetch via HTTP CONNECT tunnel ────────────────────────────────────

function fetchViaProxy<T>(
  targetUrl: string,
  body: Record<string, unknown>,
  proxy: ProxyConfig,
  timeoutMs: number,
): Promise<TransportResult<T>> {
  return new Promise((resolve) => {
    const target = new URL(targetUrl);
    const proxyUrl = new URL(proxy.url);
    const payload = JSON.stringify(body);

    // Open a CONNECT tunnel through the proxy
    const req = http.request({
      host: proxyUrl.hostname,
      port: Number(proxyUrl.port) || 80,
      method: "CONNECT",
      path: `${target.hostname}:${target.port || 443}`,
    });

    const timer = setTimeout(() => {
      req.destroy();
      resolve({ ok: false, status: 0, error: "proxy connect timeout" });
    }, timeoutMs);

    req.on("connect", (_res, socket) => {
      // TLS handshake over the tunnel socket
      const tlsSocket = (https as typeof https).connect({
        host: target.hostname,
        socket,
        rejectUnauthorized: proxy.insecureTls !== true,
      });

      const options: https.RequestOptions = {
        hostname: target.hostname,
        path: target.pathname + target.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        createConnection: () => tlsSocket,
      };

      const innerReq = https.request(options, (innerRes) => {
        const chunks: Buffer[] = [];
        innerRes.on("data", (chunk: Buffer) => chunks.push(chunk));
        innerRes.on("end", () => {
          clearTimeout(timer);
          try {
            const text = Buffer.concat(chunks).toString("utf8");
            const data = JSON.parse(text) as T;
            const status = innerRes.statusCode ?? 0;
            resolve({ ok: status >= 200 && status < 300, status, data });
          } catch {
            resolve({ ok: false, status: 0, error: "invalid JSON response" });
          }
        });
      });

      innerReq.on("error", (err) => {
        clearTimeout(timer);
        resolve({ ok: false, status: 0, error: err.message });
      });

      innerReq.write(payload);
      innerReq.end();
    });

    req.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, status: 0, error: `proxy error: ${err.message}` });
    });

    req.end();
  });
}

// ─── Public class ─────────────────────────────────────────────────────────────

export class TelegramTransport {
  constructor(
    private readonly proxy?: ProxyConfig,
    private readonly timeoutMs = 10_000,
    private readonly log?: Logger,
  ) {}

  async postJson<T = unknown>(url: string, body: Record<string, unknown>): Promise<TransportResult<T>> {
    const useProxy = this.proxy?.enabled === true && Boolean(this.proxy.url);
    try {
      if (useProxy) {
        return await fetchViaProxy<T>(url, body, this.proxy!, this.timeoutMs);
      }
      return await fetchDirect<T>(url, body, this.timeoutMs);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.log?.error(`[telegram-transport] request failed: ${message}`);
      return { ok: false, status: 0, error: message };
    }
  }
}
