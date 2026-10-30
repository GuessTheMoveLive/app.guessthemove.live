import { describe, it, expect } from 'vitest';
import {
	computeGuessGroupBreakdown,
	redactBreakdownFor,
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

	it('tallies at most 7 buckets, one per Round Score, in -3..+3 order', () => {
		const { buckets } = computeGuessGroupBreakdown(
			{ a: submitted('d4'), b: submitted('d4'), c: submitted('x'), d: { status: 'timedOut' } },
			{ a: 3, b: 3, c: 0, d: -3 }
		);
		expect(buckets).toEqual([
			{ score: -3, count: 1 },
			{ score: 0, count: 1 },
			{ score: 3, count: 2 }
		]);
	});

	it('omits a score nobody got rather than showing it empty', () => {
		const { buckets } = computeGuessGroupBreakdown(
			{ a: submitted('d4'), b: submitted('x') },
			{ a: 3, b: -2 }
		);
		expect(buckets.map((b) => b.score)).toEqual([-2, 3]);
	});

	it('is empty for a Round with no Participants', () => {
		expect(computeGuessGroupBreakdown({}, {})).toEqual({ groups: [], buckets: [] });
	});
});

describe('redactBreakdownFor', () => {
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

	it('keeps names only on the recipient’s own Guess Group', () => {
		const forAlice = redactBreakdownFor(breakdown, 'alice');
		expect(forAlice.groups).toEqual([
			{ san: 'd4', score: 3, count: 2, names: ['alice', 'bob'] },
			{ san: 'Nf3', score: 1, count: 1, names: null }
		]);
	});

	it('reduces every other group to a bare count, never its names', () => {
		const forCarol = redactBreakdownFor(breakdown, 'carol');
		const otherGroup = forCarol.groups.find((g) => g.san === 'd4');
		expect(otherGroup).toEqual({ san: 'd4', score: 3, count: 2, names: null });
	});

	it('passes the chart buckets through unchanged (counts only, never names)', () => {
		expect(redactBreakdownFor(breakdown, 'alice').buckets).toEqual(breakdown.buckets);
	});
});
