import { describe, it, expect } from 'vitest';
import { getGameData, getAnswerKeyStep, quizSteps, opponentResponseSteps } from './game-data';
import { scoreGuess } from './scoring';

describe('game-data (ported Capablanca–Marshall answer key)', () => {
	it('loads the precomputed table with a standard start position and plies', () => {
		const data = getGameData();
		expect(data.startFen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
		expect(data.steps.length).toBeGreaterThan(0);
	});

	it('looks up a step by ply and returns null out of range', () => {
		const step = getAnswerKeyStep(9);
		expect(step?.san).toBe('d3');
		expect(step?.alternatives.length).toBeGreaterThan(0);
		expect(getAnswerKeyStep(9999)).toBeNull();
	});

	it('scores a real guess end-to-end against the looked-up step', () => {
		const step = getAnswerKeyStep(9)!;
		expect(scoreGuess(step, 'd3')).toBe(3); // the move actually played
		expect(scoreGuess(step, 'd4')).toBe(3); // the listed +3 alternative
		expect(scoreGuess(step, 'Ke2')).toBe(0); // a listed "0" tier move
	});

	it('exposes only the quizzed Featured Side steps via quizSteps()', () => {
		const quizzed = quizSteps();
		expect(quizzed.length).toBeGreaterThan(0);
		expect(quizzed.every((step) => step.alternatives.length > 0)).toBe(true);
	});

	describe('opponentResponseSteps()', () => {
		it('on a non-final round, returns just the single next ply', () => {
			const quizzed = quizSteps();
			const notLast = quizzed[0];

			const steps = opponentResponseSteps(notLast.ply, false);

			expect(steps.map((s) => s.ply)).toEqual([notLast.ply + 1]);
		});

		it('on the final round, returns the entire remaining mainline through the game’s actual end', () => {
			const all = getGameData().steps;
			const cutoff = all[all.length - 4].ply;

			const steps = opponentResponseSteps(cutoff, true);

			expect(steps).toEqual(all.slice(-3));
		});

		it('on the final round, returns an empty list when the quizzed move was already the game’s last ply', () => {
			const all = getGameData().steps;
			const lastPly = all[all.length - 1].ply;

			expect(opponentResponseSteps(lastPly, true)).toEqual([]);
		});

		it('on a non-final round, returns an empty list if there is no recorded next ply', () => {
			const all = getGameData().steps;
			const lastPly = all[all.length - 1].ply;

			expect(opponentResponseSteps(lastPly, false)).toEqual([]);
		});
	});
});
