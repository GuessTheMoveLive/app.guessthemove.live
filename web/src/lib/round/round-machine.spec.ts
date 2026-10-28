import { describe, it, expect } from 'vitest';
import { createActor } from 'xstate';
import { roundMachine, type RoundInput } from './round-machine';
import type { AnswerKeyStep } from './scoring';

function actorWith(participantIds: string[]) {
	const actor = createActor(roundMachine, {
		input: { participantIds }
	});
	actor.start();
	return actor;
}

function actorWithInput(input: RoundInput) {
	const actor = createActor(roundMachine, { input });
	actor.start();
	return actor;
}

const answerKey: AnswerKeyStep = {
	san: 'd4',
	playedComment: { eval: 0.85 },
	alternatives: [
		{ san: 'h3', tier: '+2', eval: 0.64 },
		{ san: 'Nd4', tier: 'blunder', eval: -9.13 }
	]
};

describe('roundMachine', () => {
	it('starts in lobby with every participant pending', () => {
		const actor = actorWith(['alice', 'bob']);

		expect(actor.getSnapshot().value).toBe('lobby');
		expect(actor.getSnapshot().context.participants).toEqual({
			alice: { status: 'pending' },
			bob: { status: 'pending' }
		});
	});

	it('moves to active on START_ROUND', () => {
		const actor = actorWith(['alice']);

		actor.send({ type: 'START_ROUND' });

		expect(actor.getSnapshot().value).toBe('active');
	});

	it('records a submission that arrives before the round closes', () => {
		const actor = actorWith(['alice', 'bob']);
		actor.send({ type: 'START_ROUND' });

		actor.send({ type: 'SUBMIT', participantId: 'alice', guess: 'e4' });

		expect(actor.getSnapshot().context.participants.alice).toEqual({
			status: 'submitted',
			guess: 'e4'
		});
		expect(actor.getSnapshot().context.participants.bob).toEqual({ status: 'pending' });
	});

	it('closes the round on ROUND_TIMEOUT and marks every still-pending participant as timedOut', () => {
		const actor = actorWith(['alice', 'bob']);
		actor.send({ type: 'START_ROUND' });
		actor.send({ type: 'SUBMIT', participantId: 'alice', guess: 'e4' });

		actor.send({ type: 'ROUND_TIMEOUT' });

		expect(actor.getSnapshot().value).toBe('closed');
		expect(actor.getSnapshot().context.participants.alice.status).toBe('submitted');
		expect(actor.getSnapshot().context.participants.bob.status).toBe('timedOut');
	});

	it('a submission that arrives before ROUND_TIMEOUT is processed, even by a fraction of a tick', () => {
		// This is the Q30 edge case: ordering is by arrival at the machine (the server),
		// never by the client's own clock. Sending SUBMIT then ROUND_TIMEOUT in that order
		// must count the submission as on-time, with no race condition possible because
		// both events are processed sequentially by the same actor.
		const actor = actorWith(['alice']);
		actor.send({ type: 'START_ROUND' });

		actor.send({ type: 'SUBMIT', participantId: 'alice', guess: 'e4' });
		actor.send({ type: 'ROUND_TIMEOUT' });

		expect(actor.getSnapshot().context.participants.alice.status).toBe('submitted');
	});

	it('marks a submission that arrives after ROUND_TIMEOUT as late, distinct from timedOut', () => {
		const actor = actorWith(['alice']);
		actor.send({ type: 'START_ROUND' });

		actor.send({ type: 'ROUND_TIMEOUT' });
		actor.send({ type: 'SUBMIT', participantId: 'alice', guess: 'e4' });

		expect(actor.getSnapshot().context.participants.alice).toEqual({
			status: 'late',
			guess: 'e4'
		});
	});

	it('moves to reveal on REVEAL, only once closed', () => {
		const actor = actorWith(['alice']);
		actor.send({ type: 'START_ROUND' });
		actor.send({ type: 'ROUND_TIMEOUT' });

		actor.send({ type: 'REVEAL' });

		expect(actor.getSnapshot().value).toBe('reveal');
	});
});

describe('roundMachine KICK (Host removes a disruptive Participant)', () => {
	it('drops the participant from the roster without changing the round state', () => {
		const actor = actorWith(['alice', 'bob']);
		actor.send({ type: 'START_ROUND' });

		actor.send({ type: 'KICK', participantId: 'bob' });

		expect(actor.getSnapshot().value).toBe('active');
		expect(actor.getSnapshot().context.participants).toEqual({
			alice: { status: 'pending' }
		});
	});

	it('is a no-op if the participant is already gone', () => {
		const actor = actorWith(['alice']);

		actor.send({ type: 'KICK', participantId: 'ghost' });

		expect(actor.getSnapshot().context.participants).toEqual({ alice: { status: 'pending' } });
	});

	it('scrubs a kicked participant out of scores/totals/priorTotals too, once a round has closed', () => {
		const actor = actorWithInput({
			participantIds: ['alice', 'bob'],
			answerKey,
			isScoringRound: true,
			priorTotals: { alice: 5, bob: 2 }
		});
		actor.send({ type: 'START_ROUND' });
		actor.send({ type: 'SUBMIT', participantId: 'alice', guess: 'd4' });
		actor.send({ type: 'ROUND_TIMEOUT' });

		actor.send({ type: 'KICK', participantId: 'bob' });

		const ctx = actor.getSnapshot().context;
		expect(Object.keys(ctx.participants)).toEqual(['alice']);
		expect(Object.keys(ctx.scores)).toEqual(['alice']);
		expect(Object.keys(ctx.totals)).toEqual(['alice']);
		expect(Object.keys(ctx.priorTotals)).toEqual(['alice']);
	});
});

describe('roundMachine scoring', () => {
	it('derives each participant score on close: submitted tier, timeout -3', () => {
		const actor = actorWithInput({
			participantIds: ['alice', 'bob', 'carol'],
			answerKey,
			isScoringRound: true
		});
		actor.send({ type: 'START_ROUND' });
		actor.send({ type: 'SUBMIT', participantId: 'alice', guess: 'd4' }); // exact => +3
		actor.send({ type: 'SUBMIT', participantId: 'bob', guess: 'h3' }); // tier +2 => +2
		// carol never submits => timedOut => -3

		actor.send({ type: 'ROUND_TIMEOUT' });

		expect(actor.getSnapshot().context.scores).toEqual({ alice: 3, bob: 2, carol: -3 });
	});

	it('folds this round into the running total carried in via priorTotals', () => {
		const actor = actorWithInput({
			participantIds: ['alice', 'bob'],
			answerKey,
			isScoringRound: true,
			priorTotals: { alice: 5, bob: 1 }
		});
		actor.send({ type: 'START_ROUND' });
		actor.send({ type: 'SUBMIT', participantId: 'alice', guess: 'd4' }); // +3
		// bob times out => -3

		actor.send({ type: 'ROUND_TIMEOUT' });

		expect(actor.getSnapshot().context.totals).toEqual({ alice: 8, bob: -2 });
	});

	it('pins every score to 0 before the Scoring Start Move', () => {
		const actor = actorWithInput({
			participantIds: ['alice', 'bob'],
			answerKey,
			isScoringRound: false,
			priorTotals: { alice: 4, bob: 4 }
		});
		actor.send({ type: 'START_ROUND' });
		actor.send({ type: 'SUBMIT', participantId: 'alice', guess: 'd4' });

		actor.send({ type: 'ROUND_TIMEOUT' });

		expect(actor.getSnapshot().context.scores).toEqual({ alice: 0, bob: 0 });
		expect(actor.getSnapshot().context.totals).toEqual({ alice: 4, bob: 4 });
	});

	it('leaves scores empty until the round closes', () => {
		const actor = actorWithInput({
			participantIds: ['alice'],
			answerKey,
			isScoringRound: true
		});
		actor.send({ type: 'START_ROUND' });
		actor.send({ type: 'SUBMIT', participantId: 'alice', guess: 'd4' });

		expect(actor.getSnapshot().context.scores).toEqual({});
	});
});
