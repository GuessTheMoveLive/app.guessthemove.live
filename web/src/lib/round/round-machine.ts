import { assign, setup } from 'xstate';
import { scoreParticipantRound, type AnswerKeyStep } from './scoring';

export type ParticipantStatus = 'pending' | 'submitted' | 'timedOut' | 'late';

export type ParticipantState =
	| { status: 'pending' }
	| { status: 'submitted'; guess: string }
	| { status: 'timedOut' }
	| { status: 'late'; guess: string };

export interface RoundContext {
	participants: Record<string, ParticipantState>;
	/** The answer-key step for this Round's Featured Side move, or null if unscored. */
	answerKey: AnswerKeyStep | null;
	/** False before the Featured Game's Scoring Start Move: every score is pinned to 0. */
	isScoringRound: boolean;
	/** Each participant's running Leaderboard total coming into this Round. */
	priorTotals: Record<string, number>;
	/** Each participant's Guess Score for this Round, populated once it closes. */
	scores: Record<string, number>;
	/** Running total through this Round (priorTotals + scores), populated once it closes. */
	totals: Record<string, number>;
}

export type RoundEvent =
	| { type: 'START_ROUND' }
	| { type: 'SUBMIT'; participantId: string; guess: string }
	| { type: 'ROUND_TIMEOUT' }
	| { type: 'REVEAL' };

export interface RoundInput {
	participantIds: string[];
	answerKey?: AnswerKeyStep | null;
	isScoringRound?: boolean;
	priorTotals?: Record<string, number>;
}

function pendingParticipants(participantIds: string[]): Record<string, ParticipantState> {
	return Object.fromEntries(participantIds.map((id) => [id, { status: 'pending' } as const]));
}

/**
 * Derive each participant's Guess Score for this Round and fold it into their
 * running total. Called when the Round closes (ROUND_TIMEOUT) so a later
 * Leaderboard can read scores straight off the broadcast snapshot (#32).
 */
function closeRoundScores(
	participants: Record<string, ParticipantState>,
	context: RoundContext
): { scores: Record<string, number>; totals: Record<string, number> } {
	const scores: Record<string, number> = {};
	const totals: Record<string, number> = {};
	for (const [id, state] of Object.entries(participants)) {
		const score = scoreParticipantRound(state, context.answerKey, context.isScoringRound);
		scores[id] = score;
		totals[id] = (context.priorTotals[id] ?? 0) + score;
	}
	return { scores, totals };
}

export const roundMachine = setup({
	types: {
		context: {} as RoundContext,
		events: {} as RoundEvent,
		input: {} as RoundInput
	}
}).createMachine({
	id: 'round',
	context: ({ input }) => ({
		participants: pendingParticipants(input.participantIds),
		answerKey: input.answerKey ?? null,
		isScoringRound: input.isScoringRound ?? false,
		priorTotals: input.priorTotals ?? {},
		scores: {},
		totals: {}
	}),
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
					actions: assign(({ context }) => {
						const participants = Object.fromEntries(
							Object.entries(context.participants).map(([id, state]) => [
								id,
								state.status === 'pending' ? { status: 'timedOut' as const } : state
							])
						);
						return { participants, ...closeRoundScores(participants, context) };
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
