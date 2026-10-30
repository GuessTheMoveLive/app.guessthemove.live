import { describe, it, expect } from 'vitest';
import {
	topLeaderboard,
	fullRanking,
	finishedMessageFor,
	scoreboardRows,
	submissionProgress,
	everyoneAnswered,
	remainingMs,
	formatCountdown,
	answerKeyBreakdown
} from './host-view';
import type { ParticipantState } from '#lib/round/round-machine.js';
import type { AnswerKeyStep } from '#lib/round/scoring.js';

describe('topLeaderboard', () => {
	it('returns participants ordered by running total, highest first', () => {
		const result = topLeaderboard({ alice: 2, bob: 7, carol: 4 });

		expect(result).toEqual([
			{ participantId: 'bob', total: 7 },
			{ participantId: 'carol', total: 4 },
			{ participantId: 'alice', total: 2 }
		]);
	});

	it('keeps only the top five (Kahoot-style shared view, #23)', () => {
		const totals = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7 };

		const result = topLeaderboard(totals);

		expect(result.map((e) => e.participantId)).toEqual(['g', 'f', 'e', 'd', 'c']);
	});

	it('breaks ties by participantId so the ordering is stable', () => {
		const result = topLeaderboard({ zoe: 3, amy: 3 });

		expect(result.map((e) => e.participantId)).toEqual(['amy', 'zoe']);
	});

	it('is empty before any round has closed (no totals yet)', () => {
		expect(topLeaderboard({})).toEqual([]);
	});

	it('honours a custom limit', () => {
		const result = topLeaderboard({ a: 1, b: 2, c: 3 }, 2);

		expect(result.map((e) => e.participantId)).toEqual(['c', 'b']);
	});
});

describe('fullRanking', () => {
	it('ranks every participant, not just the top 5 (#50)', () => {
		const totals = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7 };

		const result = fullRanking(totals);

		expect(result.map((e) => e.participantId)).toEqual(['g', 'f', 'e', 'd', 'c', 'b', 'a']);
	});

	it('breaks ties by participantId, same as topLeaderboard', () => {
		const result = fullRanking({ zoe: 3, amy: 3 });

		expect(result.map((e) => e.participantId)).toEqual(['amy', 'zoe']);
	});

	it('is empty with no participants', () => {
		expect(fullRanking({})).toEqual([]);
	});
});

describe('finishedMessageFor (#50)', () => {
	it('tells the solo leader they are in the lead', () => {
		expect(finishedMessageFor('alice', { alice: 10, bob: 4 })).toEqual({ kind: 'lead' });
	});

	it('tells every participant tied for first they are tied for the lead', () => {
		const totals = { alice: 10, bob: 10, carol: 4 };

		expect(finishedMessageFor('alice', totals)).toEqual({ kind: 'tiedLead' });
		expect(finishedMessageFor('bob', totals)).toEqual({ kind: 'tiedLead' });
	});

	it('tells everyone else how far behind the participant immediately above them they are', () => {
		const totals = { alice: 10, bob: 7, carol: 2 };

		expect(finishedMessageFor('bob', totals)).toEqual({ kind: 'behind', points: 3, name: 'alice' });
		expect(finishedMessageFor('carol', totals)).toEqual({ kind: 'behind', points: 5, name: 'bob' });
	});

	it('names the participant immediately above, not the overall leader', () => {
		// carol is behind bob, not alice - the gap and name are to the next-highest
		// participant above her, never straight to 1st (GLOSSARY: not a leaderboard
		// of "how far from first", one of "how far from whoever's just ahead").
		const totals = { alice: 20, bob: 7, carol: 2 };

		expect(finishedMessageFor('carol', totals)).toEqual({ kind: 'behind', points: 5, name: 'bob' });
	});
});

const pending: ParticipantState = { status: 'pending' };
const submitted: ParticipantState = { status: 'submitted', guess: 'e4' };
const late: ParticipantState = { status: 'late', guess: 'e4' };
const timedOut: ParticipantState = { status: 'timedOut' };

describe('scoreboardRows', () => {
	it('orders by running total, highest first, falling back to priorTotals pre-close', () => {
		const result = scoreboardRows(
			{ alice: pending, bob: pending },
			{},
			{ alice: 2, bob: 7 }
		);

		expect(result).toEqual([
			{ participantId: 'bob', score: 7, move: null },
			{ participantId: 'alice', score: 2, move: null }
		]);
	});

	it('prefers totals over priorTotals once the round has closed', () => {
		const result = scoreboardRows({ alice: submitted }, { alice: 9 }, { alice: 2 });

		expect(result).toEqual([{ participantId: 'alice', score: 9, move: 'e4' }]);
	});

	it('glyph-renders a submitted or late move, leaves pending/timed-out as null', () => {
		const result = scoreboardRows(
			{ alice: submitted, bob: late, carol: pending, dave: timedOut },
			{},
			{}
		);

		expect(result.map((r) => [r.participantId, r.move])).toEqual([
			['alice', 'e4'],
			['bob', 'e4'],
			['carol', null],
			['dave', null]
		]);
	});

	it('breaks score ties by participantId', () => {
		const result = scoreboardRows({ zoe: pending, amy: pending }, {}, { zoe: 3, amy: 3 });

		expect(result.map((r) => r.participantId)).toEqual(['amy', 'zoe']);
	});
});

describe('submissionProgress', () => {
	it('counts submitted answers against the full roster', () => {
		expect(submissionProgress({ alice: submitted, bob: pending, carol: pending })).toEqual({
			submitted: 1,
			total: 3
		});
	});

	it('counts a late answer as submitted but never leaks its content', () => {
		expect(submissionProgress({ alice: late, bob: pending })).toEqual({ submitted: 1, total: 2 });
	});

	it('does not count a timed-out participant as having submitted', () => {
		expect(submissionProgress({ alice: timedOut })).toEqual({ submitted: 0, total: 1 });
	});
});

describe('everyoneAnswered', () => {
	it('is true once every participant has submitted (safe to reveal early, #22)', () => {
		expect(everyoneAnswered({ alice: submitted, bob: submitted })).toBe(true);
	});

	it('is false while anyone is still pending', () => {
		expect(everyoneAnswered({ alice: submitted, bob: pending })).toBe(false);
	});

	it('is false with no participants at all', () => {
		expect(everyoneAnswered({})).toBe(false);
	});
});

describe('remainingMs', () => {
	it('is the gap between the deadline and now', () => {
		expect(remainingMs(1_000, 400)).toBe(600);
	});

	it('never goes negative once the deadline has passed', () => {
		expect(remainingMs(1_000, 5_000)).toBe(0);
	});

	it('is zero when there is no active deadline', () => {
		expect(remainingMs(null, 1_000)).toBe(0);
	});
});

describe('formatCountdown', () => {
	it('renders minutes and zero-padded seconds', () => {
		expect(formatCountdown(185_000)).toBe('3:05');
	});

	it('rounds up a partial second so the clock never shows 0:00 early', () => {
		expect(formatCountdown(1)).toBe('0:01');
	});

	it('renders a clean zero at the deadline', () => {
		expect(formatCountdown(0)).toBe('0:00');
	});
});

describe('answerKeyBreakdown', () => {
	const step: AnswerKeyStep = {
		san: 'Nf3',
		playedComment: { eval: 0.85 },
		alternatives: [
			{ san: 'Bb5', tier: '+2', eval: 0.64, continuation: ['a6', 'Bxc6'] },
			{ san: 'Qd4', tier: 'blunder', eval: -9.13, continuation: [] }
		]
	};

	it('renders the played move first, glyph-rendered, flagged as the best', () => {
		const rows = answerKeyBreakdown(step);
		expect(rows[0]).toEqual({
			san: 'Nf3',
			glyph: '♞f3',
			tier: '+3',
			eval: 0.85,
			continuation: []
		});
	});

	it('renders each alternative with its tier, eval and glyph-rendered continuation', () => {
		const rows = answerKeyBreakdown(step);
		expect(rows[1]).toEqual({
			san: 'Bb5',
			glyph: '♝b5',
			tier: '+2',
			eval: 0.64,
			continuation: ['a6', '♝xc6']
		});
		expect(rows[2].tier).toBe('blunder');
		expect(rows[2].continuation).toEqual([]);
	});

	it('is empty for a Round with no answer key', () => {
		expect(answerKeyBreakdown(null)).toEqual([]);
	});
});
