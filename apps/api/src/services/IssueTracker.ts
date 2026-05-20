import type { EvaluationIssue } from '@svg-builder/shared';

interface TrackedIssue {
  key: string;
  issue: EvaluationIssue;
  firstSeenIteration: number;
  lastSeenIteration: number;
  occurrenceCount: number;
}

export class IssueTracker {
  private history: Map<string, TrackedIssue> = new Map();
  private currentIteration = 0;

  /**
   * Track issues from current iteration and detect stale/duplicate patterns
   */
  trackIssues(issues: EvaluationIssue[], iteration: number): {
    newIssues: EvaluationIssue[];
    resolvedIssues: EvaluationIssue[];
    staleIssues: EvaluationIssue[];
    isStuck: boolean;
    stuckReason?: string;
  } {
    this.currentIteration = iteration;
    const currentKeys = new Set<string>();
    const newIssues: EvaluationIssue[] = [];
    const staleIssues: EvaluationIssue[] = [];

    for (const issue of issues) {
      const key = this.issueKey(issue);
      currentKeys.add(key);

      const existing = this.history.get(key);
      if (existing) {
        existing.lastSeenIteration = iteration;
        existing.occurrenceCount++;

        // Issue is stale if it appears 3+ times
        if (existing.occurrenceCount >= 3) {
          staleIssues.push(issue);
        }
      } else {
        this.history.set(key, {
          key,
          issue,
          firstSeenIteration: iteration,
          lastSeenIteration: iteration,
          occurrenceCount: 1,
        });
        newIssues.push(issue);
      }
    }

    // Find resolved issues (were in history but not in current)
    const resolvedIssues: EvaluationIssue[] = [];
    for (const [key, tracked] of this.history) {
      if (!currentKeys.has(key) && tracked.lastSeenIteration === iteration - 1) {
        resolvedIssues.push(tracked.issue);
      }
    }

    // Check if stuck
    const isStuck = this.detectStuckPattern(currentKeys, staleIssues);

    return {
      newIssues,
      resolvedIssues,
      staleIssues,
      isStuck: isStuck.stuck,
      stuckReason: isStuck.reason,
    };
  }

  /**
   * Get all currently active issues (seen in last iteration)
   */
  getActiveIssues(): EvaluationIssue[] {
    return Array.from(this.history.values())
      .filter((t) => t.lastSeenIteration === this.currentIteration)
      .map((t) => t.issue);
  }

  /**
   * Get summary of issue history for prompt enrichment
   */
  getHistorySummary(): string {
    const entries = Array.from(this.history.values())
      .sort((a, b) => b.occurrenceCount - a.occurrenceCount);

    if (entries.length === 0) return 'No previous issues tracked.';

    return entries
      .map(
        (e) =>
          `- [${e.issue.severity}] ${e.issue.type} on "${e.issue.target}" (first: iter ${e.firstSeenIteration}, last: iter ${e.lastSeenIteration}, count: ${e.occurrenceCount}x): ${e.issue.problem}`
      )
      .join('\n');
  }

  /**
   * Check if we should force stop iteration
   */
  shouldForceStop(iteration: number): { shouldStop: boolean; reason?: string } {
    // Hard limit
    if (iteration >= 15) {
      return { shouldStop: true, reason: 'Reached maximum iteration limit (15)' };
    }

    // Check for stuck pattern
    const activeIssues = this.getActiveIssues();
    const allStale = activeIssues.length > 0 && activeIssues.every((issue) => {
      const key = this.issueKey(issue);
      const tracked = this.history.get(key);
      return tracked && tracked.occurrenceCount >= 3;
    });

    if (allStale) {
      return {
        shouldStop: true,
        reason: `All remaining issues are stale (repeated 3+ times). Best effort achieved.`,
      };
    }

    return { shouldStop: false };
  }

  private issueKey(issue: EvaluationIssue): string {
    // Normalize problem text for comparison (remove specific numbers/positions)
    const normalizedProblem = issue.problem
      .toLowerCase()
      .replace(/\d+/g, 'N')
      .replace(/\b(px|pixel|percent|%|em|rem)\b/g, 'UNIT')
      .trim();
    return `${issue.type}|${issue.target}|${normalizedProblem}`;
  }

  private detectStuckPattern(
    currentKeys: Set<string>,
    staleIssues: EvaluationIssue[]
  ): { stuck: boolean; reason?: string } {
    // Stuck if all current issues are stale
    if (currentKeys.size > 0 && staleIssues.length === currentKeys.size) {
      return {
        stuck: true,
        reason: `All ${currentKeys.size} remaining issues have been unresolved for 3+ iterations`,
      };
    }

    // Stuck if no progress for 5 iterations (same set of issues)
    const recentIterations = new Set<number>();
    for (const tracked of this.history.values()) {
      recentIterations.add(tracked.lastSeenIteration);
    }

    if (this.currentIteration >= 5 && recentIterations.size === 1) {
      const onlyIteration = Array.from(recentIterations)[0];
      if (onlyIteration < this.currentIteration - 2) {
        return {
          stuck: true,
          reason: `No new issues resolved in the last ${this.currentIteration - onlyIteration} iterations`,
        };
      }
    }

    return { stuck: false };
  }
}
