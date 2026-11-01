import { Chess } from 'chess.js';
import type { GameData, GameStep } from './game-data';
import type { GuessHistory } from './guess-history';
import { scoreGuess } from './scoring';

// Participant PGN export (#59): the first PGN-writing code in the codebase (chess.js
// was present but unused for PGN before this). The mainline is always the full
// original Featured Game — even moves beyond where an early-ended Session (#57)
// stopped — decorated per-Round with this participant's own Guess, plus a
// plain-prose performance summary on the PGN's final move. Comments only; no
// custom header tags, since lightweight PGN viewers tend to render move comments
// but ignore unrecognized headers.

/**
 * Rounds actually played by the Session as a whole: every prior Round that
 * closed, plus the Round at `roundIndex` (the one live when the Session ended,
 * naturally or early) if its scores already closed too. `currentRoundScores` is
 * the live Round's `context.scores`, populated only once `ROUND_TIMEOUT`/`REVEAL`
 * closes it (round-machine.ts) — empty if the Session ended early mid-Round,
 * before that ever happened.
 */
export function roundsActuallyPlayed(
	roundIndex: number,
	currentRoundScores: Record<string, number>
): number {
	return Object.keys(currentRoundScores).length > 0 ? roundIndex + 1 : roundIndex;
}

/** Every participant ranked by total, highest first, ties broken by id — shared by the
 *  Participant summary's rank lookup and the Host summary's full Leaderboard listing. */
function rankedTotals(totals: Record<string, number>): { id: string; total: number }[] {
	return Object.entries(totals)
		.map(([id, total]) => ({ id, total }))
		.sort((a, b) => b.total - a.total || a.id.localeCompare(b.id));
}

function signed(n: number): string {
	return n > 0 ? `+${n}` : `${n}`;
}

export interface ParticipantPgnStats {
	points: number;
	rank: number;
	totalParticipants: number;
	maxAchievable: number;
	/** 0-100, rounded to the nearest whole percent. */
	matchPercent: number;
	roundsPlayed: number;
	totalRounds: number;
	endedEarly: boolean;
}

/**
 * The numeric performance summary for one participant's Final Results PGN: reads
 * straight off the already-broadcast Session totals and Guess history, so it
 * always matches whatever the Leaderboard and Game Sheet already show. `quizSteps`
 * must be in the same order SessionRoom assigns Round indices (`quizSteps()` in
 * game-data.ts).
 */
export function participantPgnStats(
	quizSteps: GameStep[],
	guessHistory: GuessHistory,
	participantId: string,
	totals: Record<string, number>,
	roundsPlayed: number,
	endedEarly: boolean
): ParticipantPgnStats {
	const ranked = rankedTotals(totals);

	let matches = 0;
	for (let i = 0; i < roundsPlayed; i++) {
		if (guessHistory[i]?.[participantId] === quizSteps[i].san) matches++;
	}

	return {
		points: totals[participantId] ?? 0,
		rank: ranked.findIndex((entry) => entry.id === participantId) + 1,
		totalParticipants: ranked.length,
		maxAchievable: roundsPlayed * 3,
		matchPercent: roundsPlayed > 0 ? Math.round((matches / roundsPlayed) * 100) : 0,
		roundsPlayed,
		totalRounds: quizSteps.length,
		endedEarly
	};
}

function ordinal(n: number): string {
	const mod100 = n % 100;
	if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
	switch (n % 10) {
		case 1:
			return `${n}st`;
		case 2:
			return `${n}nd`;
		case 3:
			return `${n}rd`;
		default:
			return `${n}th`;
	}
}

/**
 * The plain-prose comment attached to the PGN's final move: points, ranking
 * position, maximum achievable points, and the percentage of Rounds where the
 * Guess matched the move played — plus, when the Session ended early, a note on
 * where/why it stopped and that it reduced the maximum achievable.
 */
export function finalMoveSummary(stats: ParticipantPgnStats): string {
	const parts = [
		`Final score: ${signed(stats.points)} points.`,
		`Ranked ${ordinal(stats.rank)} of ${stats.totalParticipants}.`,
		`Maximum achievable: ${stats.maxAchievable} (${stats.roundsPlayed} Rounds x 3).`,
		`Guessed the move played exactly on ${stats.matchPercent}% of Rounds.`
	];
	if (stats.endedEarly) {
		parts.push(
			`The Host ended this Session early after Round ${stats.roundsPlayed} of ${stats.totalRounds}, which reduced the maximum achievable points accordingly.`
		);
	}
	return parts.join(' ');
}

/**
 * Shared PGN-writing core (#59/#60): renders the full original mainline from
 * `game.startFen` through every move, tagging every graded Round this Session
 * actually played (`roundsPlayed`, up to `commentForRound`'s own lookup) with
 * whatever comment `commentForRound` returns for that Round index (null for no
 * comment), and merging `summary` onto the very last move — appended to that
 * move's own comment when it already carries one. Moves beyond `roundsPlayed`
 * (an early-ended Session, #57) never call `commentForRound` at all.
 */
function buildPgn(
	game: GameData,
	roundsPlayed: number,
	summary: string,
	commentForRound: (roundIndex: number) => string | null
): string {
	const chess = new Chess(game.startFen);
	for (const [key, value] of Object.entries(game.headers)) {
		chess.setHeader(key, value);
	}

	let quizRoundIndex = 0;
	game.steps.forEach((step, i) => {
		chess.move(step.san);

		if (step.alternatives.length > 0) {
			if (quizRoundIndex < roundsPlayed) {
				const comment = commentForRound(quizRoundIndex);
				if (comment != null) chess.setComment(comment);
			}
			quizRoundIndex++;
		}

		if (i === game.steps.length - 1) {
			const existing = chess.getComment();
			chess.setComment(existing ? `${existing} ${summary}` : summary);
		}
	});

	return chess.pgn();
}

/**
 * One participant's personalized PGN for the Featured Game (#59): the full
 * original mainline from `game.startFen` through every played move, with
 * `{Guessed: ...}` comments on every graded Round this participant actually
 * played (looked up by Round index in `guessHistory`, same indexing as the Game
 * Sheet, #58) and a plain-prose performance summary on the very last move —
 * merged with that move's own Guess comment when it happens to carry one too.
 * Moves beyond `roundsPlayed` (an early-ended Session, #57) carry no Guess
 * comment, since no Guess happened.
 */
export function buildParticipantPgn(
	game: GameData,
	guessHistory: GuessHistory,
	participantId: string,
	totals: Record<string, number>,
	roundsPlayed: number,
	endedEarly: boolean
): string {
	const quizSteps = game.steps.filter((step) => step.alternatives.length > 0);
	const stats = participantPgnStats(
		quizSteps,
		guessHistory,
		participantId,
		totals,
		roundsPlayed,
		endedEarly
	);
	const summary = finalMoveSummary(stats);

	return buildPgn(game, roundsPlayed, summary, (roundIndex) => {
		const guessSan = guessHistory[roundIndex]?.[participantId];
		return guessSan != null ? `Guessed: ${guessSan}` : null;
	});
}

/** One distinct guessed move in a Round, room-level (#60): every participant who
 *  guessed exactly this move — not redacted the way a Participant's own view is
 *  (#53), since this is the Host's own export. Names ordered alphabetically for a
 *  stable, readable PGN comment, independent of join order. */
export interface RoundGuessGroup {
	san: string;
	score: number;
	participantIds: string[];
}

/**
 * Group one Round's recorded Guesses (`guessHistory[roundIndex]`, participant id
 * -> SAN) into the distinct moves actually guessed, each with its full group of
 * names — the same grouping the Host Display already shows live at Reveal
 * (`computeGuessGroupBreakdown`), but built off the Session-lifetime history
 * instead of a live Round's in-memory state, since a past Round's actor is long
 * gone by Final Results. A participant absent from `roundGuesses` timed out that
 * Round and contributes no group — there is no move to list them under. Ordered
 * largest group first, same tie-breaks as the live breakdown.
 */
export function roundGuessGroups(
	step: GameStep,
	roundGuesses: Record<string, string>
): RoundGuessGroup[] {
	const bySan = new Map<string, string[]>();
	for (const [id, san] of Object.entries(roundGuesses)) {
		const members = bySan.get(san);
		if (members) members.push(id);
		else bySan.set(san, [id]);
	}

	const groups: RoundGuessGroup[] = [...bySan.entries()].map(([san, participantIds]) => ({
		san,
		score: scoreGuess(step, san),
		participantIds: [...participantIds].sort()
	}));
	groups.sort(
		(a, b) =>
			b.participantIds.length - a.participantIds.length ||
			b.score - a.score ||
			a.san.localeCompare(b.san)
	);
	return groups;
}

function formatRoundGuessComment(groups: RoundGuessGroup[]): string {
	const text = groups.map((g) => `${g.san} (${g.participantIds.join(', ')})`).join('; ');
	return `Guesses: ${text}`;
}

function ordinalRank(ranked: { id: string; total: number }[]): string {
	return ranked
		.map((entry, i) => `${ordinal(i + 1)} ${entry.id} (${signed(entry.total)})`)
		.join(', ');
}

/** A total-elapsed duration rendered as e.g. "1h 23m 45s" or "23m 45s" — hours
 *  omitted entirely under an hour, since most Sessions run well under one. */
function formatDuration(ms: number): string {
	const totalSeconds = Math.round(ms / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	const parts: string[] = [];
	if (hours > 0) parts.push(`${hours}h`);
	if (hours > 0 || minutes > 0) parts.push(`${minutes}m`);
	parts.push(`${seconds}s`);
	return parts.join(' ');
}

/**
 * The plain-prose comment attached to the Host PGN's final move (#60): the full
 * ranked Leaderboard (every participant, not just one), whether the Session ended
 * early (#57), and the total elapsed time from the Host's first "Start Round" for
 * Round 1 (#52) to the Session reaching Final Results — omitted when either
 * timestamp is unavailable (a Session that reached `finished` before this field
 * existed, or was never fully set up).
 */
export function hostFinalMoveSummary(
	ranking: { id: string; total: number }[],
	roundsPlayed: number,
	totalRounds: number,
	endedEarly: boolean,
	elapsedMs: number | null
): string {
	const parts = [
		ranking.length
			? `Final Leaderboard: ${ordinalRank(ranking)}.`
			: 'Final Leaderboard: no participants.',
		endedEarly
			? `The Host ended this Session early after Round ${roundsPlayed} of ${totalRounds}.`
			: `The Session reached Final Results naturally after all ${totalRounds} Rounds.`
	];
	if (elapsedMs != null) parts.push(`Total elapsed time: ${formatDuration(elapsedMs)}.`);
	return parts.join(' ');
}

/**
 * The Host's room-level PGN for the Featured Game (#60): the same full original
 * mainline `buildParticipantPgn` (#59) renders, but decorated with every Round's
 * distinct Guess Groups and their full participant-name groups instead of one
 * participant's own Guess, and a Host-facing summary (full Leaderboard, early-end
 * state, total elapsed time) on the final move rather than one participant's
 * personal performance.
 */
export function buildHostPgn(
	game: GameData,
	guessHistory: GuessHistory,
	totals: Record<string, number>,
	roundsPlayed: number,
	endedEarly: boolean,
	elapsedMs: number | null
): string {
	const quizSteps = game.steps.filter((step) => step.alternatives.length > 0);
	const ranking = rankedTotals(totals);
	const summary = hostFinalMoveSummary(
		ranking,
		roundsPlayed,
		quizSteps.length,
		endedEarly,
		elapsedMs
	);

	return buildPgn(game, roundsPlayed, summary, (roundIndex) => {
		const groups = roundGuessGroups(quizSteps[roundIndex], guessHistory[roundIndex] ?? {});
		return groups.length ? formatRoundGuessComment(groups) : null;
	});
}
