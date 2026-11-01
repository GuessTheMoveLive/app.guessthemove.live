import { describe, it, expect } from 'vitest';
import { buildGameSheet } from './game-sheet';
import type { GameStep } from './game-data';
import type { AnswerKeyAlternative } from './scoring';

function step(
	partial: Partial<GameStep> & { ply: number; san: string }
): GameStep {
	return {
		color: partial.ply % 2 === 1 ? 'w' : 'b',
		fenBefore: '',
		fenAfter: '',
		moveNumber: null,
		playedComment: null,
		alternatives: [],
		...partial
	};
}

function alt(partial: Partial<AnswerKeyAlternative> & { san: string }): AnswerKeyAlternative {
	return { tier: '0', eval: null, continuation: [], ...partial };
}

describe('buildGameSheet (#58: per-move Guess/points decoration)', () => {
	it('leaves a move with no graded alternatives undecorated', () => {
		const rows = buildGameSheet([step({ ply: 1, san: 'e4' })], {}, 'alice');
		expect(rows).toEqual([{ number: 1, white: { san: 'e4', guess: null }, black: null }]);
	});

	it('blanks the Guess text when it matches the move played, but always shows points', () => {
		const quiz = step({ ply: 1, san: 'e4', alternatives: [alt({ san: 'd4' })] });
		const rows = buildGameSheet([quiz], { 0: { alice: 'e4' } }, 'alice');
		expect(rows[0].white).toEqual({ san: 'e4', guess: { text: '', points: 3 } });
	});

	it('shows the Guess (glyph-rendered) when it differs from the move played', () => {
		const quiz = step({
			ply: 1,
			san: 'e4',
			alternatives: [alt({ san: 'Nf3', tier: '+1' })]
		});
		const rows = buildGameSheet([quiz], { 0: { alice: 'Nf3' } }, 'alice');
		expect(rows[0].white).toEqual({ san: 'e4', guess: { text: '♞f3', points: 1 } });
	});

	it('shows an em-dash with the timeout penalty when no Guess was submitted', () => {
		const quiz = step({ ply: 1, san: 'e4', alternatives: [alt({ san: 'd4' })] });
		const rows = buildGameSheet([quiz], {}, 'alice');
		expect(rows[0].white).toEqual({ san: 'e4', guess: { text: '—', points: -3 } });
	});

	it('scores a listed blunder alternative using the graduated penalty', () => {
		const quiz = step({
			ply: 1,
			san: 'e4',
			playedComment: { eval: 46 },
			alternatives: [alt({ san: 'g4', tier: 'blunder', eval: 40 })]
		});
		const rows = buildGameSheet([quiz], { 0: { alice: 'g4' } }, 'alice');
		expect(rows[0].white?.guess).toEqual({ text: 'g4', points: -1 });
	});

	it('advances the Round index only on graded steps, tracking multiple Rounds correctly', () => {
		const steps = [
			step({ ply: 1, san: 'e4', alternatives: [alt({ san: 'd4' })] }), // Round 0 (White)
			step({ ply: 2, san: 'e5' }), // opponent reply, ungraded
			step({ ply: 3, san: 'Nf3', alternatives: [alt({ san: 'Bc4' })] }) // Round 1 (White)
		];
		const rows = buildGameSheet(
			steps,
			{ 0: { alice: 'd4' }, 1: { alice: 'Bc4' } },
			'alice'
		);

		expect(rows).toEqual([
			{
				number: 1,
				white: { san: 'e4', guess: { text: 'd4', points: 0 } },
				black: { san: 'e5', guess: null }
			},
			{
				number: 2,
				white: { san: '♞f3', guess: { text: '♝c4', points: 0 } },
				black: null
			}
		]);
	});

	it('resolves each participant’s own Guess independently from the shared history', () => {
		const quiz = step({ ply: 1, san: 'e4', alternatives: [alt({ san: 'd4' })] });
		const rows = buildGameSheet([quiz], { 0: { alice: 'e4', bob: 'd4' } }, 'bob');
		expect(rows[0].white).toEqual({ san: 'e4', guess: { text: 'd4', points: 0 } });
	});

	it('is empty with no moves played yet', () => {
		expect(buildGameSheet([], {}, 'alice')).toEqual([]);
	});
});
