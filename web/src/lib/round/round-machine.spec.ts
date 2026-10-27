import { describe, it, expect } from 'vitest';
import { createActor } from 'xstate';
import { roundMachine } from './round-machine';

function actorWith(participantIds: string[]) {
	const actor = createActor(roundMachine, {
		input: { participantIds }
	});
	actor.start();
	return actor;
}

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
