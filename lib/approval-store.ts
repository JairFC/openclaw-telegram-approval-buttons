// ─────────────────────────────────────────────────────────────────────────────
// telegram-approval-buttons · lib/approval-store.ts
// In-memory store for pending approvals with TTL-based cleanup
// ─────────────────────────────────────────────────────────────────────────────

import type { ApprovalChannel, ApprovalInfo, Logger, SentApproval } from "../types.js";

/**
 * Manages the lifecycle of pending approval requests.
 *
 * Responsibilities:
 * - Track sent approval messages (approval ID → SentApproval)
 * - Auto-purge stale entries after configurable TTL
 * - Provide stats for diagnostics
 *
 * All state is in-memory — approvals are ephemeral by nature
 * and don't survive gateway restarts (by design).
 */
export class ApprovalStore {
  private readonly pending = new Map<string, SentApproval>();
  private totalProcessed = 0;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly staleTtlMs: number,
    private readonly log?: Logger,
    private readonly onExpired?: (entry: SentApproval) => void,
  ) { }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  /**
   * Start periodic stale-entry cleanup (runs every staleTtlMs / 2).
   */
  start(): void {
    if (this.cleanupTimer) return;
    const interval = Math.max(this.staleTtlMs / 2, 30_000);
    this.cleanupTimer = setInterval(() => this.cleanStale(), interval);
    // Prevent the timer from keeping the process alive
    if (this.cleanupTimer && typeof this.cleanupTimer === "object" && "unref" in this.cleanupTimer) {
      (this.cleanupTimer as NodeJS.Timeout).unref();
    }
  }

  /**
   * Stop the cleanup timer.
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  // ── Core operations ───────────────────────────────────────────────────

  /**
   * Track a newly sent approval message.
   */
  add(
    approvalId: string,
    channel: ApprovalChannel,
    ref: { messageId?: number; slackTs?: string },
    info: ApprovalInfo,
  ): void {
    this.pending.set(approvalId, {
      channel,
      messageId: ref.messageId ?? 0,
      slackTs: ref.slackTs ?? "",
      info,
      sentAt: Date.now(),
    });
  }

  /**
   * Check if an approval is already being tracked.
   */
  has(approvalId: string): boolean {
    return this.pending.has(approvalId);
  }

  /**
   * Get a pending approval entry.
   */
  get(approvalId: string): SentApproval | undefined {
    return this.pending.get(approvalId);
  }

  /**
   * Resolve (remove) a pending approval and increment the processed counter.
   * Returns the entry if it existed.
   */
  resolve(approvalId: string): SentApproval | undefined {
    const entry = this.pending.get(approvalId);
    if (entry) {
      this.pending.delete(approvalId);
      this.totalProcessed++;
    }
    return entry;
  }

  /**
   * Get a read-only view of all pending approvals.
   */
  entries(): ReadonlyMap<string, SentApproval> {
    return this.pending;
  }

  // ── Stats ─────────────────────────────────────────────────────────────

  get pendingCount(): number {
    return this.pending.size;
  }

  get processedCount(): number {
    return this.totalProcessed;
  }

  // ── Cleanup ───────────────────────────────────────────────────────────

  /**
   * Remove entries older than staleTtlMs.
   * Calls onExpired callback for each removed entry (e.g., to edit the Telegram message).
   */
  cleanStale(): number {
    const now = Date.now();
    let removed = 0;

    for (const [id, entry] of this.pending) {
      if (now - entry.sentAt > this.staleTtlMs) {
        this.pending.delete(id);
        removed++;
        this.log?.debug?.(
          `[approval-store] purged stale: ${id.slice(0, 8)}… (age=${Math.floor((now - entry.sentAt) / 1000)}s)`,
        );
        try {
          this.onExpired?.(entry);
        } catch {
          // Non-critical — just log and continue
        }
      }
    }

    if (removed > 0) {
      this.log?.info(`[approval-store] cleaned ${removed} stale entries`);
    }

    return removed;
  }
}
