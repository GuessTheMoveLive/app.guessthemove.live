import { describe, it, expect } from 'vitest';
import { getGameData, getAnswerKeyStep, quizSteps, opponentResponseSteps } from './game-data';
import { scoreGuess } from './scoring';

const GAME_ID = 'bernstein-capablanca';

describe('game-data (ported Bernstein–Capablanca answer key)', () => {
	it('loads the precomputed table with a standard start position and plies', () => {
		const data = getGameData(GAME_ID);
		expect(data.startFen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
		expect(data.steps.length).toBeGreaterThan(0);
	});

	it('throws on a game id outside the Game Catalog manifest', () => {
		expect(() => getGameData('not-a-real-game')).toThrow();
	});

	it('loads each of the two manifested games by id, returning distinct, correct headers/steps (#95)', () => {
		const bernsteinCapablanca = getGameData('bernstein-capablanca');
		const capablancaMarshall = getGameData('capablanca-marshall');

		expect(bernsteinCapablanca.headers.White).toBe('Bernstein, Ossip Samuel');
		expect(bernsteinCapablanca.headers.Black).toBe('Capablanca, Jose Raul');
		expect(bernsteinCapablanca.steps.length).toBe(58);
		expect(bernsteinCapablanca.steps[0].san).toBe('d4');

		expect(capablancaMarshall.headers.White).toBe('Jose Raul Capablanca');
		expect(capablancaMarshall.headers.Black).toBe('Frank James Marshall');
		expect(capablancaMarshall.steps.length).toBe(77);
		expect(capablancaMarshall.steps[0].san).toBe('e4');

		expect(bernsteinCapablanca).not.toEqual(capablancaMarshall);
	});

	it('looks up a step by ply and returns null out of range', () => {
		const step = getAnswerKeyStep(GAME_ID, 10);
		expect(step?.san).toBe('O-O');
		expect(step?.alternatives.length).toBeGreaterThan(0);
		expect(getAnswerKeyStep(GAME_ID, 9999)).toBeNull();
	});

	it('scores a real guess end-to-end against the looked-up step', () => {
		const step = getAnswerKeyStep(GAME_ID, 10)!;
		expect(scoreGuess(step, 'O-O')).toBe(3); // the move actually played
		expect(scoreGuess(step, 'h6')).toBe(3); // the listed +3 alternative
		expect(scoreGuess(step, 'b5')).toBe(0); // a listed "0" tier move
	});

	it('exposes only the quizzed Featured Side steps via quizSteps()', () => {
		const quizzed = quizSteps(GAME_ID);
		expect(quizzed.length).toBeGreaterThan(0);
		expect(quizzed.every((step) => step.alternatives.length > 0)).toBe(true);
	});

	it('quizSteps() is empty when no Featured Game has been selected yet', () => {
		expect(quizSteps(null)).toEqual([]);
	});

	describe('opponentResponseSteps()', () => {
		it('on a non-final round, returns just the single next ply', () => {
			const quizzed = quizSteps(GAME_ID);
			const notLast = quizzed[0];

			const steps = opponentResponseSteps(GAME_ID, notLast.ply, false);

			expect(steps.map((s) => s.ply)).toEqual([notLast.ply + 1]);
		});

		it('on the final round, returns the entire remaining mainline through the game’s actual end', () => {
			const all = getGameData(GAME_ID).steps;
			const cutoff = all[all.length - 4].ply;

			const steps = opponentResponseSteps(GAME_ID, cutoff, true);

			expect(steps).toEqual(all.slice(-3));
		});

		it('on the final round, returns an empty list when the quizzed move was already the game’s last ply', () => {
			const all = getGameData(GAME_ID).steps;
			const lastPly = all[all.length - 1].ply;

			expect(opponentResponseSteps(GAME_ID, lastPly, true)).toEqual([]);
		});

		it('on a non-final round, returns an empty list if there is no recorded next ply', () => {
			const all = getGameData(GAME_ID).steps;
			const lastPly = all[all.length - 1].ply;

			expect(opponentResponseSteps(GAME_ID, lastPly, false)).toEqual([]);
		});

		it('is empty when no Featured Game has been selected yet', () => {
			expect(opponentResponseSteps(null, 1, false)).toEqual([]);
		});
	});
});
