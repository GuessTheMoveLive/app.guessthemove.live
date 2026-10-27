import { describe, it, expect } from 'vitest';
import { getGameData, getAnswerKeyStep, quizSteps } from './game-data';
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
});
