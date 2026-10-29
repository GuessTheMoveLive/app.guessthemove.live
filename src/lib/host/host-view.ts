import type { ParticipantState } from '#lib/round/round-machine.js';
import type { AnswerKeyStep, Tier } from '#lib/round/scoring.js';
import { sanToGlyph } from '#lib/round/participant-input.js';

// Pure derivations for the v1 Host control screen (#34). The Host screen consumes
// the broadcast round snapshot from SessionRoom. Per #35, the non-playing
// "host-host" Host Display may show each Participant's live submitted move during
// an active Round — #10's full display-parity rule only protected a Host who was
// also playing, which v1 doesn't have yet.

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

export interface ScoreboardRow {
	participantId: string;
	/** Running total coming into this Round, or through it once scored (#32). */
	score: number;
	/** This Round's submitted move, glyph-rendered (#35) — null while still pending. */
	move: string | null;
}

/**
 * The always-visible Host scoreboard: every Participant with their running score
 * and (once submitted) this Round's move, highest score first, ties broken by
 * participantId. Unlike {@link topLeaderboard} this is the full roster, not a
 * top-N, and it's meant to stay on screen across every phase, not just between
 * Rounds — kick stays available per-row alongside it.
 */
export function scoreboardRows(
	participants: Record<string, ParticipantState>,
	totals: Record<string, number>,
	priorTotals: Record<string, number>
): ScoreboardRow[] {
	return Object.entries(participants)
		.map(([participantId, state]) => ({
			participantId,
			score: totals[participantId] ?? priorTotals[participantId] ?? 0,
			move: state.status === 'submitted' || state.status === 'late' ? sanToGlyph(state.guess) : null
		}))
		.sort((a, b) => b.score - a.score || a.participantId.localeCompare(b.participantId));
}

/**
 * How many Participants have locked in an answer vs the full roster — the
 * "3/8 answered" indicator.
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

export interface AnswerKeyRow {
	/** The raw SAN (kept for a stable {#each} key). */
	san: string;
	/** The move, glyph-rendered the same way as everywhere else (#24). */
	glyph: string;
	tier: Tier;
	eval: number | null;
	/** The continuation Variant, glyph-rendered; empty for the move played. */
	continuation: string[];
}

/**
 * The full answer-key breakdown the Host sees live during the Round (#36): the move
 * actually played first (always the +3 best), then every graded alternative with its
 * tier, eval and continuation Variant. The answer key is precomputed and server-held
 * (#27) and the Host already knows the Featured Game (#22), so there's no reason to
 * withhold it - it gives the Host talking points before anyone's even submitted. All
 * move text is glyph-rendered; chess notation itself is never translated.
 */
export function answerKeyBreakdown(step: AnswerKeyStep | null): AnswerKeyRow[] {
	if (!step) return [];
	return [
		{ san: step.san, glyph: sanToGlyph(step.san), tier: '+3', eval: step.playedComment?.eval ?? null, continuation: [] },
		...step.alternatives.map((alt) => ({
			san: alt.san,
			glyph: sanToGlyph(alt.san),
			tier: alt.tier,
			eval: alt.eval,
			continuation: alt.continuation.map(sanToGlyph)
		}))
	];
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
