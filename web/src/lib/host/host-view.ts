import type { ParticipantState } from '#lib/round/round-machine.js';

// Pure derivations for the v1 Host control screen (#34). The Host screen consumes
// the broadcast round snapshot from SessionRoom and never shows more than a
// Participant may see during an active Round (#10, #6): only submission *counts*,
// never who guessed what, until Reveal.

export interface LeaderboardEntry {
	participantId: string;
	total: number;
}

/**
 * The shared, Kahoot-style Leaderboard: the top-N Participants by running total,
 * highest first, ties broken by participantId for a stable ordering. Defaults to
 * the top 5 shown between Rounds (#23). Reads straight off the round machine's
 * `totals`, which are populated only once a Round closes (#32) — so this is empty
 * until the first Round has been scored.
 */
export function topLeaderboard(totals: Record<string, number>, limit = 5): LeaderboardEntry[] {
	return Object.entries(totals)
		.map(([participantId, total]) => ({ participantId, total }))
		.sort((a, b) => b.total - a.total || a.participantId.localeCompare(b.participantId))
		.slice(0, limit);
}

export interface SubmissionProgress {
	submitted: number;
	total: number;
}

/**
 * How many Participants have locked in an answer vs the full roster — the
 * "3/8 answered" indicator. Content is never exposed, only the count (#6, #10).
 */
export function submissionProgress(
	participants: Record<string, ParticipantState>
): SubmissionProgress {
	const roster = Object.values(participants);
	const submitted = roster.filter((p) => p.status === 'submitted' || p.status === 'late').length;
	return { submitted, total: roster.length };
}

/**
 * True once every Participant has submitted — the signal that it is safe for the
 * Host to Reveal early, before the countdown runs out (#22).
 */
export function everyoneAnswered(participants: Record<string, ParticipantState>): boolean {
	const roster = Object.values(participants);
	return roster.length > 0 && roster.every((p) => p.status === 'submitted' || p.status === 'late');
}

/** Milliseconds left on the Round clock, floored at 0; 0 when no Round is running. */
export function remainingMs(deadline: number | null, now: number): number {
	if (deadline == null) return 0;
	return Math.max(0, deadline - now);
}

/** A remaining duration rendered as `m:ss`, rounding up so the clock hits 0:00 only at the deadline. */
export function formatCountdown(ms: number): string {
	const totalSeconds = Math.ceil(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
