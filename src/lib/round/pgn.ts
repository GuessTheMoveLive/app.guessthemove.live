import { Chess } from 'chess.js';
import type { GameData, GameStep } from './game-data';
import type { GuessHistory } from './guess-history';

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
	const ranked = Object.entries(totals)
		.map(([id, total]) => ({ id, total }))
		.sort((a, b) => b.total - a.total || a.id.localeCompare(b.id));

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
	const signedPoints = stats.points > 0 ? `+${stats.points}` : `${stats.points}`;
	const parts = [
		`Final score: ${signedPoints} points.`,
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

	const chess = new Chess(game.startFen);
	for (const [key, value] of Object.entries(game.headers)) {
		chess.setHeader(key, value);
	}

	let quizRoundIndex = 0;
	game.steps.forEach((step, i) => {
		chess.move(step.san);

		if (step.alternatives.length > 0) {
			if (quizRoundIndex < roundsPlayed) {
				const guessSan = guessHistory[quizRoundIndex]?.[participantId];
				if (guessSan != null) chess.setComment(`Guessed: ${guessSan}`);
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
