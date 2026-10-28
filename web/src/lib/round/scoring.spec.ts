import { describe, it, expect } from 'vitest';
import { scoreGuess, scoreParticipantRound, TIMEOUT_PENALTY, type AnswerKeyStep } from './scoring';
import type { ParticipantState } from './round-machine';

// A synthetic answer-key step mirroring the shape produced by
// scripts/build-game-data.mjs: the move actually played plus a graded list of
// alternatives (tier + engine eval), including blunders used by the penalty ramp.
const step: AnswerKeyStep = {
	san: 'd4',
	playedComment: { eval: 0.85 },
	alternatives: [
		{ san: 'h3', tier: '+2', eval: 0.64, continuation: [] },
		{ san: 'Qe2', tier: '+1', eval: 0.29, continuation: [] },
		{ san: 'g3', tier: '0', eval: -0.39, continuation: [] },
		{ san: 'Bxh7', tier: 'blunder', eval: -4.0, continuation: [] }, // best 0.85 - (-4.0) = 4.85 => -1
		{ san: 'Ba6', tier: 'blunder', eval: -6.77, continuation: [] }, // best 0.85 - (-6.77) = 7.62 => -2
		{ san: 'Nd4', tier: 'blunder', eval: -9.13, continuation: [] } // best 0.85 - (-9.13) = 9.98 => -3
	]
};

describe('scoreGuess', () => {
	it('awards +3 for guessing the move actually played', () => {
		expect(scoreGuess(step, 'd4')).toBe(3);
	});

	it('maps the graduated tiers to +2 / +1 / 0', () => {
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
});

describe('scoreParticipantRound', () => {
	it('scores a submitted guess by its looked-up tier in a scoring round', () => {
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
