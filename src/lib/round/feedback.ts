import type { ParticipantState } from './round-machine';
import type { AnswerKeyStep } from './scoring';
import { m } from '#lib/paraglide/messages.js';

// Per-Participant Feedback (#36): a Host-triggered, personalized explanation of a
// Guess Score, sent as a targeted message to that Participant's own socket - not a
// shared broadcast phase, since every Participant's explanation differs. Computed
// server-side (SessionRoom) from the Participant's stored guess and the Round's
// answer key, then rendered on the Participant screen.

export type FeedbackTier =
	| 'best'
	| 'alternative'
	| 'playable'
	| 'mistake'
	| 'clearMistake'
	| 'blunder'
	| 'timeout';

export interface FeedbackVariant {
	/** The precomputed continuation's SANs, in order (Feedback's Variant, #36). */
	continuation: string[];
	/** The engine's evaluation at the end of this Variant, White's pawns-perspective. */
	endEval: number | null;
}

export interface ParticipantFeedback {
	tier: FeedbackTier;
	score: number;
	/** The move actually played by the Featured Side. */
	playedSan: string;
	/** The Participant's own submitted Guess, or null if they never submitted. */
	guessSan: string | null;
	/** The Variant backing this tier, when the Guess matched a graded alternative that
	 *  carries one - null for the move played (nothing more to show) and for a guess the
	 *  answer key never listed. */
	variant: FeedbackVariant | null;
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
	score: number
): ParticipantFeedback | null {
	if (!step) return null;

	if (state.status === 'timedOut') {
		return { tier: 'timeout', score, playedSan: step.san, guessSan: null, variant: null };
	}
	if (state.status === 'pending') return null;

	const guessSan = state.guess;
	if (guessSan === step.san) {
		return { tier: 'best', score, playedSan: step.san, guessSan, variant: null };
	}

	const alt = step.alternatives.find((a) => a.san === guessSan);
	if (!alt) {
		return { tier: 'playable', score, playedSan: step.san, guessSan, variant: null };
	}

	const variant: FeedbackVariant = { continuation: alt.continuation, endEval: alt.eval };
	if (alt.tier === 'blunder') {
		return { tier: blunderTier(score), score, playedSan: step.san, guessSan, variant };
	}
	const tier: FeedbackTier = alt.tier === '0' ? 'playable' : 'alternative';
	return { tier, score, playedSan: step.san, guessSan, variant };
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
