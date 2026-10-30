import { describe, it, expect } from 'vitest';
import {
	buildParticipantFeedback,
	explanationText,
	evalToSymbol,
	feedbackPhrase,
	EVAL_SYMBOLS
} from './feedback';
import type { AnswerKeyStep } from './scoring';
import type { ParticipantState } from './round-machine';

// d4 (+0.85) is a slight edge for White (⩲); g3 (-0.39) is equal (=); Nd4 (-9.13) is lost (-+).
const step: AnswerKeyStep = {
	san: 'd4',
	playedComment: { eval: 0.85 },
	alternatives: [
		{ san: 'h3', tier: '+2', eval: 0.64, continuation: ['Bxf3', 'Qxf3'] },
		{ san: 'g3', tier: '0', eval: -0.39, continuation: [] },
		{ san: 'Nd4', tier: 'blunder', eval: -9.13, continuation: [] } // -3
	]
};

// White's 5th move (ply 9) throughout — the Featured Side here is White.
const PLY = 9;

describe('buildParticipantFeedback', () => {
	it('is null when the Round has no answer key', () => {
		expect(buildParticipantFeedback(null, { status: 'submitted', guess: 'd4' }, 3, PLY)).toBeNull();
	});

	it('is null for a still-pending participant', () => {
		expect(buildParticipantFeedback(step, { status: 'pending' }, 0, PLY)).toBeNull();
	});

	it('tiers the move actually played as "best", with no variant, carrying the diagonal phrase', () => {
		const result = buildParticipantFeedback(step, { status: 'submitted', guess: 'd4' }, 3, PLY);
		expect(result).toEqual({
			tier: 'best',
			score: 3,
			ply: PLY,
			playedSan: 'd4',
			guessSan: 'd4',
			variant: null,
			// Matched move -> game symbol equals guess symbol -> the "same as played" phrase,
			// never a hard-coded "best move" claim (#43).
			phrase: feedbackPhrase('⩲', '⩲', 'w')
		});
	});

	it('carries the precomputed Variant and the eval-symbol phrase for a listed alternative', () => {
		const result = buildParticipantFeedback(step, { status: 'submitted', guess: 'h3' }, 2, PLY);
		expect(result).toEqual({
			tier: 'alternative',
			score: 2,
			ply: PLY,
			playedSan: 'd4',
			guessSan: 'h3',
			variant: { continuation: ['Bxf3', 'Qxf3'], endEval: 0.64 },
			phrase: feedbackPhrase('⩲', '⩲', 'w')
		});
	});

	it('phrases a worse-but-listed guess relative to the move played', () => {
		const result = buildParticipantFeedback(step, { status: 'submitted', guess: 'g3' }, 0, PLY);
		// g3 is equal (=) while d4 was a slight edge (⩲): worse than the move played.
		expect(result?.phrase).toBe(feedbackPhrase('⩲', '=', 'w'));
	});

	it('tiers an unlisted guess as "playable" with the generic fallback (no known eval)', () => {
		const unlisted = buildParticipantFeedback(step, { status: 'submitted', guess: 'a3' }, 0, PLY);
		expect(unlisted?.tier).toBe('playable');
		expect(unlisted?.variant).toBeNull();
		expect(unlisted?.phrase).toBeNull();

		const listedZero = buildParticipantFeedback(step, { status: 'submitted', guess: 'g3' }, 0, PLY);
		expect(listedZero?.tier).toBe('playable');
	});

	it('grades blunder severity from the already-computed score, with its symbol phrase', () => {
		const result = buildParticipantFeedback(step, { status: 'late', guess: 'Nd4' }, -3, PLY);
		expect(result?.tier).toBe('blunder');
		expect(result?.variant).toEqual({ continuation: [], endEval: -9.13 });
		expect(result?.phrase).toBe(feedbackPhrase('⩲', '-+', 'w'));
	});

	it('tiers a missed deadline as "timeout", with no guess and no phrase', () => {
		const result = buildParticipantFeedback(step, { status: 'timedOut' }, -3, PLY);
		expect(result).toEqual({
			tier: 'timeout',
			score: -3,
			ply: PLY,
			playedSan: 'd4',
			guessSan: null,
			variant: null,
			phrase: null
		});
	});

	it('leaves the phrase null when the move played has no known eval', () => {
		const noEval: AnswerKeyStep = { ...step, playedComment: { eval: null } };
		const result = buildParticipantFeedback(noEval, { status: 'submitted', guess: 'd4' }, 3, PLY);
		expect(result?.phrase).toBeNull();
	});
});

describe('evalToSymbol (#43 bands, White pawns perspective)', () => {
	it('maps each band to its symbol at the boundaries', () => {
		expect(evalToSymbol(3.0)).toBe('+-');
		expect(evalToSymbol(2.0)).toBe('±');
		expect(evalToSymbol(1.5)).toBe('±');
		expect(evalToSymbol(0.85)).toBe('⩲');
		expect(evalToSymbol(0.49)).toBe('=');
		expect(evalToSymbol(0)).toBe('=');
		expect(evalToSymbol(-0.5)).toBe('=');
		expect(evalToSymbol(-1.0)).toBe('⩱');
		expect(evalToSymbol(-2.0)).toBe('∓');
		expect(evalToSymbol(-3.0)).toBe('∓');
		expect(evalToSymbol(-9.13)).toBe('-+');
	});
});

describe('feedbackPhrase (#43: 7x7x2 eval-symbol lookup)', () => {
	it('covers every (game, guess, colour) triple with non-empty, number-free wording', () => {
		for (const color of ['w', 'b'] as const) {
			for (const game of EVAL_SYMBOLS) {
				for (const guess of EVAL_SYMBOLS) {
					const phrase = feedbackPhrase(game, guess, color);
					expect(phrase.length).toBeGreaterThan(0);
					expect(phrase).not.toMatch(/\d/);
				}
			}
		}
	});

	it('mirrors the perspective for Black: the same symbols read as the opponent for Black', () => {
		// A ± (White clearly better) matched by both sides: for White it is "a clear advantage
		// for you"; for a Black mover the very same symbols are "for your opponent".
		expect(feedbackPhrase('±', '±', 'w')).toContain('for you');
		expect(feedbackPhrase('±', '±', 'w')).not.toContain('opponent');
		expect(feedbackPhrase('±', '±', 'b')).toContain('opponent');
	});

	it('does not claim "best" on the diagonal of a merely-equal position (the d3/d4 bug)', () => {
		// 5.d3 (+0.49, "=") matched by a guess of d3: equal, not "the best move".
		const phrase = feedbackPhrase('=', '=', 'w');
		expect(phrase.toLowerCase()).not.toContain('best');
		expect(phrase).toContain('equal position');
	});
});

describe('explanationText', () => {
	it('has plain copy for every tier, no raw numbers', () => {
		const tiers = [
			'best',
			'alternative',
			'playable',
			'mistake',
			'clearMistake',
			'blunder',
			'timeout'
		] as const;
		for (const tier of tiers) {
			const text = explanationText(tier);
			expect(text.length).toBeGreaterThan(0);
			expect(text).not.toMatch(/[+-]?\d/);
		}
	});
});
