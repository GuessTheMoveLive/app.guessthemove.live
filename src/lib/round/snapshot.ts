import type { RoundContext } from './round-machine';

// The shape SessionRoom broadcasts to every connected client over the WebSocket.
// Kept server-free (type-only imports) so both the Durable Object and the browser
// clients (Host and Participant screens) can share it without pulling in
// `cloudflare:workers`.

/** The round lifecycle machine's flat state value. */
export type RoundStateValue =
	| 'lobby'
	| 'active'
	| 'closed'
	| 'reveal'
	| 'opponentResponse'
	| 'finished';

export interface RoundSnapshot {
	value: RoundStateValue;
	context: RoundContext;
	/** Epoch ms when the current Round's clock runs out, or null when no Round is running. */
	deadline: number | null;
	/** 0-based index of the current Round into the Featured Game's quiz steps. */
	roundIndex: number;
	/** Total number of Rounds in the Featured Game, so the UI can show "Guess 4 of 35". */
	totalRounds: number;
	/** Whether the Host has toggled the Leaderboard open on the current Reveal — a
	 *  Participant's phone only shows the Leaderboard once this is true (GLOSSARY:
	 *  Leaderboard). Reset to false whenever a new Round starts. */
	showLeaderboard: boolean;
}
