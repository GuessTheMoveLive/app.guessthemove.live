import raw from '../data/capablanca-marshall.json';
import type { AnswerKeyStep } from './scoring';

// Loads the precomputed per-position answer-key table built offline by
// scripts/build-game-data.mjs (issue #27 — no live engine). This is the port of
// the prototype's data-loading/lookup approach (src/index.js) into web/.

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

const gameData = raw as unknown as GameData;

export function getGameData(): GameData {
	return gameData;
}

/** The answer-key step at a 1-based ply, or null if out of range. */
export function getAnswerKeyStep(ply: number): GameStep | null {
	return gameData.steps.find((step) => step.ply === ply) ?? null;
}

/** Steps that actually quiz the Featured Side — those carrying graded alternatives. */
export function quizSteps(): GameStep[] {
	return gameData.steps.filter((step) => step.alternatives.length > 0);
}
