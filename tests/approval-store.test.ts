import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApprovalStore } from "../lib/approval-store.js";
import type { ApprovalInfo, SentApproval } from "../types.js";

const sampleInfo: ApprovalInfo = {
    id: "test-id-001",
    command: "ls -la",
    cwd: "/tmp",
    host: "gateway",
    agent: "main",
    security: "allowlist",
    ask: "on-miss",
    expires: "120s",
};

describe("ApprovalStore", () => {
    let store: ApprovalStore;

    beforeEach(() => {
        store = new ApprovalStore(600_000); // 10 min TTL
    });

    afterEach(() => {
        store.stop();
    });

    // ── Basic CRUD ──────────────────────────────────────────────────────────

    it("adds and retrieves an approval", () => {
        store.add("id-1", 100, sampleInfo);
        expect(store.has("id-1")).toBe(true);
        expect(store.get("id-1")).toBeDefined();
        expect(store.get("id-1")!.messageId).toBe(100);
        expect(store.get("id-1")!.info).toEqual(sampleInfo);
    });

    it("returns undefined for unknown IDs", () => {
        expect(store.get("nonexistent")).toBeUndefined();
        expect(store.has("nonexistent")).toBe(false);
    });

    it("tracks pending count", () => {
        expect(store.pendingCount).toBe(0);
        store.add("id-1", 100, sampleInfo);
        store.add("id-2", 101, sampleInfo);
        expect(store.pendingCount).toBe(2);
    });

    // ── Resolve ─────────────────────────────────────────────────────────────

    it("resolves an approval and increments processed count", () => {
        store.add("id-1", 100, sampleInfo);
        const entry = store.resolve("id-1");

        expect(entry).toBeDefined();
        expect(entry!.messageId).toBe(100);
        expect(store.has("id-1")).toBe(false);
        expect(store.pendingCount).toBe(0);
        expect(store.processedCount).toBe(1);
    });

    it("resolve returns undefined for unknown IDs", () => {
        const entry = store.resolve("nonexistent");
        expect(entry).toBeUndefined();
        expect(store.processedCount).toBe(0);
    });

    // ── Entries (read-only view) ────────────────────────────────────────────

    it("provides read-only entries map", () => {
        store.add("id-1", 100, sampleInfo);
        store.add("id-2", 101, sampleInfo);
        const entries = store.entries();
        expect(entries.size).toBe(2);
        expect(entries.has("id-1")).toBe(true);
    });

    // ── Stale cleanup ─────────────────────────────────────────────────────

    it("cleans stale entries", () => {
        vi.useFakeTimers();
        const shortStore = new ApprovalStore(1000); // 1s TTL

        shortStore.add("id-1", 100, sampleInfo);

        // Not stale yet
        expect(shortStore.cleanStale()).toBe(0);
        expect(shortStore.pendingCount).toBe(1);

        // Advance past TTL
        vi.advanceTimersByTime(1500);
        expect(shortStore.cleanStale()).toBe(1);
        expect(shortStore.pendingCount).toBe(0);

        shortStore.stop();
        vi.useRealTimers();
    });

    it("calls onExpired callback for stale entries", () => {
        vi.useFakeTimers();
        const onExpired = vi.fn();
        const shortStore = new ApprovalStore(1000, undefined, onExpired);

        shortStore.add("id-1", 100, sampleInfo);
        vi.advanceTimersByTime(1500);
        shortStore.cleanStale();

        expect(onExpired).toHaveBeenCalledTimes(1);
        expect(onExpired).toHaveBeenCalledWith(
            expect.objectContaining({ messageId: 100 }),
        );

        shortStore.stop();
        vi.useRealTimers();
    });

    it("survives onExpired callback errors", () => {
        vi.useFakeTimers();
        const onExpired = vi.fn(() => {
            throw new Error("callback failed");
        });
        const shortStore = new ApprovalStore(1000, undefined, onExpired);

        shortStore.add("id-1", 100, sampleInfo);
        vi.advanceTimersByTime(1500);

        // Should not throw
        expect(() => shortStore.cleanStale()).not.toThrow();
        expect(shortStore.pendingCount).toBe(0);

        shortStore.stop();
        vi.useRealTimers();
    });

    // ── Lifecycle ─────────────────────────────────────────────────────────

    it("start is idempotent", () => {
        store.start();
        store.start(); // Should not create duplicate timers
        store.stop();
    });

    it("stop without start is safe", () => {
        expect(() => store.stop()).not.toThrow();
    });
});
