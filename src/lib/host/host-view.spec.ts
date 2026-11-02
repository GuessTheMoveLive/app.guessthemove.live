import { describe, it, expect } from 'vitest';
import {
	topLeaderboard,
	fullRanking,
	priorRanking,
	roundDeltas,
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
import { getAnswerKeyStep } from '#lib/round/game-data.js';
import { m } from '#lib/paraglide/messages.js';

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

describe('priorRanking (#55)', () => {
	it('reorders a final-ranking entries list by each participant’s prior total', () => {
		// bob overtakes alice this Round (entries, post-Reveal), but came into it behind her.
		const entries = topLeaderboard({ alice: 5, bob: 9 });

		const result = priorRanking(entries, { alice: 8, bob: 2 });

		expect(result.map((e) => e.participantId)).toEqual(['alice', 'bob']);
		// Totals stay the post-Reveal ones - only the order changes.
		expect(result).toEqual([
			{ participantId: 'alice', total: 5 },
			{ participantId: 'bob', total: 9 }
		]);
	});

	it('treats a participant missing from priorTotals (first Round scored) as 0', () => {
		const entries = topLeaderboard({ alice: 1, bob: 3 });

		const result = priorRanking(entries, {});

		expect(result.map((e) => e.participantId)).toEqual(['alice', 'bob']);
	});

	it('breaks ties by participantId, same as topLeaderboard/fullRanking', () => {
		const entries = topLeaderboard({ zoe: 3, amy: 3 });

		const result = priorRanking(entries, { zoe: 1, amy: 1 });

		expect(result.map((e) => e.participantId)).toEqual(['amy', 'zoe']);
	});
});

describe('roundDeltas (#68)', () => {
	it('computes this Round\'s point change for a participant with a prior total', () => {
		const entries = topLeaderboard({ alice: 9 });

		const result = roundDeltas(entries, { alice: 7 }, { alice: { status: 'submitted', guess: 'e4' } });

		expect(result).toEqual({ alice: 2 });
	});

	it('falls back a missing prior total to 0, same convention as priorRanking', () => {
		const entries = topLeaderboard({ bob: 3 });

		const result = roundDeltas(entries, {}, { bob: { status: 'late', guess: 'e4' } });

		expect(result).toEqual({ bob: 3 });
	});

	it('shows no delta at all for a participant who did not submit a Guess this Round', () => {
		const entries = topLeaderboard({ carol: 4 });

		const result = roundDeltas(entries, { carol: 4 }, { carol: { status: 'timedOut' } });

		expect(result).toEqual({});
		expect('carol' in result).toBe(false);
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
		const result = scoreboardRows({ alice: pending, bob: pending }, {}, { alice: 2, bob: 7 });

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
	// Nf3 (+0.85) is the strongest move here (loss 0 => its own computed tier is
	// already +3), so no GM-bonus remark is expected on its row (#61).
	const step: AnswerKeyStep = {
		san: 'Nf3',
		color: 'w',
		playedComment: { eval: 0.85 },
		alternatives: [
			{ san: 'Bb5', eval: 0.64, continuation: ['a6', 'Bxc6'] }, // loss ~1.9 => +3
			{ san: 'Qd4', eval: -9.13, continuation: [] } // loss ~54.4 => blunder
		]
	};

	it('renders the played move first, numbered and glyph-rendered, flagged as the best, with no remark', () => {
		const rows = answerKeyBreakdown(step, 9);
		expect(rows[0]).toEqual({
			san: 'Nf3',
			glyph: '5.♞f3',
			tier: '+3',
			eval: 0.85,
			continuation: '',
			isGameMove: true,
			remark: null
		});
	});

	it('renders each alternative with its computed tier, eval and a numbered, glyph-rendered continuation', () => {
		const rows = answerKeyBreakdown(step, 9);
		// Bb5 computes to +3 too (it's nearly as strong as the move played), but
		// isGameMove is keyed on SAN identity with the move played, never on tier (#61)
		// - so it is never flagged even though it shares the same +3 label.
		expect(rows[1]).toEqual({
			san: 'Bb5',
			glyph: '5.♝b5',
			tier: '+3',
			eval: 0.64,
			continuation: '5...a6 6.♝xc6',
			isGameMove: false,
			remark: null
		});
		expect(rows[2].tier).toBe('blunder');
		expect(rows[2].continuation).toBe('');
		expect(rows[2].isGameMove).toBe(false);
	});

	it('is empty for a Round with no answer key', () => {
		expect(answerKeyBreakdown(null, 9)).toEqual([]);
	});

	it('sorts by computed strength descending, moving the move played out of first place when it was not objectively best', () => {
		// d3 (played, eval 0.00) is weaker than both d4 and h3 - mirrors the issue's
		// own Capablanca-Marshall move 5 example (#61).
		const upset: AnswerKeyStep = {
			san: 'd3',
			color: 'w',
			playedComment: { eval: 0.0 },
			alternatives: [
				{ san: 'd4', eval: 2.0, continuation: [] }, // loss 0 => +3
				{ san: 'h3', eval: 1.41, continuation: [] }, // loss ~4.9 => +2
				{ san: 'Ba4', eval: -4.21, continuation: [] } // loss ~50.1 => blunder (-3)
			]
		};

		const rows = answerKeyBreakdown(upset, 9);
		expect(rows.map((r) => r.san)).toEqual(['d4', 'h3', 'd3', 'Ba4']);
		// The move played still displays and is flagged as the fixed +3, even sorted
		// below stronger alternatives.
		expect(rows[2]).toMatchObject({ san: 'd3', tier: '+3', isGameMove: true });
	});

	it('keeps exactly-tied-strength rows in their original source order (stable sort)', () => {
		const tied: AnswerKeyStep = {
			san: 'played',
			color: 'w',
			playedComment: { eval: 2.0 },
			alternatives: [
				{ san: 'Zxy', eval: 1.8, continuation: [] }, // equal to Abc - a genuine tie
				{ san: 'Abc', eval: 1.8, continuation: [] }
			]
		};

		const rows = answerKeyBreakdown(tied, 9);
		expect(rows.map((r) => r.san)).toEqual(['played', 'Zxy', 'Abc']);
	});

	it('ranks by win-probability strength, not the bucketed tier, so same-tier moves still separate (#65)', () => {
		// Zxy and Abc both compute to tier +2 (same bucket as d3 in the sort test above),
		// but Zxy's eval is closer to the best move's, so it must still outrank Abc.
		const sameTier: AnswerKeyStep = {
			san: 'played',
			color: 'w',
			playedComment: { eval: 0.0 },
			alternatives: [
				{ san: 'Best', eval: 2.0, continuation: [] },
				{ san: 'Abc', eval: 0.5, continuation: [] },
				{ san: 'Zxy', eval: 0.8, continuation: [] }
			]
		};

		const rows = answerKeyBreakdown(sameTier, 9);
		const [, abcRow, zxyRow] = [rows[0], rows.find((r) => r.san === 'Abc')!, rows.find((r) => r.san === 'Zxy')!];
		expect(abcRow.tier).toBe(zxyRow.tier);
		expect(rows.map((r) => r.san).indexOf('Zxy')).toBeLessThan(rows.map((r) => r.san).indexOf('Abc'));
	});

	it('sorts a Black-to-move step by the mover-mirrored strength, not raw White-perspective eval', () => {
		const blackToMove: AnswerKeyStep = {
			san: 'played',
			color: 'b',
			playedComment: { eval: 1.0 }, // bad for Black
			alternatives: [{ san: 'Better', eval: -1.0, continuation: [] }] // good for Black
		};

		const rows = answerKeyBreakdown(blackToMove, 9);
		expect(rows.map((r) => r.san)).toEqual(['Better', 'played']);
	});

	it('shows the GM-bonus remark, naming the mover, only when the move played is not already +3', () => {
		const upset: AnswerKeyStep = {
			san: 'd3',
			color: 'w',
			playedComment: { eval: 0.0 }, // computed tier '0' (loss ~17.6 against d4's best)
			alternatives: [{ san: 'd4', eval: 2.0, continuation: [] }]
		};

		const named = answerKeyBreakdown(upset, 9, 'Capablanca', 'Marshall');
		expect(named.find((r) => r.san === 'd3')?.remark).toBe(
			m.host_answer_key_gm_remark_named({ tier: '0', name: 'Capablanca' })
		);

		const unnamed = answerKeyBreakdown(upset, 9, null, null);
		expect(unnamed.find((r) => r.san === 'd3')?.remark).toBe(
			m.host_answer_key_gm_remark_generic({ tier: '0' })
		);

		// Never on an alternative's own row.
		expect(named.find((r) => r.san === 'd4')?.remark).toBeNull();
	});

	it("resolves the remark name to the mover's own colour, not always White", () => {
		const blackToMove: AnswerKeyStep = {
			san: 'Qd7',
			color: 'b',
			playedComment: { eval: 2.0 }, // bad for the Black mover (White-perspective eval)
			alternatives: [{ san: 'Qd8', eval: -2.0, continuation: [] }] // much better for Black
		};

		const rows = answerKeyBreakdown(blackToMove, 9, 'Capablanca', 'Marshall');
		const remark = rows.find((r) => r.san === 'Qd7')?.remark;
		expect(remark).not.toBeNull();
		expect(remark).toContain('Marshall');
		expect(remark).not.toContain('Capablanca');
	});

	it('gold-borders only the move actually played, even when real game data shares its tier across several rows (#62)', () => {
		// White's move 6 in the actual Capablanca-Marshall answer key: 6.Nbd2 was
		// played, but 6.h3, 6.O-O, 6.Ba4, 6.d4, 6.a3 and 6.Be3 all also compute to
		// +3 - exactly the ambiguous case #62 was filed against.
		const step = getAnswerKeyStep(11)!;
		expect(step.san).toBe('Nbd2');

		const rows = answerKeyBreakdown(step, 11, 'Capablanca', 'Marshall');
		const plusThreeSans = rows.filter((r) => r.tier === '+3').map((r) => r.san);
		expect(plusThreeSans).toEqual(expect.arrayContaining(['h3', 'O-O', 'Nbd2']));
		expect(plusThreeSans.length).toBeGreaterThan(1);

		const goldRows = rows.filter((r) => r.isGameMove);
		expect(goldRows).toHaveLength(1);
		expect(goldRows[0].san).toBe('Nbd2');
	});

	it('sorts the real Capablanca-Marshall move 5 by strength, not source order (#65)', () => {
		// White's move 5 in the actual answer key: 5.d3 was played, but 5.d4, 5.h3 and
		// 5.Ba4 all compute stronger, and 5.O-O ties d3's computed tier yet is still the
		// objectively better move - the exact upset the issue was filed against.
		const step = getAnswerKeyStep(9)!;
		expect(step.san).toBe('d3');

		const rows = answerKeyBreakdown(step, 9, 'Capablanca', 'Marshall');
		const sans = rows.map((r) => r.san);
		const [d4, h3, ba4, oo, d3] = ['d4', 'h3', 'Ba4', 'O-O', 'd3'].map((s) => sans.indexOf(s));
		expect(d4).toBeLessThan(h3);
		expect(h3).toBeLessThan(ba4);
		expect(ba4).toBeLessThan(oo);
		expect(oo).toBeLessThan(d3);
	});
});
