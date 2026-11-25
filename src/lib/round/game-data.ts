import type { AnswerKeyStep } from './scoring';
import { resolveGameData } from './game-catalog';

// Loads the precomputed per-position answer-key table built offline by
// scripts/build-game-data.mjs (issue #27 — no live engine). This is the port of
// the prototype's data-loading/lookup approach (src/index.js) into web/.
// Which Featured Game's table is served is parameterized by `gameId` (#93), resolved
// against the Game Catalog manifest (game-catalog.ts) rather than one hard-imported file.

export interface GameStep extends AnswerKeyStep {
	ply: number;
	color: 'w' | 'b';
	fenBefore: string;
	fenAfter: string;
	moveNumber: number | null;
}

export interface GameData {
	headers: Record<string, string>;
	startFen: string;
	steps: GameStep[];
}

/** A placeholder GameData for the Lobby, before the Host has selected a Featured Game
 *  (#93) — an empty step list rather than any real game's data. */
export const EMPTY_GAME_DATA: GameData = {
	headers: {},
	startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
	steps: []
};

export function getGameData(gameId: string): GameData {
	return resolveGameData(gameId);
}

/** The answer-key step at a 1-based ply, or null if out of range. */
export function getAnswerKeyStep(gameId: string, ply: number): GameStep | null {
	return getGameData(gameId).steps.find((step) => step.ply === ply) ?? null;
}

/** Steps that actually quiz the Featured Side — those carrying graded alternatives.
 *  Empty, rather than an error, when no Featured Game has been selected yet. */
export function quizSteps(gameId: string | null): GameStep[] {
	if (!gameId) return [];
	return getGameData(gameId).steps.filter((step) => step.alternatives.length > 0);
}

/**
 * The Opponent Response continuation after a Round's Featured move (#48, extended by #49):
 * just the single next ply on an ordinary Round, or, on the Featured Game's final Round, every
 * remaining step of the real mainline through the game's actual end — sliced generically from
 * the full step list rather than assumed to be any fixed length, since annotation coverage
 * varies between games.
 */
export function opponentResponseSteps(
	gameId: string | null,
	afterPly: number,
	isFinalRound: boolean
): GameStep[] {
	if (!gameId) return [];
	if (isFinalRound) return getGameData(gameId).steps.filter((step) => step.ply > afterPly);
	const step = getAnswerKeyStep(gameId, afterPly + 1);
	return step ? [step] : [];
}
