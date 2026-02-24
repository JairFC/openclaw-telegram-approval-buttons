import { describe, it, expect } from "vitest";
import {
    formatSlackApprovalRequest,
    formatSlackApprovalResolved,
    formatSlackApprovalExpired,
    slackFallbackText,
} from "../lib/slack-formatter.js";
import type { ApprovalInfo } from "../types.js";

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

// ─── formatSlackApprovalRequest ─────────────────────────────────────────────

describe("formatSlackApprovalRequest", () => {
    it("returns an array of blocks", () => {
        const blocks = formatSlackApprovalRequest(sampleInfo);
        expect(Array.isArray(blocks)).toBe(true);
        expect(blocks.length).toBeGreaterThan(0);
    });

    it("includes a header block", () => {
        const blocks = formatSlackApprovalRequest(sampleInfo) as any[];
        const header = blocks.find((b) => b.type === "header");
        expect(header).toBeDefined();
        expect(header.text.text).toContain("Exec Approval");
    });

    it("includes an actions block with 3 buttons", () => {
        const blocks = formatSlackApprovalRequest(sampleInfo) as any[];
        const actions = blocks.find((b) => b.type === "actions");
        expect(actions).toBeDefined();
        expect(actions.elements).toHaveLength(3);
    });

    it("buttons have correct action_ids", () => {
        const blocks = formatSlackApprovalRequest(sampleInfo) as any[];
        const actions = blocks.find((b) => b.type === "actions");
        const ids = actions.elements.map((e: any) => e.action_id);
        expect(ids).toContain("approval_allow_once");
        expect(ids).toContain("approval_allow_always");
        expect(ids).toContain("approval_deny");
    });

    it("buttons have /approve commands as values", () => {
        const blocks = formatSlackApprovalRequest(sampleInfo) as any[];
        const actions = blocks.find((b) => b.type === "actions");
        expect(actions.elements[0].value).toBe(`/approve ${sampleInfo.id} allow-once`);
        expect(actions.elements[1].value).toBe(`/approve ${sampleInfo.id} allow-always`);
        expect(actions.elements[2].value).toBe(`/approve ${sampleInfo.id} deny`);
    });

    it("includes command in a section block", () => {
        const blocks = formatSlackApprovalRequest(sampleInfo) as any[];
        const commandBlock = blocks.find(
            (b: any) => b.type === "section" && b.text?.text?.includes("docker compose"),
        );
        expect(commandBlock).toBeDefined();
    });

    it("includes the approval ID in a context block", () => {
        const blocks = formatSlackApprovalRequest(sampleInfo) as any[];
        const ctx = blocks.find((b) => b.type === "context");
        expect(ctx).toBeDefined();
        const text = ctx.elements.map((e: any) => e.text).join(" ");
        expect(text).toContain(sampleInfo.id);
    });

    it("does not include unnecessary internal fields", () => {
        const blocks = formatSlackApprovalRequest(sampleInfo) as any[];
        const allText = JSON.stringify(blocks);
        expect(allText).not.toContain("Security");
        expect(allText).not.toContain("Host");
        expect(allText).not.toContain("*Ask:*");
    });
});

// ─── formatSlackApprovalResolved ────────────────────────────────────────────

describe("formatSlackApprovalResolved", () => {
    it("shows allow-once label", () => {
        const blocks = formatSlackApprovalResolved(sampleInfo, "allow-once") as any[];
        const header = blocks.find((b) => b.type === "header");
        expect(header.text.text).toContain("Allowed (once)");
    });

    it("shows allow-always label", () => {
        const blocks = formatSlackApprovalResolved(sampleInfo, "allow-always") as any[];
        const header = blocks.find((b) => b.type === "header");
        expect(header.text.text).toContain("Always allowed");
    });

    it("shows deny label", () => {
        const blocks = formatSlackApprovalResolved(sampleInfo, "deny") as any[];
        const header = blocks.find((b) => b.type === "header");
        expect(header.text.text).toContain("Denied");
    });

    it("does not include an actions block", () => {
        const blocks = formatSlackApprovalResolved(sampleInfo, "allow-once") as any[];
        const actions = blocks.find((b) => b.type === "actions");
        expect(actions).toBeUndefined();
    });
});

// ─── formatSlackApprovalExpired ─────────────────────────────────────────────

describe("formatSlackApprovalExpired", () => {
    it("shows expiry header", () => {
        const blocks = formatSlackApprovalExpired(sampleInfo) as any[];
        const header = blocks.find((b) => b.type === "header");
        expect(header.text.text).toBe("Expired");
    });

    it("does not include an actions block", () => {
        const blocks = formatSlackApprovalExpired(sampleInfo) as any[];
        const actions = blocks.find((b) => b.type === "actions");
        expect(actions).toBeUndefined();
    });
});

// ─── slackFallbackText ──────────────────────────────────────────────────────

describe("slackFallbackText", () => {
    it("includes command and agent", () => {
        const text = slackFallbackText(sampleInfo);
        expect(text).toContain("docker compose up -d");
        expect(text).toContain("main");
    });
});
