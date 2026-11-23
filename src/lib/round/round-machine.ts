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
	| { type: 'REVEAL' }
	| { type: 'CONTINUE' }
	| { type: 'BACK' }
	| { type: 'FINISH' }
	| { type: 'KICK'; participantId: string }
	| { type: 'END_SESSION' }
	| { type: 'GUESS_RESET'; participantId: string }
	| { type: 'REOPEN' };

export interface RoundInput {
	participantIds: string[];
	answerKey?: AnswerKeyStep | null;
	isScoringRound?: boolean;
	priorTotals?: Record<string, number>;
}

function pendingParticipants(participantIds: string[]): Record<string, ParticipantState> {
	return Object.fromEntries(participantIds.map((id) => [id, { status: 'pending' } as const]));
}

function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
	const { [key]: _removed, ...rest } = record;
	return rest;
}

/**
 * Totals to land on when the Host ends the Session early (#57): if the current Round
 * already closed (its scores are folded into `totals`), those stand as the final ones
 * — no different from a natural end. Otherwise the current Round never finished, so it
 * contributes nothing and the Session's Final Results fall back to `priorTotals`, the
 * running total through the last Round that actually closed.
 */
function earlyEndTotals(context: RoundContext): Record<string, number> {
	return Object.keys(context.totals).length > 0 ? context.totals : context.priorTotals;
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
	// A root-level handler applies in every child state without changing it (an internal
	// transition, since no `target` is given) — KICK needs to work from lobby through
	// reveal alike, and none of the per-state `on` blocks below declare their own KICK.
	on: {
		KICK: {
			actions: assign(({ context, event }) => ({
				participants: omitKey(context.participants, event.participantId),
				scores: omitKey(context.scores, event.participantId),
				totals: omitKey(context.totals, event.participantId),
				priorTotals: omitKey(context.priorTotals, event.participantId)
			}))
		},
		// The Host's "End Game" (#57): reachable from any state, including lobby/active/
		// closed, not just the two Reveal-adjacent states FINISH already covers — so,
		// unlike FINISH, this is declared here rather than per-state.
		END_SESSION: {
			target: '.finished',
			actions: assign(({ context }) => ({ totals: earlyEndTotals(context) }))
		}
	},
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
				// The Host's Guess Reset (#90): clears one Participant's Guess back to
				// pending without touching anyone else's state or the Round's shared alarm.
				// Declared only here, not the root-level `on` block KICK/END_SESSION use,
				// since it's deliberately inert once the Round has closed. A participant not
				// in the roster (already kicked, never joined) is a no-op, same posture as KICK.
				GUESS_RESET: {
					actions: assign(({ context, event }) => {
						if (!(event.participantId in context.participants)) return {};
						return {
							participants: {
								...context.participants,
								[event.participantId]: { status: 'pending' }
							}
						};
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
				REVEAL: 'reveal',
				// The Host's +30s on an already-closed Round (#92): reopens it rather than
				// extending a clock that's already run out, giving anyone who missed the
				// deadline (`timedOut`, no Guess at all) a fresh chance to submit on time
				// instead of only ever landing `late`. Clears this Round's `scores`/`totals`
				// back to empty - the same as before it ever closed - rather than leaving the
				// Scoreboard showing stale numbers from the close that's being undone; they're
				// repopulated correctly once this reopened Round closes again (ROUND_TIMEOUT's
				// closeRoundScores reads whatever the participant statuses are at that later
				// moment).
				REOPEN: {
					target: 'active',
					actions: assign(({ context }) => ({
						participants: Object.fromEntries(
							Object.entries(context.participants).map(([id, state]) =>
								state.status === 'timedOut' ? [id, { status: 'pending' as const }] : [id, state]
							)
						),
						scores: {},
						totals: {}
					}))
				}
			}
		},
		// Reveal is no longer terminal (#48): the Host's "Continue" moves everyone on to the
		// Opponent Response screen, and "Back" from there returns here. "Next round" is owned
		// one level up in SessionRoom (it builds the next Round's actor), not by this machine.
		reveal: {
			on: { CONTINUE: 'opponentResponse' }
		},
		opponentResponse: {
			on: { BACK: 'reveal', FINISH: 'finished' }
		},
		// The terminal phase (#50): the Host's "Finish" on the final Round's Opponent
		// Response lands every client here for good — no event moves a Session on from
		// it, so a Session that's Finished stays Finished until Reset (#38).
		finished: {}
	}
});
