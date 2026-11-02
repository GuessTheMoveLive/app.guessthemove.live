import { describe, it, expect } from 'vitest';
import {
	computeGuessGroupBreakdown,
	bucketedBreakdownFor,
	chartParticipantLabel,
	chartPointsLabel,
	type GuessGroupBreakdown
} from './guess-groups';
import type { ParticipantState } from './round-machine';

const submitted = (guess: string): ParticipantState => ({ status: 'submitted', guess });

describe('computeGuessGroupBreakdown', () => {
	it('groups Participants by exact-match Guess (SAN)', () => {
		const { groups } = computeGuessGroupBreakdown(
			{ alice: submitted('d4'), bob: submitted('d4'), carol: submitted('Nf3') },
			{ alice: 3, bob: 3, carol: 1 }
		);
		expect(groups).toEqual([
			{ san: 'd4', score: 3, participantIds: ['alice', 'bob'] },
			{ san: 'Nf3', score: 1, participantIds: ['carol'] }
		]);
	});

	it('puts everyone who never submitted into one null-SAN group', () => {
		const { groups } = computeGuessGroupBreakdown(
			{ alice: { status: 'timedOut' }, bob: { status: 'timedOut' } },
			{ alice: -3, bob: -3 }
		);
		expect(groups).toEqual([{ san: null, score: -3, participantIds: ['alice', 'bob'] }]);
	});

	it('orders groups largest first, then by score, then by SAN', () => {
		const { groups } = computeGuessGroupBreakdown(
			{ a: submitted('d4'), b: submitted('Nf3'), c: submitted('c4'), d: submitted('Nf3') },
			{ a: 3, b: 1, c: 2, d: 1 }
		);
		// Nf3 (2 members) leads; the two singletons tie on size and break by score desc
		// (d4 scored 3, c4 scored 2).
		expect(groups.map((g) => g.san)).toEqual(['Nf3', 'd4', 'c4']);
	});

	it('tallies at most 7 buckets, one per Round Score, in +3..-3 descending order', () => {
		const { buckets } = computeGuessGroupBreakdown(
			{ a: submitted('d4'), b: submitted('d4'), c: submitted('x'), d: { status: 'timedOut' } },
			{ a: 3, b: 3, c: 0, d: -3 }
		);
		expect(buckets).toEqual([
			{ score: 3, count: 2 },
			{ score: 0, count: 1 },
			{ score: -3, count: 1 }
		]);
	});

	it('omits a score nobody got rather than showing it empty', () => {
		const { buckets } = computeGuessGroupBreakdown(
			{ a: submitted('d4'), b: submitted('x') },
			{ a: 3, b: -2 }
		);
		expect(buckets.map((b) => b.score)).toEqual([3, -2]);
	});

	it('is empty for a Round with no Participants', () => {
		expect(computeGuessGroupBreakdown({}, {})).toEqual({ groups: [], buckets: [] });
	});
});

describe('bucketedBreakdownFor', () => {
	const breakdown: GuessGroupBreakdown = {
		groups: [
			{ san: 'd4', score: 3, participantIds: ['alice', 'bob'] },
			{ san: 'Nf3', score: 1, participantIds: ['carol'] }
		],
		buckets: [
			{ score: 1, count: 1 },
			{ score: 3, count: 2 }
		]
	};

	it('passes the score buckets through unchanged — counts only, never a move', () => {
		expect(bucketedBreakdownFor(breakdown, 'alice')?.buckets).toEqual(breakdown.buckets);
	});

	it('reports the Guess-Group sentence for the recipient’s own group, minus themselves', () => {
		const forAlice = bucketedBreakdownFor(breakdown, 'alice');
		expect(forAlice?.ownScore).toBe(3);
		expect(forAlice?.sentence).toEqual({ san: 'd4', others: ['bob'] });
	});

	it('reports an empty others list when the recipient was alone in their group', () => {
		const forCarol = bucketedBreakdownFor(breakdown, 'carol');
		expect(forCarol?.ownScore).toBe(1);
		expect(forCarol?.sentence).toEqual({ san: 'Nf3', others: [] });
	});

	it('never leaks another group’s move or members into the sentence', () => {
		const forCarol = bucketedBreakdownFor(breakdown, 'carol');
		expect(forCarol?.sentence.san).not.toBe('d4');
		expect(forCarol?.sentence.others).not.toContain('alice');
		expect(forCarol?.sentence.others).not.toContain('bob');
	});

	it('returns null for a participant absent from every group', () => {
		expect(bucketedBreakdownFor(breakdown, 'dave')).toBeNull();
	});
});

describe('chartParticipantLabel', () => {
	it('is singular for exactly one Participant', () => {
		expect(chartParticipantLabel(1)).toBe('1 participant');
	});

	it('is plural for more than one, and for zero', () => {
		expect(chartParticipantLabel(2)).toBe('2 participants');
		expect(chartParticipantLabel(0)).toBe('0 participants');
	});
});

describe('chartPointsLabel', () => {
	it('signs a positive score and pluralises above one', () => {
		expect(chartPointsLabel(3)).toBe('+3 points');
		expect(chartPointsLabel(1)).toBe('+1 point');
	});

	it('keeps the minus sign and pluralises a negative score the same way', () => {
		expect(chartPointsLabel(-1)).toBe('-1 point');
		expect(chartPointsLabel(-3)).toBe('-3 points');
	});

	it('shows a plain, plural "0 points" for a zero score', () => {
		expect(chartPointsLabel(0)).toBe('0 points');
	});
});
