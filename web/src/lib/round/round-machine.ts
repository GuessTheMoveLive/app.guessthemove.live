import { assign, setup } from 'xstate';

export type ParticipantStatus = 'pending' | 'submitted' | 'timedOut' | 'late';

export type ParticipantState =
	| { status: 'pending' }
	| { status: 'submitted'; guess: string }
	| { status: 'timedOut' }
	| { status: 'late'; guess: string };

export interface RoundContext {
	participants: Record<string, ParticipantState>;
}

export type RoundEvent =
	| { type: 'START_ROUND' }
	| { type: 'SUBMIT'; participantId: string; guess: string }
	| { type: 'ROUND_TIMEOUT' }
	| { type: 'REVEAL' };

export interface RoundInput {
	participantIds: string[];
}

function pendingParticipants(participantIds: string[]): Record<string, ParticipantState> {
	return Object.fromEntries(participantIds.map((id) => [id, { status: 'pending' } as const]));
}

export const roundMachine = setup({
	types: {
		context: {} as RoundContext,
		events: {} as RoundEvent,
		input: {} as RoundInput
	}
}).createMachine({
	id: 'round',
	context: ({ input }) => ({ participants: pendingParticipants(input.participantIds) }),
	initial: 'lobby',
	states: {
		lobby: {
			on: { START_ROUND: 'active' }
		},
		active: {
			on: {
				SUBMIT: {
					actions: assign({
						participants: ({ context, event }) => ({
							...context.participants,
							[event.participantId]: { status: 'submitted', guess: event.guess }
						})
					})
				},
				ROUND_TIMEOUT: {
					target: 'closed',
					actions: assign({
						participants: ({ context }) =>
							Object.fromEntries(
								Object.entries(context.participants).map(([id, state]) => [
									id,
									state.status === 'pending' ? { status: 'timedOut' as const } : state
								])
							)
					})
				}
			}
		},
		closed: {
			on: {
				SUBMIT: {
					actions: assign({
						participants: ({ context, event }) => ({
							...context.participants,
							[event.participantId]: { status: 'late', guess: event.guess }
						})
					})
				},
				REVEAL: 'reveal'
			}
		},
		reveal: {}
	}
});
