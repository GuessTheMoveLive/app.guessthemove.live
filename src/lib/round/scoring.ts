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
//
// As of #70, '+3' eligibility is no longer a flat loss<=2 band: live Sessions showed
// too many alternatives independently qualifying, crowding the Guess Group breakdown's
// top bar and diluting "did you guess what was actually played". '+3' is now rank-based
// (GLOSSARY: Guess Score) — see isTopTier — while '+2'/'+1'/'0'/blunder still cascade off
// the original loss-from-best bands.

export type Tier = '+3' | '+2' | '+1' | '0' | 'blunder';

export interface AnswerKeyAlternative {
	san: string;
	eval: number | null;
	/** Mover-relative win-probability (0-100), sourced per ADR 0009 from the engine's
	 *  native WDL (Engine Win Probability) or, while still In Book, from Lichess Masters
	 *  outcome stats (Book Win Probability) — authored offline alongside `eval`. Null for
	 *  every game authored before 0009, which keeps deriving win-probability from `eval`
	 *  via the logistic curve ({@link winPercentForMover}). */
	winProb?: number | null;
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
	playedComment: { eval: number | null; winProb?: number | null } | null;
	alternatives: AnswerKeyAlternative[];
}

const TIER_POINTS: Record<Exclude<Tier, 'blunder'>, number> = {
	'+3': 3,
	'+2': 2,
	'+1': 1,
	'0': 0
};

/** The most a single Round can score (the '+3' tier) — the per-Round ceiling used
 *  to project how many points are still up for grabs in the Rounds yet to come. */
export const MAX_ROUND_SCORE = TIER_POINTS['+3'];

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

/** `winProb` when authored (ADR 0009's Engine/Book Win Probability), otherwise the
 *  logistic-curve derivation from `evalPawns` (#61) — the one place every mover-relative
 *  win-probability in this module is resolved, so old (eval-only) and new
 *  (winProb-authored) Featured Games share every other computation unchanged. */
function moverWinPercent(
	step: AnswerKeyStep,
	evalPawns: number | null,
	winProb?: number | null
): number | null {
	if (winProb != null) return winProb;
	if (evalPawns == null) return null;
	return winPercentForMover(evalPawns, step.color);
}

/** Every move at this position with a known Evaluation or win-probability (the played
 *  move plus every graded alternative), as the mover's own win-probability. */
function allWinPercents(step: AnswerKeyStep): number[] {
	const percents: number[] = [];
	const played = moverWinPercent(
		step,
		step.playedComment?.eval ?? null,
		step.playedComment?.winProb
	);
	if (played != null) percents.push(played);
	for (const alt of step.alternatives) {
		const percent = moverWinPercent(step, alt.eval, alt.winProb);
		if (percent != null) percents.push(percent);
	}
	return percents;
}

/** The highest mover-relative win-probability among the Featured Side's actual
 *  move and every graded alternative at this position — the reference every
 *  other move's win-probability-loss is measured against. Null when no move at
 *  this position carries a known Evaluation. */
function bestWinPercent(step: AnswerKeyStep): number | null {
	const percents = allWinPercents(step);
	return percents.length ? Math.max(...percents) : null;
}

/** The played move's own win-probability. Null when neither its winProb nor its
 *  Evaluation is known. */
function playedWinPercent(step: AnswerKeyStep): number | null {
	return moverWinPercent(step, step.playedComment?.eval ?? null, step.playedComment?.winProb);
}

/** The highest win-probability strictly below the played move's — i.e. the move
 *  ranked immediately after it. Null when the played move's Evaluation is
 *  unknown, or nothing else at this position ranks below it. */
function nextAfterWinPercent(step: AnswerKeyStep): number | null {
	const played = playedWinPercent(step);
	if (played == null) return null;
	const below = allWinPercents(step).filter((p) => p < played);
	return below.length ? Math.max(...below) : null;
}

/** Win-probability-loss -> tier for anything that isn't rank-eligible for '+3'
 *  (see {@link isTopTier}); the '+2'/'+1'/'0'/blunder bands are unchanged from
 *  #61. */
function tierFromLoss(loss: number): Tier {
	if (loss <= 5) return '+2';
	if (loss <= 10) return '+1';
	if (loss <= 20) return '0';
	return 'blunder';
}

/**
 * The played move's own tier by the original flat loss<=2 band (#61), ignoring
 * both the fixed-+3 override and the rank-based promotion rule (#70) — i.e.
 * "would this move have earned +3 on its own merits, without any of that."
 * This is the one question {@link isTopTier}'s next-after gate needs (is the
 * played move already elite?), and the one the Answer Key's GM-bonus remark
 * needs (is the override actually doing work?) — neither can reuse
 * {@link computeTier} for this, since querying it with the played move's own
 * eval trivially satisfies rank rule 1 ("at least as good as itself") and
 * would always answer '+3'. Null when the played move's Evaluation, or every
 * Evaluation at this position, is unknown.
 */
export function playedMoveTier(step: AnswerKeyStep): Tier | null {
	const played = playedWinPercent(step);
	const best = bestWinPercent(step);
	if (played == null || best == null) return null;
	const loss = best - played;
	return loss <= 2 ? '+3' : tierFromLoss(loss);
}

/**
 * The numeric sibling of {@link playedMoveTier}: the played move's own -3..+3
 * score by the same rules (flat loss<=2 band for +3, {@link tierFromLoss}
 * otherwise), except a 'blunder' band is resolved to its graduated depth via
 * {@link blunderScoreFromLoss} instead of staying a bucket label - so a caller
 * that wants "how bad, exactly" (the Answer Key's GM-bonus remark, #91) doesn't
 * have to re-derive the loss itself. Null under the same conditions as {@link
 * playedMoveTier}.
 */
export function playedMoveScore(step: AnswerKeyStep): number | null {
	const played = playedWinPercent(step);
	const best = bestWinPercent(step);
	if (played == null || best == null) return null;
	const loss = best - played;
	if (loss <= 2) return TIER_POINTS['+3'];
	const tier = tierFromLoss(loss);
	if (tier !== 'blunder') return TIER_POINTS[tier];
	return blunderScoreFromLoss(loss);
}

/**
 * Whether `movePercent` earns the rank-based '+3' (#70, GLOSSARY: Guess Score):
 * the played move itself, anything at least as good as it (tied or strictly
 * better), or — only when the played move is itself elite by {@link
 * playedMoveTier} — the single next-best rank below it, provided that move's
 * own loss-from-best stays within the loss<=5 ('+2') floor. This keeps a lone
 * distant second place from being promoted just because the played move
 * happened to be excellent.
 */
function isTopTier(step: AnswerKeyStep, movePercent: number): boolean {
	const played = playedWinPercent(step);
	if (played != null && movePercent >= played) return true;
	if (playedMoveTier(step) !== '+3') return false;

	const nextAfter = nextAfterWinPercent(step);
	if (nextAfter == null || movePercent !== nextAfter) return false;
	const best = bestWinPercent(step);
	return best != null && best - movePercent <= 5;
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
export function computeTier(
	step: AnswerKeyStep,
	evalPawns: number | null,
	winProb?: number | null
): Tier | null {
	const movePercent = moverWinPercent(step, evalPawns, winProb);
	if (movePercent == null) return null;
	const best = bestWinPercent(step);
	if (best == null) return null;
	if (isTopTier(step, movePercent)) return '+3';
	return tierFromLoss(best - movePercent);
}

/**
 * The -3..+3 Guess Score a single Evaluation earns at this position, from its
 * computed tier (#61) — the graded-alternative half of {@link scoreGuess}, its
 * only caller. Null when there's no Evaluation to compute from.
 */
export function scoreFromEval(
	step: AnswerKeyStep,
	evalPawns: number | null,
	winProb?: number | null
): number | null {
	const movePercent = moverWinPercent(step, evalPawns, winProb);
	if (movePercent == null) return null;
	const best = bestWinPercent(step);
	if (best == null) return null;
	if (isTopTier(step, movePercent)) return TIER_POINTS['+3'];
	const loss = best - movePercent;
	const tier = tierFromLoss(loss);
	if (tier !== 'blunder') return TIER_POINTS[tier];
	return blunderScoreFromLoss(loss);
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
	return scoreFromEval(step, alt.eval, alt.winProb) ?? 0;
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
