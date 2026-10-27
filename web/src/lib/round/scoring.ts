import type { ParticipantState } from './round-machine';

// Ported from the single-player prototype (src/index.js, scoreGuess/blunderPenalty)
// and its precomputed answer-key tables (src/data/*.json, built offline by
// scripts/build-game-data.mjs). v1 scores a single locked Guess only — no live
// engine, no Analysis Tree — so Round Score == Guess Score (issues #25, #27, #32).

export type Tier = '+3' | '+2' | '+1' | '0' | 'blunder';

export interface AnswerKeyAlternative {
	san: string;
	tier: Tier;
	eval: number | null;
}

/**
 * The subset of a built answer-key step the scorer needs. The full step shape
 * (see scripts/build-game-data.mjs) carries more fields; structural typing lets
 * a full step be passed wherever an AnswerKeyStep is expected.
 */
export interface AnswerKeyStep {
	san: string;
	playedComment: { eval: number | null } | null;
	alternatives: AnswerKeyAlternative[];
}

const TIER_POINTS: Record<Exclude<Tier, 'blunder'>, number> = {
	'+3': 3,
	'+2': 2,
	'+1': 1,
	'0': 0
};

/** Hard penalty for a Round not submitted by its deadline (issue #22). */
export const TIMEOUT_PENALTY = -3;

/**
 * Graduated blunder penalty: the further a blunder falls below the best
 * available move's eval, the deeper the penalty (-1, -2, -3).
 */
function blunderPenalty(step: AnswerKeyStep, altEval: number): number {
	const evals = [
		...(step.playedComment?.eval == null ? [] : [step.playedComment.eval]),
		...step.alternatives.map((a) => a.eval).filter((e): e is number => e != null)
	];
	const best = evals.length ? Math.max(...evals) : altEval;
	const diff = best - altEval;
	if (diff <= 6) return -1;
	if (diff <= 9) return -2;
	return -3;
}

/**
 * The -3..+3 Guess Score for a submitted move, looked up against the answer-key
 * step: +3 for the move played, graduated tiers for listed alternatives, a
 * ramped penalty for listed blunders, and 0 for anything the engine didn't list.
 */
export function scoreGuess(step: AnswerKeyStep, guessSan: string): number {
	if (guessSan === step.san) return 3;
	const alt = step.alternatives.find((a) => a.san === guessSan);
	if (!alt) return 0;
	if (alt.tier === 'blunder') return blunderPenalty(step, alt.eval ?? 0);
	return TIER_POINTS[alt.tier];
}

/**
 * A participant's Round Score once the Round has closed. Before the Featured
 * Game's Scoring Start Move every Round scores 0 regardless of accuracy (#26);
 * otherwise a submitted Guess scores its tier and a missed deadline scores -3.
 */
export function scoreParticipantRound(
	state: ParticipantState,
	step: AnswerKeyStep | null,
	isScoringRound: boolean
): number {
	if (!isScoringRound) return 0;
	switch (state.status) {
		case 'submitted':
			return step ? scoreGuess(step, state.guess) : 0;
		case 'timedOut':
		case 'late':
			return TIMEOUT_PENALTY;
		case 'pending':
			return 0;
	}
}
