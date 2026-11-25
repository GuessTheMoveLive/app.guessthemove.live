import { Chess } from 'chess.js';
import type { GameData, GameStep } from './game-data';
import type { GuessHistory } from './guess-history';
import { isWhitePly, moveNumber as moveNumberForPly } from './participant-input';
import { scoreGuess } from './scoring';

// Participant PGN export (#59): the first PGN-writing code in the codebase (chess.js
// was present but unused for PGN before this). The mainline is always the full
// original Featured Game — even moves beyond where an early-ended Session (#57)
// stopped — decorated per-Round with real PGN variations (RAV) for the Guesses made
// that Round, plus a plain-prose performance summary on the PGN's final move. Guesses
// are rendered as actual move notation rather than prose comments embedding a SAN
// (e.g. "Guessed: Qc2") — a lightweight PGN viewer set to another language renders
// real moves in its own notation conventions, but can't translate a SAN sitting
// inside an English sentence. chess.js's own `pgn()` writer has no concept of
// variations, so the movetext here is hand-rolled instead of delegated to it. No
// custom header tags, since lightweight PGN viewers tend to render move comments
// but ignore unrecognized headers.

/** One guessed line to render as a PGN variation on some Round's mainline move. */
interface GuessVariation {
	/** The guessed move, followed by its precomputed continuation when the guess
	 *  matches a graded alternative — just the guessed move alone otherwise. */
	sans: string[];
	/** Attached to the variation's first move only (e.g. who guessed it) — never a
	 *  move itself, so it stays safe to leave in English. Null for no comment. */
	comment: string | null;
}

function escapeHeaderValue(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** PGN comments are delimited by braces, which can't appear inside one — stripped
 *  rather than escaped, since PGN has no escape sequence for a literal brace. */
function escapeComment(text: string): string {
	return text.replace(/[{}]/g, '');
}

/** The SAN line to render as a variation for one guessed move: the alternative's own
 *  precomputed continuation when the guess matches a graded alternative — so the
 *  variation can be replayed as a real engine line, not just one move — or just the
 *  guessed move alone when it doesn't (an ungraded guess carries no continuation). */
function guessVariationSans(step: GameStep, guessSan: string): string[] {
	const alt = step.alternatives.find((a) => a.san === guessSan);
	return alt ? [alt.san, ...alt.continuation] : [guessSan];
}

/**
 * Renders one guessed line as a PGN variation (RAV): replays `sans` from
 * `step.fenBefore` through chess.js so the variation carries real, validated move
 * notation, with `comment` (when given) attached to the first move only. Returns null
 * when the first move in the line isn't legal from `step.fenBefore` — an ungraded
 * guess built from a tap the client never fully validated against legality, so there
 * is no legal move to anchor a variation to; such a guess is silently dropped from
 * the PGN rather than crashing the export.
 */
function renderVariation(step: GameStep, sans: string[], comment: string | null): string | null {
	const chess = new Chess(step.fenBefore);
	const tokens: string[] = [];
	let ply = step.ply;

	for (let i = 0; i < sans.length; i++) {
		let move;
		try {
			move = chess.move(sans[i]);
		} catch {
			move = null;
		}
		if (!move) break;

		if (i === 0) {
			tokens.push(isWhitePly(ply) ? `${moveNumberForPly(ply)}.` : `${moveNumberForPly(ply)}...`);
		} else if (isWhitePly(ply)) {
			tokens.push(`${moveNumberForPly(ply)}.`);
		}
		tokens.push(move.san);
		if (i === 0 && comment) tokens.push(`{${escapeComment(comment)}}`);
		ply++;
	}

	return tokens.length > 0 ? `(${tokens.join(' ')})` : null;
}

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
 * `game.startFen` through every move, splicing in whatever `variationsForRound`
 * returns as real RAV variations after every graded Round this Session actually
 * played (`roundsPlayed`, up to `variationsForRound`'s own lookup), and attaching
 * `summary` as a plain comment on the very last move. Hand-rolled rather than
 * delegated to chess.js's own `pgn()` writer, which can only emit a linear comment
 * per move, not variations. Moves beyond `roundsPlayed` (an early-ended Session,
 * #57) never call `variationsForRound` at all.
 */
function buildPgn(
	game: GameData,
	roundsPlayed: number,
	summary: string,
	variationsForRound: (roundIndex: number, step: GameStep) => GuessVariation[]
): string {
	const headerLines = Object.entries(game.headers).map(
		([key, value]) => `[${key} "${escapeHeaderValue(value)}"]`
	);

	const tokens: string[] = [];
	let quizRoundIndex = 0;
	game.steps.forEach((step, i) => {
		if (isWhitePly(step.ply)) {
			tokens.push(`${moveNumberForPly(step.ply)}.`);
		} else if (i === 0) {
			tokens.push(`${moveNumberForPly(step.ply)}...`);
		}
		tokens.push(step.san);

		if (step.alternatives.length > 0) {
			if (quizRoundIndex < roundsPlayed) {
				for (const variation of variationsForRound(quizRoundIndex, step)) {
					const rendered = renderVariation(step, variation.sans, variation.comment);
					if (rendered) tokens.push(rendered);
				}
			}
			quizRoundIndex++;
		}

		if (i === game.steps.length - 1) {
			tokens.push(`{${escapeComment(summary)}}`);
		}
	});
	tokens.push(game.headers.Result ?? '*');

	return [...headerLines, '', tokens.join(' ')].join('\n');
}

/**
 * One participant's personalized PGN for the Featured Game (#59): the full
 * original mainline from `game.startFen` through every played move, with a real
 * PGN variation on every graded Round this participant actually played where their
 * Guess (looked up by Round index in `guessHistory`, same indexing as the Game
 * Sheet, #58) differed from the move actually played — carrying the engine's own
 * precomputed continuation when the Guess matches a graded alternative — and a
 * plain-prose performance summary on the very last move. A Round where the
 * participant guessed the move actually played gets no variation at all (the
 * mainline already is their Guess), and moves beyond `roundsPlayed` (an
 * early-ended Session, #57) carry none either, since no Guess happened.
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

	return buildPgn(game, roundsPlayed, summary, (roundIndex, step) => {
		const guessSan = guessHistory[roundIndex]?.[participantId];
		if (guessSan == null || guessSan === step.san) return [];
		return [{ sans: guessVariationSans(step, guessSan), comment: null }];
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
 * mainline `buildParticipantPgn` (#59) renders, but decorated with a real PGN
 * variation for every distinct Guess Group this Session actually saw that round
 * (other than the group that guessed the move actually played — the mainline
 * already shows that move), each variation's first move carrying that group's full
 * participant-name list as its comment, and a Host-facing summary (full
 * Leaderboard, early-end state, total elapsed time) on the final move rather than
 * one participant's personal performance.
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

	return buildPgn(game, roundsPlayed, summary, (roundIndex, step) => {
		const groups = roundGuessGroups(step, guessHistory[roundIndex] ?? {});
		return groups
			.filter((g) => g.san !== step.san)
			.map((g) => ({
				sans: guessVariationSans(step, g.san),
				comment: g.participantIds.join(', ')
			}));
	});
}
