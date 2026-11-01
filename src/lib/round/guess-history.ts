import type { ParticipantState } from './round-machine';

/**
 * Per-round Guess history, keyed by round index, then participant id. A participant
 * missing from a round's record never submitted that Round (timeout) — distinct from
 * an empty-string Guess, which would mean they submitted nothing as their move text.
 */
export type GuessHistory = Record<number, Record<string, string>>;

/**
 * Extract this Round's recorded Guesses (SAN) from the round-machine's participant
 * states — submitted and late Guesses only; pending/timedOut participants are simply
 * omitted (#52), so "no entry" is how a timeout is told apart from a submitted Guess.
 */
export function recordedGuesses(
	participants: Record<string, ParticipantState>
): Record<string, string> {
	const guesses: Record<string, string> = {};
	for (const [id, state] of Object.entries(participants)) {
		if (state.status === 'submitted' || state.status === 'late') {
			guesses[id] = state.guess;
		}
	}
	return guesses;
}
