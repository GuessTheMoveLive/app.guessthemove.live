import { describe, it, expect } from 'vitest';
import {
	scoreGuess,
	computeTier,
	scoreParticipantRound,
	TIMEOUT_PENALTY,
	type AnswerKeyStep
} from './scoring';
import type { ParticipantState } from './round-machine';

// A synthetic answer-key step mirroring the shape produced by
// scripts/build-game-data.mjs: the move actually played plus a graded list of
// alternatives (engine eval only — #61 retires the hand-typed tier label).
// The played move's own eval (+1.00) is the best option, so every alternative's
// win-probability-loss is measured against it; evals are chosen with a clear
// margin either side of each banding cutoff (2 / 5 / 10 / 20 / 35 / 50).
const step: AnswerKeyStep = {
	san: 'd4',
	color: 'w',
	playedComment: { eval: 1.0 },
	alternatives: [
		{ san: 'h3', eval: 0.7, continuation: [] }, // loss ~2.69 => +2
		{ san: 'Qe2', eval: 0.4, continuation: [] }, // loss ~5.42 => +1
		{ san: 'g3', eval: -0.3, continuation: [] }, // loss ~11.86 => 0
		{ san: 'Bxh7', eval: -1.8, continuation: [] }, // loss ~25.08 => blunder -1
		{ san: 'Ba6', eval: -3.6, continuation: [] }, // loss ~38.10 => blunder -2
		{ san: 'Nd4', eval: -9.0, continuation: [] } // loss ~55.58 => blunder -3
	]
};

describe('computeTier (win-probability-loss bands, #61)', () => {
	it('awards +3 for a loss at/under 2', () => {
		expect(computeTier(step, 1.0)).toBe('+3'); // the best move itself: loss 0
	});

	it('bands +2/+1/0 for alternatives with increasing loss', () => {
		expect(computeTier(step, 0.7)).toBe('+2');
		expect(computeTier(step, 0.4)).toBe('+1');
		expect(computeTier(step, -0.3)).toBe('0');
	});

	it('bands anything past the 20-loss cutoff as blunder', () => {
		expect(computeTier(step, -1.8)).toBe('blunder');
		expect(computeTier(step, -3.6)).toBe('blunder');
		expect(computeTier(step, -9.0)).toBe('blunder');
	});

	it('is null when the eval is unknown', () => {
		expect(computeTier(step, null)).toBeNull();
	});

	describe('at and around each cutoff (best = 2.00 pawns, White to move)', () => {
		const base: AnswerKeyStep = {
			san: 'best',
			color: 'w',
			playedComment: { eval: 2.0 },
			alternatives: []
		};

		it('2-loss cutoff: +3 just inside, +2 just outside', () => {
			expect(computeTier(base, 1.77)).toBe('+3'); // loss ~1.88
			expect(computeTier(base, 1.74)).toBe('+2'); // loss ~2.13
		});

		it('5-loss cutoff: +2 just inside, +1 just outside', () => {
			expect(computeTier(base, 1.41)).toBe('+2'); // loss ~4.92
			expect(computeTier(base, 1.39)).toBe('+1'); // loss ~5.10
		});

		it('10-loss cutoff: +1 just inside, 0 just outside', () => {
			expect(computeTier(base, 0.85)).toBe('+1'); // loss ~9.86
			expect(computeTier(base, 0.82)).toBe('0'); // loss ~10.12
		});

		it('20-loss cutoff: 0 just inside, blunder just outside', () => {
			expect(computeTier(base, -0.25)).toBe('0'); // loss ~19.91
			expect(computeTier(base, -0.27)).toBe('blunder'); // loss ~20.09
		});

		it('35-loss cutoff: blunder on both sides, but the graduated score steps down', () => {
			expect(computeTier(base, -1.96)).toBe('blunder'); // loss ~34.90
			expect(computeTier(base, -1.98)).toBe('blunder'); // loss ~35.06
			expect(
				scoreGuess({ ...base, alternatives: [{ san: 'x', eval: -1.96, continuation: [] }] }, 'x')
			).toBe(-1);
			expect(
				scoreGuess({ ...base, alternatives: [{ san: 'x', eval: -1.98, continuation: [] }] }, 'x')
			).toBe(-2);
		});

		it('50-loss cutoff: the graduated score steps down from -2 to -3', () => {
			expect(
				scoreGuess({ ...base, alternatives: [{ san: 'x', eval: -4.17, continuation: [] }] }, 'x')
			).toBe(-2); // loss ~49.88
			expect(
				scoreGuess({ ...base, alternatives: [{ san: 'x', eval: -4.21, continuation: [] }] }, 'x')
			).toBe(-3); // loss ~50.09
		});
	});

	it('mirrors the loss direction for a Black mover', () => {
		// Black's actual move (-2.00, White's perspective) is a big edge for Black; an
		// alternative at -0.50 is a much smaller edge for Black, i.e. objectively worse
		// for the Black mover despite being a "less negative" White-perspective eval. A
		// non-mirrored implementation would get this backwards.
		const blackStep: AnswerKeyStep = {
			san: 'Qxb2',
			color: 'b',
			playedComment: { eval: -2.0 },
			alternatives: [{ san: 'Qxc2', eval: -0.5, continuation: [] }]
		};
		expect(computeTier(blackStep, -0.5)).toBe('0');
		expect(scoreGuess(blackStep, 'Qxc2')).toBe(0);
	});
});

describe('scoreGuess', () => {
	it('awards +3 for guessing the move actually played', () => {
		expect(scoreGuess(step, 'd4')).toBe(3);
	});

	it('maps the computed tiers to +2 / +1 / 0', () => {
		expect(scoreGuess(step, 'h3')).toBe(2);
		expect(scoreGuess(step, 'Qe2')).toBe(1);
		expect(scoreGuess(step, 'g3')).toBe(0);
	});

	it('scores an unlisted (not-reasonable) move as 0', () => {
		expect(scoreGuess(step, 'Nh3')).toBe(0);
	});

	it('ramps the blunder penalty by win-probability distance from the best move', () => {
		expect(scoreGuess(step, 'Bxh7')).toBe(-1);
		expect(scoreGuess(step, 'Ba6')).toBe(-2);
		expect(scoreGuess(step, 'Nd4')).toBe(-3);
	});

	it('always awards +3 for the move played, even when its own computed tier is not +3', () => {
		// A much stronger alternative exists, so the played move's own computed tier
		// is a blunder — the override still scores it +3 (#61's "did you guess what
		// was actually played" design), on top of the computed-tier system, not
		// instead of it.
		const upset: AnswerKeyStep = {
			san: 'played',
			color: 'w',
			playedComment: { eval: -5.0 },
			alternatives: [{ san: 'stronger', eval: 2.0, continuation: [] }]
		};
		expect(computeTier(upset, -5.0)).toBe('blunder');
		expect(scoreGuess(upset, 'played')).toBe(3);
	});
});

describe('scoreParticipantRound', () => {
	it('scores a submitted guess by its computed tier in a scoring round', () => {
		const state: ParticipantState = { status: 'submitted', guess: 'h3' };
		expect(scoreParticipantRound(state, step, true)).toBe(2);
	});

	it('applies a hard -3 to a timed-out participant', () => {
		const state: ParticipantState = { status: 'timedOut' };
		expect(scoreParticipantRound(state, step, true)).toBe(TIMEOUT_PENALTY);
		expect(TIMEOUT_PENALTY).toBe(-3);
	});

	it('applies a hard -3 to a late submission (missed the deadline)', () => {
		const state: ParticipantState = { status: 'late', guess: 'd4' };
		expect(scoreParticipantRound(state, step, true)).toBe(-3);
	});

	it('scores 0 regardless of tier before the Scoring Start Move', () => {
		expect(scoreParticipantRound({ status: 'submitted', guess: 'd4' }, step, false)).toBe(0);
		expect(scoreParticipantRound({ status: 'timedOut' }, step, false)).toBe(0);
	});
});
