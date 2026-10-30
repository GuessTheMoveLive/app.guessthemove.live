import type { ParticipantState } from './round-machine';
import type { AnswerKeyStep } from './scoring';
import { m } from '#lib/paraglide/messages.js';

// Per-Participant Reveal explanation: each Participant's Round Score, whether their
// Guess matched the Featured Side's move, and the Variant backing their tier. Once a
// Host-triggered Feedback phase (#36); as of #42 it is automatic at Reveal, with no
// separate Host step. Everything it needs is in the broadcast snapshot (the answer
// key, the Participant's stored Guess, their Round Score) plus the client's bundled
// answer key, so the Participant screen derives it locally — no targeted message.

export type FeedbackTier =
	'best' | 'alternative' | 'playable' | 'mistake' | 'clearMistake' | 'blunder' | 'timeout';

/** The seven standard annotation symbols, White's perspective, winning-for-White first.
 *  Index 0..6 maps to advantage level +3..-3 (see symbolLevel). */
export type EvalSymbol = '+-' | '±' | '⩲' | '=' | '⩱' | '∓' | '-+';

export const EVAL_SYMBOLS: EvalSymbol[] = ['+-', '±', '⩲', '=', '⩱', '∓', '-+'];

/**
 * Map an engine Evaluation (White's pawns perspective) to its standard annotation
 * symbol, per the bands in issue #43. The bands are symmetric about 0, so the same
 * table serves both colours — the Featured Side's own perspective is applied later,
 * when the symbol is turned into wording (see feedbackPhrase).
 */
export function evalToSymbol(evalWhite: number): EvalSymbol {
	if (evalWhite >= 3.0) return '+-';
	if (evalWhite >= 1.5) return '±';
	if (evalWhite >= 0.5) return '⩲';
	if (evalWhite >= -0.5) return '=';
	if (evalWhite >= -1.5) return '⩱';
	if (evalWhite >= -3.0) return '∓';
	return '-+';
}

/** A symbol's advantage level in White's terms: +3 (White winning) .. -3 (Black winning). */
function symbolLevel(sym: EvalSymbol): number {
	return 3 - EVAL_SYMBOLS.indexOf(sym);
}

/** A symbol's advantage from the Featured Side's own perspective: +3 (the mover is
 *  winning) .. -3 (the mover is losing). Mirrored for Black, per #43's "mirrored for
 *  black" — a position good for White is bad for a Black mover. */
function moverLevel(sym: EvalSymbol, color: 'w' | 'b'): number {
	return color === 'w' ? symbolLevel(sym) : -symbolLevel(sym);
}

/** The descriptive clause for a resulting position, from the mover's perspective. */
function positionPhrase(level: number): string {
	switch (level) {
		case 3:
			return m.feedback_pos_winning();
		case 2:
			return m.feedback_pos_clear();
		case 1:
			return m.feedback_pos_edge();
		case 0:
			return m.feedback_pos_equal();
		case -1:
			return m.feedback_pos_edge_opp();
		case -2:
			return m.feedback_pos_clear_opp();
		default:
			return m.feedback_pos_winning_opp();
	}
}

/**
 * The per-guess Reveal phrase for a (played-move symbol, guess symbol, Featured Side)
 * triple — the 7x7x2 lookup of issue #43, purely descriptive and independent of the
 * point-scoring tiers. The symbols are compared from the mover's perspective, so the
 * phrase for "matched the move played" falls out naturally as the diagonal (equal
 * levels) rather than a hard-coded special case: a guess reaching the same assessment
 * as the move played — including the move itself — is told so, never falsely called
 * "the best move".
 */
export function feedbackPhrase(
	gameSym: EvalSymbol,
	guessSym: EvalSymbol,
	color: 'w' | 'b'
): string {
	const gameLevel = moverLevel(gameSym, color);
	const guessLevel = moverLevel(guessSym, color);
	const your = positionPhrase(guessLevel);
	if (guessLevel === gameLevel) return m.feedback_rel_same({ pos: your });
	const played = positionPhrase(gameLevel);
	if (guessLevel > gameLevel) return m.feedback_rel_better({ your, played });
	return m.feedback_rel_worse({ your, played });
}

export interface FeedbackVariant {
	/** The precomputed continuation's SANs, in order (Feedback's Variant, #36). */
	continuation: string[];
	/** The engine's evaluation at the end of this Variant, White's pawns-perspective. */
	endEval: number | null;
}

export interface ParticipantFeedback {
	tier: FeedbackTier;
	score: number;
	/** The 1-based ply of this Round's Featured Side move, for the move-number prefixes
	 *  on the Your move / Played / Continuation strings (#43). */
	ply: number;
	/** The move actually played by the Featured Side. */
	playedSan: string;
	/** The Participant's own submitted Guess, or null if they never submitted. */
	guessSan: string | null;
	/** The Variant backing this tier, when the Guess matched a graded alternative that
	 *  carries one - null for the move played (nothing more to show) and for a guess the
	 *  answer key never listed. */
	variant: FeedbackVariant | null;
	/** The eval-symbol phrase (#43), resolved in the active locale, shown in place of the
	 *  generic tier text when both the played move and the Guess have a known Evaluation.
	 *  Null when either eval is unknown (unlisted guess, or no guess/timeout) - the caller
	 *  then falls back to explanationText(tier), keeping today's generic wording. */
	phrase: string | null;
}

/** Three severities of blunder, by how far the graduated penalty fell (see scoring.ts's
 *  blunderPenalty) - matches the Feedback copy's "A mistake" / "A clear mistake" / "A
 *  serious blunder" scale one-to-one. */
function blunderTier(score: number): FeedbackTier {
	if (score === -1) return 'mistake';
	if (score === -2) return 'clearMistake';
	return 'blunder';
}

/**
 * Build one Participant's Feedback from their stored Guess, the Round's answer key, and
 * their already-computed Guess Score (see round-machine's closeRoundScores). Returns null
 * when there is nothing to explain - the Round never had an answer key, or the Participant
 * is still pending (the Host triggered Feedback mid-Round, which shouldn't happen since
 * it's offered alongside Next Round on the Reveal screen, but guards against it anyway).
 */
export function buildParticipantFeedback(
	step: AnswerKeyStep | null,
	state: ParticipantState,
	score: number,
	ply: number
): ParticipantFeedback | null {
	if (!step) return null;

	if (state.status === 'timedOut') {
		return {
			tier: 'timeout',
			score,
			ply,
			playedSan: step.san,
			guessSan: null,
			variant: null,
			phrase: null
		};
	}
	if (state.status === 'pending') return null;

	const guessSan = state.guess;
	// The eval-symbol phrase (#43) needs a known Evaluation for both the move played and
	// the Guess; absent either, phrase stays null and the caller keeps the generic text.
	const playedEval = step.playedComment?.eval ?? null;
	const color: 'w' | 'b' = ply % 2 === 1 ? 'w' : 'b';
	const phraseFor = (guessEval: number | null): string | null =>
		playedEval != null && guessEval != null
			? feedbackPhrase(evalToSymbol(playedEval), evalToSymbol(guessEval), color)
			: null;

	if (guessSan === step.san) {
		const phrase = phraseFor(playedEval);
		return { tier: 'best', score, ply, playedSan: step.san, guessSan, variant: null, phrase };
	}

	const alt = step.alternatives.find((a) => a.san === guessSan);
	if (!alt) {
		return {
			tier: 'playable',
			score,
			ply,
			playedSan: step.san,
			guessSan,
			variant: null,
			phrase: null
		};
	}

	const variant: FeedbackVariant = { continuation: alt.continuation, endEval: alt.eval };
	const phrase = phraseFor(alt.eval);
	if (alt.tier === 'blunder') {
		return { tier: blunderTier(score), score, ply, playedSan: step.san, guessSan, variant, phrase };
	}
	const tier: FeedbackTier = alt.tier === '0' ? 'playable' : 'alternative';
	return { tier, score, ply, playedSan: step.san, guessSan, variant, phrase };
}

/** Plain qualitative explanation text per tier, no raw numbers (#36's Resolution),
 *  localized via Paraglide (#41) — resolved in the active locale at the call site. */
export function explanationText(tier: FeedbackTier): string {
	switch (tier) {
		case 'best':
			return m.feedback_best();
		case 'alternative':
			return m.feedback_alternative();
		case 'playable':
			return m.feedback_playable();
		case 'mistake':
			return m.feedback_mistake();
		case 'clearMistake':
			return m.feedback_clear_mistake();
		case 'blunder':
			return m.feedback_blunder();
		case 'timeout':
			return m.feedback_timeout();
	}
}
