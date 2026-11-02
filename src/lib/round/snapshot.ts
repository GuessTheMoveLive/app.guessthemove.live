import type { RoundContext } from './round-machine';
import type { GuessHistory } from './guess-history';

// The shape SessionRoom broadcasts to every connected client over the WebSocket.
// Kept server-free (type-only imports) so both the Durable Object and the browser
// clients (Host and Participant screens) can share it without pulling in
// `cloudflare:workers`.

/** The round lifecycle machine's flat state value. */
export type RoundStateValue =
	'lobby' | 'active' | 'closed' | 'reveal' | 'opponentResponse' | 'finished';

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
	/** Whether the Host has toggled Room Statistics open on the current Reveal (#73) — a
	 *  Participant's phone only shows the Guess Group breakdown card once this is true
	 *  (GLOSSARY: Room Statistics). Reset to false whenever a new Round starts, same
	 *  one-way-per-Round shape as showLeaderboard, but independent of it. */
	showRoomStatistics: boolean;
	/** True once the Host has ended the Session early (#57) rather than it reaching
	 *  Final Results naturally — kept for the PGN export tickets (#59/#60) to flag.
	 *  Cleared only by Reset. */
	endedEarly: boolean;
	/** Epoch ms of the Host's first "Start Round" for Round 1 (#52), or null before
	 *  that's happened. Cleared only by Reset. */
	sessionStartTime: number | null;
	/** Epoch ms the Session first reached the terminal `finished` phase (natural end
	 *  or #57's early end), or null before that's happened — the Host PGN export's
	 *  (#60) total-elapsed-time endpoint. Cleared only by Reset. */
	finishedAt: number | null;
	/** Every participant's recorded Guess (SAN) for every Round played so far (#52) —
	 *  the Game Sheet (#58) reconstructs each participant's own per-move Guess/score from
	 *  this, same unredacted-broadcast pattern as `context.participants`/`context.scores`
	 *  (each screen derives its own view locally rather than the server pushing a
	 *  per-client copy). */
	guessHistory: GuessHistory;
}
