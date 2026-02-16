import { describe, it, expect } from "vitest";
import {
    escapeHtml,
    formatApprovalRequest,
    formatApprovalResolved,
    formatApprovalExpired,
    buildApprovalKeyboard,
    formatHealthCheck,
} from "../lib/message-formatter.js";
import type { ApprovalInfo } from "../types.js";

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
        const html = formatApprovalRequest(sampleInfo);
        expect(html).toContain("Exec Approval Request");
        expect(html).toContain("main");
        expect(html).toContain("gateway");
        expect(html).toContain("/home/user/app");
        expect(html).toContain("docker compose up -d");
        expect(html).toContain("allowlist");
        expect(html).toContain("120s");
        expect(html).toContain(sampleInfo.id);
    });

    it("escapes HTML in command", () => {
        const dangerousInfo = {
            ...sampleInfo,
            command: 'echo "<script>alert(1)</script>"',
        };
        const html = formatApprovalRequest(dangerousInfo);
        expect(html).not.toContain("<script>");
        expect(html).toContain("&lt;script&gt;");
    });
});

// ─── formatApprovalResolved ─────────────────────────────────────────────────

describe("formatApprovalResolved", () => {
    it("shows correct icon for allow-once", () => {
        const html = formatApprovalResolved(sampleInfo, "allow-once");
        expect(html).toContain("✅");
        expect(html).toContain("Allowed (once)");
    });

    it("shows correct icon for allow-always", () => {
        const html = formatApprovalResolved(sampleInfo, "allow-always");
        expect(html).toContain("🔏");
        expect(html).toContain("Always allowed");
    });

    it("shows correct icon for deny", () => {
        const html = formatApprovalResolved(sampleInfo, "deny");
        expect(html).toContain("❌");
        expect(html).toContain("Denied");
    });

    it("does not include security/ask/expires fields (post-resolution)", () => {
        const html = formatApprovalResolved(sampleInfo, "allow-once");
        expect(html).not.toContain("Security:");
        expect(html).not.toContain("Ask:");
        expect(html).not.toContain("Expires:");
    });
});

// ─── formatApprovalExpired ──────────────────────────────────────────────────

describe("formatApprovalExpired", () => {
    it("shows expiry header", () => {
        const html = formatApprovalExpired(sampleInfo);
        expect(html).toContain("Approval Expired");
        expect(html).toContain("⏰");
    });

    it("includes agent, host, command, and id", () => {
        const html = formatApprovalExpired(sampleInfo);
        expect(html).toContain("main");
        expect(html).toContain("gateway");
        expect(html).toContain("docker compose up -d");
        expect(html).toContain(sampleInfo.id);
    });
});

// ─── buildApprovalKeyboard ──────────────────────────────────────────────────

describe("buildApprovalKeyboard", () => {
    it("creates a 2-row keyboard", () => {
        const kb = buildApprovalKeyboard("test-id-123") as any;
        expect(kb.inline_keyboard).toHaveLength(2);
        expect(kb.inline_keyboard[0]).toHaveLength(2); // Allow Once + Always
        expect(kb.inline_keyboard[1]).toHaveLength(1); // Deny
    });

    it("includes correct callback_data with /approve command", () => {
        const kb = buildApprovalKeyboard("test-id-123") as any;
        expect(kb.inline_keyboard[0][0].callback_data).toBe("/approve test-id-123 allow-once");
        expect(kb.inline_keyboard[0][1].callback_data).toBe("/approve test-id-123 allow-always");
        expect(kb.inline_keyboard[1][0].callback_data).toBe("/approve test-id-123 deny");
    });

    it("has emoji labels on buttons", () => {
        const kb = buildApprovalKeyboard("x") as any;
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
            config: { chatId: true, botToken: true },
            telegram: { reachable: true, botUsername: "test_bot" },
            store: { pending: 0, totalProcessed: 5 },
            uptime: 180_000,
        });
        expect(text).toContain("🟢");
        expect(text).toContain("@test_bot");
        expect(text).toContain("Processed: 5");
        expect(text).toContain("3m");
    });

    it("shows red circle when unhealthy", () => {
        const text = formatHealthCheck({
            ok: false,
            config: { chatId: false, botToken: true },
            telegram: { reachable: false, error: "timeout" },
            store: { pending: 2, totalProcessed: 0 },
            uptime: 60_000,
        });
        expect(text).toContain("🔴");
        expect(text).toContain("✗");
        expect(text).toContain("timeout");
    });

    it("does not contain raw HTML tags", () => {
        const text = formatHealthCheck({
            ok: true,
            config: { chatId: true, botToken: true },
            telegram: { reachable: true, botUsername: "bot" },
            store: { pending: 0, totalProcessed: 0 },
            uptime: 0,
        });
        expect(text).not.toContain("<b>");
        expect(text).not.toContain("</b>");
    });
});
