import { describe, it, expect } from 'vitest';
import {
	buildParticipantPgn,
	finalMoveSummary,
	participantPgnStats,
	roundsActuallyPlayed
} from './pgn';
import type { GameData, GameStep } from './game-data';
import type { AnswerKeyAlternative } from './scoring';

function step(partial: Partial<GameStep> & { ply: number; san: string }): GameStep {
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

const STANDARD_START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// Three graded (Featured Side) White moves — e4, Nf3, Bb5 — interleaved with two
// ungraded Black replies, so Round 0/1/2 map onto ply 1/3/5.
const STEPS: GameStep[] = [
	step({ ply: 1, san: 'e4', alternatives: [alt({ san: 'd4' })] }),
	step({ ply: 2, san: 'e5' }),
	step({ ply: 3, san: 'Nf3', alternatives: [alt({ san: 'Bc4' })] }),
	step({ ply: 4, san: 'Nc6' }),
	step({ ply: 5, san: 'Bb5', alternatives: [alt({ san: 'Bc4' })] })
];

function game(steps: GameStep[] = STEPS): GameData {
	return {
		headers: { Event: 'Test Game', White: 'Alice White', Black: 'Bob Black', Result: '1-0' },
		startFen: STANDARD_START,
		steps
	};
}

describe('roundsActuallyPlayed', () => {
	it('counts the live Round once its scores have closed', () => {
		expect(roundsActuallyPlayed(2, { alice: 1 })).toBe(3);
	});

	it('excludes the live Round when it never closed (early end mid-Round)', () => {
		expect(roundsActuallyPlayed(2, {})).toBe(2);
	});
});

describe('participantPgnStats', () => {
	const quizSteps = STEPS.filter((s) => s.alternatives.length > 0);
	const history = { 0: { alice: 'd4' }, 1: { alice: 'Nf3' } };

	it('computes points, rank, max achievable and match percent over the Rounds played', () => {
		const stats = participantPgnStats(
			quizSteps,
			history,
			'alice',
			{ alice: 2, bob: 5 },
			2,
			false
		);
		expect(stats).toEqual({
			points: 2,
			rank: 2,
			totalParticipants: 2,
			maxAchievable: 6,
			matchPercent: 50,
			roundsPlayed: 2,
			totalRounds: 3,
			endedEarly: false
		});
	});

	it('counts a timed-out Round (no history entry) against the match percentage', () => {
		const stats = participantPgnStats(quizSteps, {}, 'alice', { alice: -6 }, 2, false);
		expect(stats.matchPercent).toBe(0);
	});

	it('is 0%, not NaN, when no Rounds were played at all', () => {
		const stats = participantPgnStats(quizSteps, {}, 'alice', { alice: 0 }, 0, true);
		expect(stats.matchPercent).toBe(0);
		expect(stats.maxAchievable).toBe(0);
	});
});

describe('finalMoveSummary', () => {
	const baseStats = {
		points: 2,
		rank: 2,
		totalParticipants: 2,
		maxAchievable: 6,
		matchPercent: 50,
		roundsPlayed: 2,
		totalRounds: 3,
		endedEarly: false
	};

	it('states points, ranking, max achievable and match percent', () => {
		const text = finalMoveSummary(baseStats);
		expect(text).toContain('+2 points');
		expect(text).toContain('2nd of 2');
		expect(text).toContain('Maximum achievable: 6 (2 Rounds x 3)');
		expect(text).toContain('50% of Rounds');
	});

	it('omits any early-end note when the Session ended naturally', () => {
		expect(finalMoveSummary(baseStats)).not.toContain('ended this Session early');
	});

	it('adds an early-end note, with where it stopped, when the Session ended early', () => {
		const text = finalMoveSummary({ ...baseStats, endedEarly: true });
		expect(text).toContain('ended this Session early after Round 2 of 3');
		expect(text).toContain('reduced the maximum achievable points');
	});
});

describe('buildParticipantPgn', () => {
	it('renders the full original mainline with headers, regardless of Rounds played', () => {
		const pgn = buildParticipantPgn(game(), {}, 'alice', { alice: 0 }, 0, false);
		expect(pgn).toContain('[Event "Test Game"]');
		expect(pgn).toContain('[White "Alice White"]');
		expect(pgn).toContain('1. e4 e5 2. Nf3 Nc6 3. Bb5');
	});

	it("attaches every played Round's Guess as a move comment", () => {
		const history = { 0: { alice: 'd4' }, 1: { alice: 'Nf3' } };
		const pgn = buildParticipantPgn(game(), history, 'alice', { alice: 1 }, 2, true);
		expect(pgn).toContain('1. e4 {Guessed: d4} e5 2. Nf3 {Guessed: Nf3} Nc6');
	});

	it('carries no Guess comment on a Round beyond where the Session ended early', () => {
		const history = { 0: { alice: 'd4' }, 1: { alice: 'Nf3' } };
		// roundsPlayed = 2: Round 2 (the final move, Bb5) never happened.
		const pgn = buildParticipantPgn(game(), history, 'alice', { alice: 1 }, 2, true);
		const finalMoveSection = pgn.split('3. Bb5')[1];
		expect(finalMoveSection).not.toContain('Guessed: Bb5');
	});

	it("attaches the plain-prose performance summary to the PGN's final move", () => {
		const pgn = buildParticipantPgn(game(), {}, 'alice', { alice: -3 }, 1, false);
		expect(pgn).toContain('Final score: -3 points.');
		expect(pgn).not.toMatch(/\[\s*Points/i);
	});

	it("merges the final move's own Guess comment with the performance summary", () => {
		const history = { 0: { alice: 'd4' }, 1: { alice: 'Nf3' }, 2: { alice: 'Bb5' } };
		const pgn = buildParticipantPgn(game(), history, 'alice', { alice: 9 }, 3, false);
		expect(pgn).toContain('{Guessed: Bb5 Final score: +9 points.');
	});
});
