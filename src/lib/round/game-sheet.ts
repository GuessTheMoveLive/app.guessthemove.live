import type { GameStep } from './game-data';
import type { GuessHistory } from './guess-history';
import { moveNumber, sanToGlyph } from './participant-input';
import { scoreGuess, TIMEOUT_PENALTY } from './scoring';
import type { RoundStateValue } from './snapshot';

/**
 * A participant's Guess decoration for one graded (Featured Side) move (#58): `text` is
 * '' when the Guess matched the move actually played (nothing shown), the glyph-rendered
 * Guess when it differs, or '—' when no Guess was submitted (timeout) — distinct from a
 * matching Guess, which is also blank. `points` is the Round Score that move earned,
 * always populated so it can be shown even when the Guess matched.
 */
export interface GameSheetGuess {
	text: string;
	points: number;
}

/** One played move: its glyph-rendered SAN, plus a Guess decoration when this move was a
 *  graded Round (null for the opponent's un-guessed replies). */
export interface GameSheetMove {
	san: string;
	guess: GameSheetGuess | null;
}

export interface GameSheetRow {
	number: number;
	white: GameSheetMove | null;
	black: GameSheetMove | null;
}

/**
 * The slice of a game's steps a Participant's Game Sheet should show right now (#73,
 * fixing a gap left by #68): while a Round is `active`, strictly before the current
 * quiz step (its move is still hidden); once Reveal makes the quiz step itself visible,
 * through it; and once Opponent Response has revealed the opponent's reply too, through
 * the last ply in `opponentSteps` as well, so that already-revealed move shows up as a
 * normal filled cell instead of staying blank until the next Round starts.
 */
export function gameSheetSteps(
	steps: GameStep[],
	quizStep: GameStep | null,
	opponentSteps: GameStep[],
	phase: RoundStateValue
): GameStep[] {
	const includeCurrentRound = phase === 'reveal' || phase === 'opponentResponse';
	const cutoffPly =
		phase === 'opponentResponse' && opponentSteps.length
			? opponentSteps[opponentSteps.length - 1].ply
			: (quizStep?.ply ?? 0);

	return steps.filter((s) =>
		includeCurrentRound ? s.ply <= cutoffPly : s.ply < (quizStep?.ply ?? 1)
	);
}

/**
 * The Game Sheet's per-move rows (#58): the same White/Black move pairing as
 * `buildMoveHistory`, decorated with `participantId`'s own Guess and points for every
 * graded (Featured Side) move — a step the engine never quizzed (the opponent's reply)
 * carries a move only, no Guess. `guessHistory` is keyed by Round index in the order
 * quiz steps appear within `steps`, matching how SessionRoom assigns round indices (#52).
 */
export function buildGameSheet(
	steps: GameStep[],
	guessHistory: GuessHistory,
	participantId: string
): GameSheetRow[] {
	const rows: GameSheetRow[] = [];
	let roundIndex = 0;

	for (const step of steps) {
		const number = moveNumber(step.ply);
		let row = rows[rows.length - 1];
		if (!row || row.number !== number) {
			row = { number, white: null, black: null };
			rows.push(row);
		}

		const move: GameSheetMove = { san: sanToGlyph(step.san), guess: null };
		if (step.alternatives.length > 0) {
			const guessSan = guessHistory[roundIndex]?.[participantId];
			const points = guessSan == null ? TIMEOUT_PENALTY : scoreGuess(step, guessSan);
			const text = guessSan == null ? '—' : guessSan === step.san ? '' : sanToGlyph(guessSan);
			move.guess = { text, points };
			roundIndex++;
		}

		if (step.color === 'w') row.white = move;
		else row.black = move;
	}

	return rows;
}
