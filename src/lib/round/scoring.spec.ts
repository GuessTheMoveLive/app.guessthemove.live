import { describe, it, expect } from 'vitest';
import {
	scoreGuess,
	computeTier,
	playedMoveTier,
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
// margin either side of each banding cutoff (5 / 10 / 20 / 35 / 50). h3 sits
// right behind the played move (loss ~2.69, under the '+2' floor), so per #70
// it is promoted to '+3' as the sound next-best-ranked move — the played move
// is itself a loss-0 '+3' by the old band, satisfying the promotion's gate.
const step: AnswerKeyStep = {
	san: 'd4',
	color: 'w',
	playedComment: { eval: 1.0 },
	alternatives: [
		{ san: 'h3', eval: 0.7, continuation: [] }, // next-best-ranked, loss ~2.69 => +3 (#70)
		{ san: 'Qe2', eval: 0.4, continuation: [] }, // loss ~5.42 => +1
		{ san: 'g3', eval: -0.3, continuation: [] }, // loss ~11.86 => 0
		{ san: 'Bxh7', eval: -1.8, continuation: [] }, // loss ~25.08 => blunder -1
		{ san: 'Ba6', eval: -3.6, continuation: [] }, // loss ~38.10 => blunder -2
		{ san: 'Nd4', eval: -9.0, continuation: [] } // loss ~55.58 => blunder -3
	]
};

describe('computeTier (win-probability-loss bands, #61)', () => {
	it('awards +3 to the best move itself', () => {
		expect(computeTier(step, 1.0)).toBe('+3'); // the played move: loss 0
	});

	it('bands +1/0 for alternatives with increasing loss', () => {
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

	describe('+3 is rank-based, not a flat loss band (#70)', () => {
		it('promotes a sound next-best-ranked alternative to +3', () => {
			expect(computeTier(step, 0.7)).toBe('+3'); // h3: loss ~2.69, under the +2 floor
		});

		it('awards +3 to an alternative tied with the played move', () => {
			const tied: AnswerKeyStep = {
				san: 'd4',
				color: 'w',
				playedComment: { eval: 1.0 },
				alternatives: [{ san: 'e4', eval: 1.0, continuation: [] }]
			};
			expect(computeTier(tied, 1.0)).toBe('+3');
		});

		it('awards +3 to an alternative strictly better than the played move', () => {
			const upset: AnswerKeyStep = {
				san: 'played',
				color: 'w',
				playedComment: { eval: 0.3 }, // not +3 by itself against 'stronger'
				alternatives: [{ san: 'stronger', eval: 1.0, continuation: [] }]
			};
			expect(computeTier(upset, 1.0)).toBe('+3');
			expect(playedMoveTier(upset)).toBe('+1'); // the played move's own computed tier
			expect(scoreGuess(upset, 'played')).toBe(3); // override still applies
		});

		it('does not promote the next-best rank when its own loss exceeds the +2 floor', () => {
			const distantSecond: AnswerKeyStep = {
				san: 'best',
				color: 'w',
				playedComment: { eval: 2.0 },
				alternatives: [{ san: 'x', eval: -0.3, continuation: [] }] // loss ~41, nowhere near +2
			};
			expect(computeTier(distantSecond, -0.3)).toBe('blunder');
		});

		it('does not promote the next-best rank when the played move is not a +3 by itself', () => {
			// 'played' has loss ~11.4 from 'best' (not within the old loss<=2 gate), so the
			// rank-2 move 'runnerUp' gets no promotion even though its own loss is small.
			const notElite: AnswerKeyStep = {
				san: 'played',
				color: 'w',
				playedComment: { eval: 0.3 },
				alternatives: [
					{ san: 'best', eval: 1.0, continuation: [] },
					{ san: 'runnerUp', eval: 0.28, continuation: [] } // loss ~1.4 from 'played', but not next-after 'best'
				]
			};
			expect(computeTier(notElite, 0.28)).not.toBe('+3');
		});

		it('promotes every move tied for the next-best rank', () => {
			const tiedRunnersUp: AnswerKeyStep = {
				san: 'd4',
				color: 'w',
				playedComment: { eval: 1.0 },
				alternatives: [
					{ san: 'h3', eval: 0.7, continuation: [] },
					{ san: 'c4', eval: 0.7, continuation: [] } // tied with h3 for next-after
				]
			};
			expect(computeTier(tiedRunnersUp, 0.7)).toBe('+3');
		});
	});
});

describe('scoreGuess', () => {
	it('awards +3 for guessing the move actually played', () => {
		expect(scoreGuess(step, 'd4')).toBe(3);
	});

	it('awards +3 for the next-best-ranked alternative, +1/0 further down', () => {
		expect(scoreGuess(step, 'h3')).toBe(3);
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
		expect(playedMoveTier(upset)).toBe('blunder');
		expect(scoreGuess(upset, 'played')).toBe(3);
	});
});

describe('scoreParticipantRound', () => {
	it('scores a submitted guess by its computed tier in a scoring round', () => {
		const state: ParticipantState = { status: 'submitted', guess: 'h3' };
		expect(scoreParticipantRound(state, step, true)).toBe(3);
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
