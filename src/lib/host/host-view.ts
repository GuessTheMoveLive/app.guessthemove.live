import type { ParticipantState } from '#lib/round/round-machine.js';
import {
	scoreFromEval,
	playedMoveScore,
	MAX_ROUND_SCORE,
	type AnswerKeyStep
} from '#lib/round/scoring.js';
import {
	sanToGlyph,
	formatNumberedMove,
	formatContinuation,
	type PieceColor
} from '#lib/round/participant-input.js';
import { m } from '#lib/paraglide/messages.js';

// Pure derivations for the v1 Host control screen (#34). The Host screen consumes
// the broadcast round snapshot from SessionRoom. Per #35, the non-playing
// "host-host" Host Display may show each Participant's live submitted move during
// an active Round — #10's full display-parity rule only protected a Host who was
// also playing, which v1 doesn't have yet.

export interface LeaderboardEntry {
	participantId: string;
	total: number;
}

function rankedEntries(totals: Record<string, number>): LeaderboardEntry[] {
	return Object.entries(totals)
		.map(([participantId, total]) => ({ participantId, total }))
		.sort((a, b) => b.total - a.total || a.participantId.localeCompare(b.participantId));
}

/**
 * The shared, Kahoot-style Leaderboard: the top-N Participants by running total,
 * highest first, ties broken by participantId for a stable ordering. Defaults to
 * the top 5 shown between Rounds (#23). Reads straight off the round machine's
 * `totals`, which are populated only once a Round closes (#32) — so this is empty
 * until the first Round has been scored.
 */
export function topLeaderboard(totals: Record<string, number>, limit = 5): LeaderboardEntry[] {
	return rankedEntries(totals).slice(0, limit);
}

/**
 * Every Participant ranked, highest first — the Host's Finished-phase view (#50),
 * unlike {@link topLeaderboard} which caps at a top-N for the shared/Participant view.
 */
export function fullRanking(totals: Record<string, number>): LeaderboardEntry[] {
	return rankedEntries(totals);
}

/**
 * Reorders an already-ranked `entries` list (post-Reveal totals) by each
 * participant's *prior* total instead - the order a Leaderboard should render
 * at the instant it's shown, before animating up to `entries`' own order
 * (#55). Totals in the returned entries are untouched; only the order
 * changes. Same tie-break as {@link topLeaderboard}/{@link fullRanking}.
 */
export function priorRanking(
	entries: LeaderboardEntry[],
	priorTotals: Record<string, number>
): LeaderboardEntry[] {
	return [...entries].sort(
		(a, b) =>
			(priorTotals[b.participantId] ?? 0) - (priorTotals[a.participantId] ?? 0) ||
			a.participantId.localeCompare(b.participantId)
	);
}

/**
 * Each Participant's Round point delta (#68): this Round's total minus the prior
 * Round's total, falling back to 0 for a participant missing from `priorTotals`
 * (their first Round scored) — same convention as {@link priorRanking}. A Participant
 * who did not submit a Guess this Round (timed out) carries no delta at all, not a
 * delta of 0 — keyed off `participants`' status the same way the rest of the
 * Round/Reveal flow already determines submission (e.g. {@link scoreboardRows}),
 * rather than a new data source.
 */
export function roundDeltas(
	entries: LeaderboardEntry[],
	priorTotals: Record<string, number>,
	participants: Record<string, ParticipantState>
): Record<string, number> {
	const deltas: Record<string, number> = {};
	for (const entry of entries) {
		const state = participants[entry.participantId];
		if (state?.status !== 'submitted' && state?.status !== 'late') continue;
		deltas[entry.participantId] = entry.total - (priorTotals[entry.participantId] ?? 0);
	}
	return deltas;
}

export type FinishedMessage =
	| { kind: 'lead' }
	| { kind: 'tiedLead' }
	| { kind: 'behind'; rank: number; points: number; name: string };

/**
 * A Participant's personal message on the Finished phase's full-screen Podium
 * (#50): whoever shares the top score is told they're (tied for) in the lead;
 * everyone else is told their actual rank (#98 — the Podium itself only ever
 * shows the top 3, so anyone further down otherwise has no idea where they
 * landed) plus the point gap to whoever's immediately above them in the
 * ranking — not the overall leader, the next-highest participant above them —
 * and that participant's display name (participantId doubles as the display
 * name captured at join, per GLOSSARY).
 */
export function finishedMessageFor(
	participantId: string,
	totals: Record<string, number>
): FinishedMessage {
	const ranked = rankedEntries(totals);
	const myTotal = totals[participantId] ?? 0;
	const maxTotal = ranked[0]?.total ?? 0;

	if (myTotal === maxTotal) {
		const leaders = ranked.filter((entry) => entry.total === maxTotal);
		return leaders.length > 1 ? { kind: 'tiedLead' } : { kind: 'lead' };
	}

	const myIndex = ranked.findIndex((entry) => entry.participantId === participantId);
	const above = ranked[myIndex - 1];
	return {
		kind: 'behind',
		rank: myIndex + 1,
		points: above.total - myTotal,
		name: above.participantId
	};
}

export interface BelowTopStanding {
	/** This Participant's actual rank, one-based (6, 7, ...) — render with
	 *  {@link localizedOrdinal} rather than as a bare number. */
	rank: number;
	/** Point gap to the Participant directly above them in the ranking — not the
	 *  overall leader, same convention as {@link finishedMessageFor}'s 'behind' case. */
	points: number;
	name: string;
}

/**
 * A Participant's standing when they've fallen outside the Leaderboard's top-N
 * (#98): the shared Leaderboard only ever renders the top 5, so a Participant
 * ranked 6th or below would otherwise see the Ranking card with no feedback
 * about themselves at all. Returns `null` for anyone inside the top-N — they
 * already see their own highlighted row there, nothing extra to say. Ties are
 * broken by participantId, same as {@link topLeaderboard}.
 */
export function belowTopStanding(
	participantId: string,
	totals: Record<string, number>,
	limit = 5
): BelowTopStanding | null {
	const ranked = rankedEntries(totals);
	const myIndex = ranked.findIndex((entry) => entry.participantId === participantId);
	if (myIndex === -1 || myIndex < limit) return null;

	const above = ranked[myIndex - 1];
	return {
		rank: myIndex + 1,
		points: above.total - ranked[myIndex].total,
		name: above.participantId
	};
}

/**
 * `rank` rendered as that locale's own ordinal ("6th"/"6e"/"6.º"/"6."), for
 * {@link belowTopStanding}'s message — the only locale-sensitive formatting
 * this project does outside the generated Paraglide messages themselves, since
 * ordinal suffixes aren't expressible as an inlang message-format plural.
 */
export function localizedOrdinal(rank: number, locale: string): string {
	if (locale === 'fr') return rank === 1 ? `${rank}er` : `${rank}e`;
	if (locale === 'de') return `${rank}.`;
	if (locale === 'es') return `${rank}.º`;

	const mod100 = rank % 100;
	if (mod100 >= 11 && mod100 <= 13) return `${rank}th`;
	switch (rank % 10) {
		case 1:
			return `${rank}st`;
		case 2:
			return `${rank}nd`;
		case 3:
			return `${rank}rd`;
		default:
			return `${rank}th`;
	}
}

/**
 * The maximum points still obtainable in the Rounds yet to come — the footer
 * banner's "keep concentrated" nudge. `roundIndex` is the current Round
 * (0-based); `roundScored` is true once that Round's own Guess Score is locked
 * in (Reveal onward) so it's excluded from "still to come" alongside it.
 */
export function pointsStillAvailable(
	roundIndex: number,
	totalRounds: number,
	roundScored: boolean
): number {
	const remainingRounds = totalRounds - roundIndex - (roundScored ? 1 : 0);
	return Math.max(0, remainingRounds) * MAX_ROUND_SCORE;
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
 * Rounds — kick stays available per-row alongside it. `featuredColor` is the current
 * Round's mover (#88) — every submitted guess is a guess at that same move, so one
 * color glyph-renders the whole column.
 */
export function scoreboardRows(
	participants: Record<string, ParticipantState>,
	totals: Record<string, number>,
	priorTotals: Record<string, number>,
	featuredColor: PieceColor
): ScoreboardRow[] {
	return Object.entries(participants)
		.map(([participantId, state]) => ({
			participantId,
			score: totals[participantId] ?? priorTotals[participantId] ?? 0,
			move:
				state.status === 'submitted' || state.status === 'late'
					? sanToGlyph(state.guess, featuredColor)
					: null
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

/** The Answer Key's own display label: the -3..+3 score written out explicitly
 *  (#91) rather than bucketed behind the word "blunder" - so a graduated
 *  penalty sorts and reads as the move's actual rank, same as every other
 *  score band. */
export type AnswerKeyTierLabel = '+3' | '+2' | '+1' | '0' | '-1' | '-2' | '-3';

/** A -3..+3 score, formatted as the Answer Key displays it: a leading '+' for
 *  anything above zero, the bare number otherwise (so '0' reads as '0', never
 *  '+0', and a blunder's depth reads as '-1'/'-2'/'-3' instead of a flat
 *  "blunder" label, #91). */
function formatScoreLabel(score: number): AnswerKeyTierLabel {
	return (score > 0 ? `+${score}` : `${score}`) as AnswerKeyTierLabel;
}

export interface AnswerKeyRow {
	/** The raw SAN (kept for a stable {#each} key). */
	san: string;
	/** The move, glyph-rendered and move-number-prefixed the same way as the
	 *  Participant's Continuation (#43/#51), e.g. "5.Nf3". */
	glyph: string;
	tier: AnswerKeyTierLabel;
	eval: number | null;
	/** The continuation Variant, glyph-rendered and numbered the same way as the
	 *  Participant's Continuation (#43/#51); empty for the move played. */
	continuation: string;
	/** True only for the row whose SAN is the Featured Side's actual move - the one
	 *  the Answer Key's gold border keys off (#61), never any other row that happens
	 *  to also compute to tier +3. */
	isGameMove: boolean;
	/** The GM-bonus remark (#61), shown only on the game-move row, only when its own
	 *  computed tier is below +3 - explains why it still displays and scores +3. */
	remark: string | null;
}

/** A row's rank for sorting, before display's +3 override is applied: the move's own
 *  Evaluation, mirrored into the mover's perspective (#65) - finer-grained than the
 *  bucketed computed tier, so moves sharing a tier but differing in actual strength
 *  (e.g. the real Capablanca-Marshall move 5's Ba4/O-O vs the move played, d3, which
 *  all compute to tier +2) still rank apart instead of being treated as tied. Null
 *  when the move's own Evaluation is unknown - an unanalyzed eval can't be placed by
 *  strength, and sorts last via the comparator below. */
function strengthRank(step: AnswerKeyStep, evalPawns: number | null): number | null {
	if (evalPawns == null) return null;
	return step.color === 'w' ? evalPawns : -evalPawns;
}

/** Descending by rank, unknown-eval rows last, nulls/equal ranks kept in their
 *  original relative order (Array#sort is stable, ES2019+) - the move's original
 *  order in the source data (#65's Implementation Decisions). */
function byRankDescending(a: { rank: number | null }, b: { rank: number | null }): number {
	if (a.rank == null) return b.rank == null ? 0 : 1;
	if (b.rank == null) return -1;
	return b.rank - a.rank;
}

/**
 * The full answer-key breakdown the Host sees live during the Round (#36): the Featured
 * Side's actual move plus every graded alternative, sorted strongest to weakest by
 * win-probability strength (#65) - finer-grained than the bucketed computed tier, so
 * moves sharing a tier still rank apart by their actual strength - with exact ties kept
 * in their original source order via a stable sort, and the move actually played always
 * displaying +3 (the fixed override, #61) and
 * carrying the GM-bonus remark when its own computed tier would otherwise be lower. The
 * answer key is precomputed and server-held (#27) and the Host already knows the
 * Featured Game (#22), so there's no reason to withhold it - it gives the Host talking
 * points before anyone's even submitted. Every move and the continuation Variant are
 * numbered the same way as the Participant's own Continuation (#51), not shown as loose
 * SANs. All move text is glyph-rendered; chess notation itself is never translated.
 */
export function answerKeyBreakdown(
	step: AnswerKeyStep | null,
	ply: number,
	whiteName: string | null = null,
	blackName: string | null = null
): AnswerKeyRow[] {
	if (!step) return [];

	const playedEval = step.playedComment?.eval ?? null;
	const playedScore = playedMoveScore(step);
	const playedLabel = playedScore != null ? formatScoreLabel(playedScore) : null;
	const moverName = step.color === 'w' ? whiteName : blackName;
	const remark =
		playedLabel != null && playedLabel !== '+3'
			? moverName
				? m.host_answer_key_gm_remark_named({ tier: playedLabel, name: moverName })
				: m.host_answer_key_gm_remark_generic({ tier: playedLabel })
			: null;

	const ranked = [
		{
			rank: strengthRank(step, playedEval),
			row: {
				san: step.san,
				glyph: formatNumberedMove(step.san, ply),
				tier: '+3' as AnswerKeyTierLabel,
				eval: playedEval,
				continuation: '',
				isGameMove: true,
				remark
			}
		},
		...step.alternatives.map((alt) => ({
			rank: strengthRank(step, alt.eval),
			row: {
				san: alt.san,
				glyph: formatNumberedMove(alt.san, ply),
				tier: formatScoreLabel(scoreFromEval(step, alt.eval) ?? 0),
				eval: alt.eval,
				continuation: alt.continuation.length ? formatContinuation(alt.continuation, ply + 1) : '',
				isGameMove: alt.san === step.san,
				remark: null
			}
		}))
	];

	// Array#sort is stable (ES2019+), so moves exactly tied on strength keep their
	// original source order (#65) - the played move first, then alternatives as listed.
	ranked.sort(byRankDescending);
	return ranked.map(({ row }) => row);
}

/** "1 point" / "5 points", reusing the Guess Group chart's own plural pair
 *  (chart_points_one/other) rather than a fresh message per caller. */
export function pointsLabel(score: number): string {
	return score === 1 ? m.chart_points_one({ score }) : m.chart_points_other({ score });
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
