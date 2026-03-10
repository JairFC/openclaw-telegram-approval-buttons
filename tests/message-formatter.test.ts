import { describe, it, expect } from "vitest";
import {
    escapeHtml,
    formatApprovalRequest,
    formatApprovalResolved,
    formatApprovalExpired,
    buildApprovalKeyboard,
    formatHealthCheck,
} from "../lib/message-formatter.js";
import { en } from "../locales/en.js";
import type { ApprovalInfo } from "../types.js";

const t = en;

// ─── Test data ──────────────────────────────────────────────────────────────

const sampleInfo: ApprovalInfo = {
    id: "abc12345-def6-7890-ghij-klmnopqrstuv",
    command: "docker compose up -d",
    cwd: "/home/user/app",
    host: "gateway",
    agent: "main",
    security: "allowlist",
    ask: "on-miss",
    expires: "120s",
};

// ─── escapeHtml ─────────────────────────────────────────────────────────────

describe("escapeHtml", () => {
    it("escapes ampersands", () => {
        expect(escapeHtml("foo & bar")).toBe("foo &amp; bar");
    });

    it("escapes angle brackets", () => {
        expect(escapeHtml("<script>alert('xss')</script>")).toBe(
            "&lt;script&gt;alert('xss')&lt;/script&gt;",
        );
    });

    it("handles empty string", () => {
        expect(escapeHtml("")).toBe("");
    });

    it("leaves clean text unchanged", () => {
        expect(escapeHtml("hello world")).toBe("hello world");
    });
});

// ─── formatApprovalRequest ──────────────────────────────────────────────────

describe("formatApprovalRequest", () => {
    it("includes all required fields", () => {
        const html = formatApprovalRequest(sampleInfo, t);
        expect(html).toContain("Exec Approval");
        expect(html).toContain("main");
        expect(html).toContain("/home/user/app");
        expect(html).toContain("docker compose up -d");
        expect(html).toContain("120s");
        expect(html).toContain(sampleInfo.id);
    });

    it("does not include unnecessary internal fields", () => {
        const html = formatApprovalRequest(sampleInfo, t);
        expect(html).not.toContain("Security:");
        expect(html).not.toContain("Ask:");
        expect(html).not.toContain("Host:");
    });

    it("escapes HTML in command", () => {
        const dangerousInfo = {
            ...sampleInfo,
            command: 'echo "<script>alert(1)</script>"',
        };
        const html = formatApprovalRequest(dangerousInfo, t);
        expect(html).not.toContain("<script>");
        expect(html).toContain("&lt;script&gt;");
    });
});

// ─── formatApprovalResolved ─────────────────────────────────────────────────

describe("formatApprovalResolved", () => {
    it("shows correct icon for allow-once", () => {
        const html = formatApprovalResolved(sampleInfo, "allow-once", t);
        expect(html).toContain("✅");
        expect(html).toContain("Allowed (once)");
    });

    it("shows correct icon for allow-always", () => {
        const html = formatApprovalResolved(sampleInfo, "allow-always", t);
        expect(html).toContain("🔏");
        expect(html).toContain("Always allowed");
    });

    it("shows correct icon for deny", () => {
        const html = formatApprovalResolved(sampleInfo, "deny", t);
        expect(html).toContain("❌");
        expect(html).toContain("Denied");
    });

    it("does not include unnecessary internal fields (post-resolution)", () => {
        const html = formatApprovalResolved(sampleInfo, "allow-once", t);
        expect(html).not.toContain("Security:");
        expect(html).not.toContain("Ask:");
        expect(html).not.toContain("Expires:");
        expect(html).not.toContain("Host:");
    });
});

// ─── formatApprovalExpired ──────────────────────────────────────────────────

describe("formatApprovalExpired", () => {
    it("shows expiry header", () => {
        const html = formatApprovalExpired(sampleInfo, t);
        expect(html).toContain("Expired");
        expect(html).toContain("⏰");
    });

    it("includes agent, command, and id", () => {
        const html = formatApprovalExpired(sampleInfo, t);
        expect(html).toContain("main");
        expect(html).toContain("docker compose up -d");
        expect(html).toContain(sampleInfo.id);
    });
});

// ─── buildApprovalKeyboard ──────────────────────────────────────────────────

describe("buildApprovalKeyboard", () => {
    it("creates a 2-row keyboard", () => {
        const kb = buildApprovalKeyboard("test-id-123", t) as any;
        expect(kb.inline_keyboard).toHaveLength(2);
        expect(kb.inline_keyboard[0]).toHaveLength(2); // Allow Once + Always
        expect(kb.inline_keyboard[1]).toHaveLength(1); // Deny
    });

    it("includes correct callback_data with /approve command", () => {
        const kb = buildApprovalKeyboard("test-id-123", t) as any;
        expect(kb.inline_keyboard[0][0].callback_data).toBe("/approve test-id-123 allow-once");
        expect(kb.inline_keyboard[0][1].callback_data).toBe("/approve test-id-123 allow-always");
        expect(kb.inline_keyboard[1][0].callback_data).toBe("/approve test-id-123 deny");
    });

    it("has emoji labels on buttons", () => {
        const kb = buildApprovalKeyboard("x", t) as any;
        expect(kb.inline_keyboard[0][0].text).toContain("✅");
        expect(kb.inline_keyboard[0][1].text).toContain("🔏");
        expect(kb.inline_keyboard[1][0].text).toContain("❌");
    });
});

// ─── formatHealthCheck ──────────────────────────────────────────────────────

describe("formatHealthCheck", () => {
    it("shows green circle when healthy", () => {
        const text = formatHealthCheck({
            ok: true,
            config: { telegramChatId: true, telegramToken: true, slackToken: false, slackChannel: false },
            telegram: { reachable: true, botUsername: "test_bot" },
            slack: { reachable: false, error: "not configured" },
            store: { pending: 0, totalProcessed: 5 },
            uptime: 180_000,
        }, t);
        expect(text).toContain("🟢");
        expect(text).toContain("@test_bot");
        expect(text).toContain("Processed: 5");
        expect(text).toContain("3m");
    });

    it("shows red circle when unhealthy", () => {
        const text = formatHealthCheck({
            ok: false,
            config: { telegramChatId: true, telegramToken: true, slackToken: false, slackChannel: false },
            telegram: { reachable: false, error: "timeout" },
            slack: { reachable: false, error: "not configured" },
            store: { pending: 2, totalProcessed: 0 },
            uptime: 60_000,
        }, t);
        expect(text).toContain("🔴");
        expect(text).toContain("timeout");
    });

    it("shows slack status when configured", () => {
        const text = formatHealthCheck({
            ok: true,
            config: { telegramChatId: false, telegramToken: false, slackToken: true, slackChannel: true },
            telegram: { reachable: false, error: "not configured" },
            slack: { reachable: true, teamName: "My Team" },
            store: { pending: 1, totalProcessed: 3 },
            uptime: 120_000,
        }, t);
        expect(text).toContain("🟢");
        expect(text).toContain("My Team");
        expect(text).toContain("Slack:");
    });

    it("does not contain raw HTML tags", () => {
        const text = formatHealthCheck({
            ok: true,
            config: { telegramChatId: true, telegramToken: true, slackToken: false, slackChannel: false },
            telegram: { reachable: true, botUsername: "bot" },
            slack: { reachable: false },
            store: { pending: 0, totalProcessed: 0 },
            uptime: 0,
        }, t);
        expect(text).not.toContain("<b>");
        expect(text).not.toContain("</b>");
    });
});
