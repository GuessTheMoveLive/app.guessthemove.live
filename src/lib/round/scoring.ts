import type { ParticipantState } from './round-machine';

// Ported from the single-player prototype (src/index.js, scoreGuess/blunderPenalty)
// and its precomputed answer-key tables (src/data/*.json, built offline by
// scripts/build-game-data.mjs). v1 scores a single locked Guess only — no live
// engine, no Analysis Tree — so Round Score == Guess Score (issues #25, #27, #32).
//
// As of #61, a move's tier is computed from its Evaluation via win-probability-loss
// bands (GLOSSARY: Guess Score) rather than read from a hand-typed PGN label — this
// module is the single seam every consumer (live scoring, the Answer Key display,
// Reveal feedback) derives tier from, so none of them can drift out of sync.

export type Tier = '+3' | '+2' | '+1' | '0' | 'blunder';

export interface AnswerKeyAlternative {
	san: string;
	eval: number | null;
	/** The precomputed continuation (Feedback's Variant, #36): the SANs played after this
	 *  alternative, authored offline alongside the rest of the answer key. Empty when the
	 *  PGN's variation carried no further moves. */
	continuation: string[];
}

/**
 * The subset of a built answer-key step the scorer needs. The full step shape
 * (see scripts/build-game-data.mjs) carries more fields; structural typing lets
 * a full step be passed wherever an AnswerKeyStep is expected.
 */
export interface AnswerKeyStep {
	san: string;
	/** Whose move this is — needed to mirror an Evaluation (always White's pawns
	 *  perspective) into the mover's own win-probability (#61). */
	color: 'w' | 'b';
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

/** The logistic curve's steepness, converting a centipawn Evaluation into a
 *  win-probability (#61's Implementation Decisions). */
const WIN_PERCENT_K = 0.00368;

/**
 * An Evaluation (pawns, White's perspective) converted to the mover's own
 * win-probability, mirroring for Black exactly as the existing feedback.ts
 * moverLevel/evalToSymbol color-mirroring already does.
 */
function winPercentForMover(evalPawns: number, color: 'w' | 'b'): number {
	const centipawns = evalPawns * 100 * (color === 'w' ? 1 : -1);
	return 50 + 50 * (2 / (1 + Math.exp(-WIN_PERCENT_K * centipawns)) - 1);
}

/** The highest mover-relative win-probability among the Featured Side's actual
 *  move and every graded alternative at this position — the reference every
 *  other move's win-probability-loss is measured against. Null when no move at
 *  this position carries a known Evaluation. */
function bestWinPercent(step: AnswerKeyStep): number | null {
	const evals: number[] = [];
	if (step.playedComment?.eval != null) evals.push(step.playedComment.eval);
	for (const alt of step.alternatives) if (alt.eval != null) evals.push(alt.eval);
	if (!evals.length) return null;
	return Math.max(...evals.map((e) => winPercentForMover(e, step.color)));
}

/** Win-probability-loss -> tier, per #61's Implementation Decisions. */
function tierFromLoss(loss: number): Tier {
	if (loss <= 2) return '+3';
	if (loss <= 5) return '+2';
	if (loss <= 10) return '+1';
	if (loss <= 20) return '0';
	return 'blunder';
}

/** Graduated blunder penalty: the further a blunder's win-probability-loss
 *  falls past the blunder cutoff, the deeper the penalty (-1, -2, -3). */
function blunderScoreFromLoss(loss: number): number {
	if (loss <= 35) return -1;
	if (loss <= 50) return -2;
	return -3;
}

/**
 * The computed tier for a single Evaluation at this position — the one place
 * both the live scoring path and the Answer Key display derive tier from (#61),
 * replacing the hand-typed PGN tier label. Null when the Evaluation, or every
 * Evaluation at this position, is unknown — there's nothing to band.
 */
export function computeTier(step: AnswerKeyStep, evalPawns: number | null): Tier | null {
	if (evalPawns == null) return null;
	const best = bestWinPercent(step);
	if (best == null) return null;
	return tierFromLoss(best - winPercentForMover(evalPawns, step.color));
}

/**
 * The -3..+3 Guess Score a single Evaluation earns at this position, from its
 * computed tier (#61) — the graded-alternative half of {@link scoreGuess}, also
 * used by the Answer Key display to rank alternatives and by Reveal feedback to
 * classify a Guess. Null when there's no Evaluation to compute from.
 */
export function scoreFromEval(step: AnswerKeyStep, evalPawns: number | null): number | null {
	const tier = computeTier(step, evalPawns);
	if (tier == null) return null;
	if (tier !== 'blunder') return TIER_POINTS[tier];
	const best = bestWinPercent(step);
	// tier is only 'blunder' once bestWinPercent and evalPawns are both known.
	return blunderScoreFromLoss(best! - winPercentForMover(evalPawns!, step.color));
}

/**
 * The -3..+3 Guess Score for a submitted move, looked up against the answer-key
 * step: a fixed +3 for the move actually played — regardless of its own computed
 * tier (#61's deliberate override, "did you guess what was actually played") —
 * the computed win-probability-loss tier for a listed alternative, and 0 for
 * anything the engine didn't list.
 */
export function scoreGuess(step: AnswerKeyStep, guessSan: string): number {
	if (guessSan === step.san) return 3;
	const alt = step.alternatives.find((a) => a.san === guessSan);
	if (!alt) return 0;
	return scoreFromEval(step, alt.eval) ?? 0;
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
