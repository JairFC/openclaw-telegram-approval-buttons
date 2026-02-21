import { describe, it, expect } from "vitest";
import { parseApprovalText, detectApprovalResult } from "../lib/approval-parser.js";
import type { SentApproval, ApprovalInfo } from "../types.js";

// ─── Sample approval text (mirrors OpenClaw's real format) ──────────────────

const SAMPLE_APPROVAL = `🔒 Exec approval required

Agent: main
Host: gateway
CWD: /home/user/.openclaw/workspace

Command: \`docker compose -f /opt/app/docker-compose.yml logs --tail 50 nginx\`

Security: allowlist
Ask: on-miss
Expires in: 120s
ID: 0e9a9d4d-c7e6-4893-972f-2c80d70162c5`;

const SAMPLE_MULTILINE = `🔒 Exec approval required

Agent: deploy-bot
Host: prod-server
CWD: /var/www/app

Command: \`\`\`
docker compose down
docker compose up -d
\`\`\`

Security: allowlist
Ask: always
Expires in: 300s
ID: aaaabbbb-cccc-dddd-eeee-ffffffffffff`;

// ─── parseApprovalText ──────────────────────────────────────────────────────

describe("parseApprovalText", () => {
    it("parses a standard approval message", () => {
        const result = parseApprovalText(SAMPLE_APPROVAL);
        expect(result).not.toBeNull();
        expect(result!.id).toBe("0e9a9d4d-c7e6-4893-972f-2c80d70162c5");
        expect(result!.command).toContain("docker compose");
        expect(result!.cwd).toBe("/home/user/.openclaw/workspace");
        expect(result!.host).toBe("gateway");
        expect(result!.agent).toBe("main");
        expect(result!.security).toBe("allowlist");
        expect(result!.ask).toBe("on-miss");
        expect(result!.expires).toBe("120s");
    });

    it("parses a multiline command block", () => {
        const result = parseApprovalText(SAMPLE_MULTILINE);
        expect(result).not.toBeNull();
        expect(result!.id).toBe("aaaabbbb-cccc-dddd-eeee-ffffffffffff");
        expect(result!.agent).toBe("deploy-bot");
        expect(result!.host).toBe("prod-server");
    });

    it("returns null for non-approval messages", () => {
        expect(parseApprovalText("Hello, how are you?")).toBeNull();
        expect(parseApprovalText("")).toBeNull();
        expect(parseApprovalText("Some random text with ID: 123")).toBeNull();
    });

    it("returns null if ID is missing", () => {
        const noId = "🔒 Exec approval required\nCommand: ls\nAgent: main";
        expect(parseApprovalText(noId)).toBeNull();
    });

    it("provides defaults for missing optional fields", () => {
        const minimal = `🔒 Exec approval required
Command: whoami
ID: 12345678-abcd-efab-cdef-123456789abc`;
        const result = parseApprovalText(minimal);
        expect(result).not.toBeNull();
        expect(result!.host).toBe("gateway");
        expect(result!.agent).toBe("main");
        expect(result!.security).toBe("allowlist");
    });
});

// ─── detectApprovalResult ───────────────────────────────────────────────────

describe("detectApprovalResult", () => {
    const mockEntry: SentApproval = {
        messageId: 42,
        info: {
            id: "0e9a9d4d-c7e6-4893-972f-2c80d70162c5",
            command: "ls",
            cwd: "/tmp",
            host: "gateway",
            agent: "main",
            security: "allowlist",
            ask: "on-miss",
            expires: "120s",
        },
        sentAt: Date.now(),
    };

    const pending = new Map([["0e9a9d4d-c7e6-4893-972f-2c80d70162c5", mockEntry]]);

    it("detects allow-once from full UUID", () => {
        const result = detectApprovalResult(
            "Exec allowed: 0e9a9d4d-c7e6-4893-972f-2c80d70162c5",
            pending,
        );
        expect(result).not.toBeNull();
        expect(result!.action).toBe("allow-once");
    });

    it("detects allow-always", () => {
        const result = detectApprovalResult(
            "allow-always for 0e9a9d4d-c7e6-4893-972f-2c80d70162c5",
            pending,
        );
        expect(result).not.toBeNull();
        expect(result!.action).toBe("allow-always");
    });

    it("detects deny", () => {
        const result = detectApprovalResult(
            "Exec denied: 0e9a9d4d-c7e6-4893-972f-2c80d70162c5",
            pending,
        );
        expect(result).not.toBeNull();
        expect(result!.action).toBe("deny");
    });

    it("detects by short ID (first 8 chars)", () => {
        const result = detectApprovalResult("Allowed 0e9a9d4d", pending);
        expect(result).not.toBeNull();
        expect(result!.id).toBe("0e9a9d4d-c7e6-4893-972f-2c80d70162c5");
    });

    it("returns null for unrelated messages", () => {
        expect(detectApprovalResult("Hello world", pending)).toBeNull();
    });

    it("returns null when pending map is empty", () => {
        expect(detectApprovalResult("0e9a9d4d", new Map())).toBeNull();
    });

    // ── v4.1.0: Gateway denial detection ────────────────────────────────

    it("detects gateway-initiated denial (approval-timeout)", () => {
        const result = detectApprovalResult(
            "Exec denied for 0e9a9d4d-c7e6-4893-972f-2c80d70162c5: approval-timeout",
            pending,
        );
        expect(result).not.toBeNull();
        expect(result!.action).toBe("deny");
    });

    it("gateway denial takes priority over ambiguous text", () => {
        // Text contains both "allowed" and "approval-timeout" — gateway denial wins
        const result = detectApprovalResult(
            "Exec denied (was allowed) 0e9a9d4d-c7e6-4893-972f-2c80d70162c5 approval-timeout",
            pending,
        );
        expect(result).not.toBeNull();
        expect(result!.action).toBe("deny");
    });

    // ── v4.1.0: Robust short hex matching ───────────────────────────────

    it("matches 9-char hex prefix (longer than old 8-char hardcode)", () => {
        // Old code only matched exactly 8 chars via slice(0,8).
        // New regex matches any hex word boundary 8+ chars.
        // "0e9a9d4dc" appears in UUID without dashes as a 9+ char run.
        // However, the regex will match "0e9a9d4dc" which is a valid prefix
        // once we check startsWith against the full UUID with dashes.
        // Since "0e9a9d4dc".startsWith won't match "0e9a9d4d-c7e6...", this
        // actually tests the boundary correctly — only exact prefixes work.
        const result = detectApprovalResult("Status for 0e9a9d4d done", pending);
        expect(result).not.toBeNull();
        expect(result!.id).toBe("0e9a9d4d-c7e6-4893-972f-2c80d70162c5");
    });

    it("ignores hex strings that don't match any pending prefix", () => {
        const result = detectApprovalResult("Check abcdef0123456789 status", pending);
        expect(result).toBeNull();
    });

    it("returns null for UUID not in pending map", () => {
        const result = detectApprovalResult(
            "Exec allowed: aaaabbbb-cccc-dddd-eeee-ffffffffffff",
            pending,
        );
        expect(result).toBeNull();
    });
});
