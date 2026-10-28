import { describe, it, expect } from 'vitest';
import { buildParticipantFeedback, explanationText } from './feedback';
import type { AnswerKeyStep } from './scoring';
import type { ParticipantState } from './round-machine';

const step: AnswerKeyStep = {
	san: 'd4',
	playedComment: { eval: 0.85 },
	alternatives: [
		{ san: 'h3', tier: '+2', eval: 0.64, continuation: ['Bxf3', 'Qxf3'] },
		{ san: 'g3', tier: '0', eval: -0.39, continuation: [] },
		{ san: 'Nd4', tier: 'blunder', eval: -9.13, continuation: [] } // -3
	]
};

describe('buildParticipantFeedback', () => {
	it('is null when the Round has no answer key', () => {
		expect(buildParticipantFeedback(null, { status: 'submitted', guess: 'd4' }, 3)).toBeNull();
	});

	it('is null for a still-pending participant', () => {
		expect(buildParticipantFeedback(step, { status: 'pending' }, 0)).toBeNull();
	});

	it('tiers the move actually played as "best", with no variant', () => {
		const result = buildParticipantFeedback(step, { status: 'submitted', guess: 'd4' }, 3);
		expect(result).toEqual({
			tier: 'best',
			score: 3,
			playedSan: 'd4',
			guessSan: 'd4',
			variant: null
		});
	});

	it('carries the precomputed Variant for a listed alternative', () => {
		const result = buildParticipantFeedback(step, { status: 'submitted', guess: 'h3' }, 2);
		expect(result).toEqual({
			tier: 'alternative',
			score: 2,
			playedSan: 'd4',
			guessSan: 'h3',
			variant: { continuation: ['Bxf3', 'Qxf3'], endEval: 0.64 }
		});
	});

	it('tiers an unlisted guess as "playable", same as a listed 0', () => {
		const unlisted = buildParticipantFeedback(step, { status: 'submitted', guess: 'a3' }, 0);
		expect(unlisted?.tier).toBe('playable');
		expect(unlisted?.variant).toBeNull();

		const listedZero = buildParticipantFeedback(step, { status: 'submitted', guess: 'g3' }, 0);
		expect(listedZero?.tier).toBe('playable');
	});

	it('grades blunder severity from the already-computed score, not a fixed label', () => {
		const result = buildParticipantFeedback(step, { status: 'late', guess: 'Nd4' }, -3);
		expect(result?.tier).toBe('blunder');
		expect(result?.variant).toEqual({ continuation: [], endEval: -9.13 });
	});

	it('tiers a missed deadline as "timeout", with no guess', () => {
		const result = buildParticipantFeedback(step, { status: 'timedOut' }, -3);
		expect(result).toEqual({
			tier: 'timeout',
			score: -3,
			playedSan: 'd4',
			guessSan: null,
			variant: null
		});
	});
});

describe('explanationText', () => {
	it('has plain copy for every tier, no raw numbers', () => {
		const tiers = ['best', 'alternative', 'playable', 'mistake', 'clearMistake', 'blunder', 'timeout'] as const;
		for (const tier of tiers) {
			const text = explanationText(tier);
			expect(text.length).toBeGreaterThan(0);
			expect(text).not.toMatch(/[+-]?\d/);
		}
	});
});
