import { DurableObject } from 'cloudflare:workers';
import { createActor, type Actor, type Snapshot } from 'xstate';
import { roundMachine, type RoundEvent } from '#lib/round/round-machine.js';
import { computeGuessGroupBreakdown, redactBreakdownFor } from '#lib/round/guess-groups.js';
import type { RoundSnapshot } from '#lib/round/snapshot.js';
import { quizSteps } from '#lib/round/game-data.js';
import { generateHostToken } from '#lib/server/room-code.js';

type ClientMessage =
	| { type: 'join'; participantId: string }
	| { type: 'start_round' }
	| { type: 'submit'; guess: string }
	| { type: 'adjust_round'; deltaMs: number }
	| { type: 'reveal' }
	| { type: 'next_round' }
	| { type: 'share_guess_groups' }
	| { type: 'kick'; participantId: string }
	| { type: 'reset' }
	| { type: 'delete_session' };

/** WebSocket close code used when the Host removes a Participant, so the client can tell
 *  a kick apart from an ordinary dropped connection and show the right message. */
const KICK_CLOSE_CODE = 4403;
/** WebSocket close code used when the Host deletes the whole Session (#38), distinct from
 *  a kick so every client (Host included) can show "This session has ended" rather than
 *  just retrying a dead connection. */
const DELETE_CLOSE_CODE = 4410;

const STORAGE_KEY_SNAPSHOT = 'round-snapshot';
const STORAGE_KEY_PARTICIPANT_IDS = 'participant-ids';
/** Participant ids the Host has kicked from this Session — kept so a kick sticks even if
 *  the same device tries to rejoin under the identical name (#kick). */
const STORAGE_KEY_KICKED_IDS = 'kicked-participant-ids';
/** 0-based index into quizSteps() for the Round currently loaded into the actor. */
const STORAGE_KEY_ROUND_INDEX = 'round-index';
/** Each participant's cumulative score as of the end of the last closed Round — carried
 *  forward as `priorTotals` into the next Round's actor, since a fresh actor per Round
 *  (see advanceToRound) has no memory of earlier ones. */
const STORAGE_KEY_TOTALS = 'totals';
/** Default visible Round length: 3 minutes (#22), shortenable/extendable by the Host. */
const ROUND_DURATION_MS = 180_000;
/** A Host's control connection never joins as a Participant (#10); it is tagged with this. */
const HOST_TAG = 'host';
/** The secret credential proving control of a Session (#37), set once at creation. */
const STORAGE_KEY_HOST_TOKEN = 'host-token';

export class SessionRoom extends DurableObject {
	private actor: Actor<typeof roundMachine> | undefined;
	private participantIds: string[] = [];
	private roundIndex = 0;

	/**
	 * Mint this Session into existence: generate and store its Host Token, the secret
	 * that `fetch` below requires on every `role=host` connection. Called over RPC by the
	 * Create-Session server action (#37), before any client ever connects. Idempotent in
	 * the sense that a Session can only ever be created once - a second call (meaning the
	 * caller's generated Room Code collided with an existing Session) returns null so the
	 * caller can retry with a fresh code, rather than silently handing out a second token
	 * for a Session someone else already owns.
	 */
	async createSession(): Promise<string | null> {
		const existing = await this.ctx.storage.get<string>(STORAGE_KEY_HOST_TOKEN);
		if (existing) return null;
		const token = generateHostToken();
		await this.ctx.storage.put(STORAGE_KEY_HOST_TOKEN, token);
		return token;
	}

	async fetch(request: Request): Promise<Response> {
		if (request.headers.get('Upgrade') !== 'websocket') {
			return new Response('Expected a WebSocket upgrade', { status: 426 });
		}

		const url = new URL(request.url);
		const isHost = url.searchParams.get('role') === HOST_TAG;
		// Trimmed so a stray leading/trailing space from a mobile keyboard on a reconnect
		// can't silently mint a second "ghost" identity with its own score starting at 0.
		const participantId = url.searchParams.get('participantId')?.trim();
		if (!isHost && !participantId) {
			return new Response('Missing participantId', { status: 400 });
		}

		const hostToken = await this.ctx.storage.get<string>(STORAGE_KEY_HOST_TOKEN);
		if (!hostToken) {
			// Nobody has ever called createSession for this Room Code - either it was
			// mistyped, or the Session was Deleted (#38), which frees the code for reuse.
			return new Response('Session not found', { status: 404 });
		}

		if (isHost) {
			// The Room Code alone never grants Host control (#37) - only a connection whose
			// token matches the one generated at creation, embedded in the Host's own URL.
			if (url.searchParams.get('token') !== hostToken) {
				return new Response('Invalid or missing Host token', { status: 401 });
			}
		} else {
			const kicked = (await this.ctx.storage.get<string[]>(STORAGE_KEY_KICKED_IDS)) ?? [];
			if (kicked.includes(participantId!)) {
				return new Response('Removed from this Session by the Host', { status: 403 });
			}
		}

		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);

		if (isHost) {
			// The Host Display is control-only — accept the socket for broadcasts and
			// control events, but never add it to the Participant roster (#10).
			this.ctx.acceptWebSocket(server, [HOST_TAG]);
		} else {
			this.ctx.acceptWebSocket(server, [participantId!]);
			await this.registerParticipant(participantId!);
		}
		await this.broadcastSnapshot();

		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
		if (typeof raw !== 'string') return;

		const message = JSON.parse(raw) as ClientMessage;
		const actor = await this.getActor();

		switch (message.type) {
			case 'join':
				return;
			case 'start_round': {
				actor.send({ type: 'START_ROUND' });
				await this.scheduleRoundTimeout();
				break;
			}
			case 'submit': {
				const [participantId] = this.ctx.getTags(ws);
				if (!participantId || participantId === HOST_TAG) return;
				const event: RoundEvent = { type: 'SUBMIT', participantId, guess: message.guess };
				actor.send(event);
				break;
			}
			case 'adjust_round': {
				// Host shortens/extends the running clock (#22). Re-schedule the authoritative
				// timeout alarm, never letting it land in the past.
				const current = await this.ctx.storage.getAlarm();
				if (current != null) {
					await this.ctx.storage.setAlarm(Math.max(Date.now() + 1_000, current + message.deltaMs));
				}
				break;
			}
			case 'reveal': {
				// Reveal is always Host-triggered (#22). If the Host reveals before the clock
				// runs out, close the Round first so scores are finalised, then cancel the
				// pending timeout so it can't re-fire on the already-closed Round.
				if (actor.getSnapshot().value === 'active') {
					actor.send({ type: 'ROUND_TIMEOUT' });
				}
				actor.send({ type: 'REVEAL' });
				await this.ctx.storage.deleteAlarm();
				break;
			}
			case 'next_round': {
				// Only advance out of a fully revealed Round (#22's Host-driven pacing) — a
				// stray repeat click from the Host's own network lag is a harmless no-op.
				if (actor.getSnapshot().value !== 'reveal') return;
				const nextIndex = this.roundIndex + 1;
				if (nextIndex >= quizSteps().length) return; // Featured Game has no more Rounds.

				await this.ctx.storage.put(STORAGE_KEY_TOTALS, actor.getSnapshot().context.totals);
				await this.ctx.storage.put(STORAGE_KEY_ROUND_INDEX, nextIndex);
				await this.ctx.storage.delete(STORAGE_KEY_SNAPSHOT);
				this.actor = undefined;

				const next = await this.getActor();
				next.send({ type: 'START_ROUND' });
				await this.scheduleRoundTimeout();
				break;
			}
			case 'share_guess_groups': {
				// Share Guess Groups (#42): the Host's optional action at Reveal, pushing the
				// Guess Group breakdown out to every Participant's phone — the slot the retired
				// "Give Feedback" used to occupy. The chart is broadcast-shaped (the same <=7
				// buckets for everyone), but names are per-Participant: a recipient sees the
				// members of their OWN Guess Group only, every other group as a bare count
				// (GLOSSARY: Share Guess Groups). So the full breakdown is redacted per recipient
				// and sent as a targeted message to their own socket(s) — never a single
				// broadcast — so no socket ever receives another group's names. Host-only, same
				// as kick/reset. (The Host Display already shows the full breakdown, every name,
				// off the broadcast snapshot; it needs nothing from here.)
				if (!this.isHostSocket(ws)) return;

				const { participants, scores } = actor.getSnapshot().context;
				const breakdown = computeGuessGroupBreakdown(participants, scores);
				for (const participantId of Object.keys(participants)) {
					const redacted = redactBreakdownFor(breakdown, participantId);
					const serialized = JSON.stringify({ type: 'guess_groups', breakdown: redacted });
					for (const socket of this.ctx.getWebSockets(participantId)) {
						try {
							socket.send(serialized);
						} catch {
							// A socket that dropped between getWebSockets() and send() — skip it.
						}
					}
				}
				// Targeted-only: nothing in the shared round state changed, so there is no
				// snapshot to persist or broadcast.
				return;
			}
			case 'kick': {
				// Only the Host may kick (#10: the Host's connection is the only one tagged
				// HOST_TAG — a Participant's own socket can never send this to any effect
				// beyond their own tag, but we check explicitly rather than rely on that).
				const [tag] = this.ctx.getTags(ws);
				if (tag !== HOST_TAG) return;

				actor.send({ type: 'KICK', participantId: message.participantId });

				// Read storage directly rather than `this.participantIds`: that field is only
				// ever written by registerParticipant, so after a hibernation wake with no
				// fresh joins this DO instance it would still be its default `[]` and
				// overwrite the real roster with an empty list.
				const storedIds = (await this.ctx.storage.get<string[]>(STORAGE_KEY_PARTICIPANT_IDS)) ?? [];
				this.participantIds = storedIds.filter((id) => id !== message.participantId);
				await this.ctx.storage.put(STORAGE_KEY_PARTICIPANT_IDS, this.participantIds);

				const kicked = (await this.ctx.storage.get<string[]>(STORAGE_KEY_KICKED_IDS)) ?? [];
				if (!kicked.includes(message.participantId)) {
					await this.ctx.storage.put(STORAGE_KEY_KICKED_IDS, [...kicked, message.participantId]);
				}

				for (const socket of this.ctx.getWebSockets(message.participantId)) {
					socket.close(KICK_CLOSE_CODE, 'Removed by the Host');
				}
				break;
			}
			case 'reset': {
				// Same Room Code, same Featured Game - just wipes roster/scores/kicked-list/
				// round-index back to the Lobby (#38). Available from any phase, including
				// aborting an active Round.
				if (!this.isHostSocket(ws)) return;

				await this.ctx.storage.delete(STORAGE_KEY_SNAPSHOT);
				await this.ctx.storage.delete(STORAGE_KEY_PARTICIPANT_IDS);
				await this.ctx.storage.delete(STORAGE_KEY_KICKED_IDS);
				await this.ctx.storage.delete(STORAGE_KEY_ROUND_INDEX);
				await this.ctx.storage.delete(STORAGE_KEY_TOTALS);
				await this.ctx.storage.deleteAlarm();
				this.actor = undefined;
				this.participantIds = [];
				this.roundIndex = 0;

				// Still-open Participant sockets keep their tag across the reset; re-register
				// them so they reappear in the fresh roster immediately rather than only once
				// they next submit a Guess.
				for (const socket of this.ctx.getWebSockets()) {
					const [tag] = this.ctx.getTags(socket);
					if (tag && tag !== HOST_TAG) await this.registerParticipant(tag);
				}
				break;
			}
			case 'delete_session': {
				// Permanently destroys the Session and frees its Room Code for reuse (#38).
				// Forcibly disconnects every socket, Host included, with a distinct close
				// code, then wipes storage - return early so the persistSnapshot/
				// broadcastSnapshot below doesn't recreate state for a Session that no
				// longer exists.
				if (!this.isHostSocket(ws)) return;

				for (const socket of this.ctx.getWebSockets()) {
					socket.close(DELETE_CLOSE_CODE, 'Session deleted by the Host');
				}
				await this.ctx.storage.deleteAll();
				this.actor = undefined;
				this.participantIds = [];
				this.roundIndex = 0;
				return;
			}
		}

		await this.persistSnapshot();
		await this.broadcastSnapshot();
	}

	async webSocketClose(): Promise<void> {
		// Hibernatable WebSockets are removed from ctx.getWebSockets() automatically;
		// participant state in the round machine is untouched so a reconnect resumes cleanly.
	}

	async alarm(): Promise<void> {
		const actor = await this.getActor();
		actor.send({ type: 'ROUND_TIMEOUT' });
		await this.persistSnapshot();
		await this.broadcastSnapshot();
	}

	private isHostSocket(ws: WebSocket): boolean {
		const [tag] = this.ctx.getTags(ws);
		return tag === HOST_TAG;
	}

	private async registerParticipant(participantId: string): Promise<void> {
		if (this.participantIds.includes(participantId)) return;

		this.participantIds = [
			...((await this.ctx.storage.get<string[]>(STORAGE_KEY_PARTICIPANT_IDS)) ?? []),
			participantId
		];
		await this.ctx.storage.put(STORAGE_KEY_PARTICIPANT_IDS, this.participantIds);
		this.actor = undefined;
	}

	/**
	 * Build (or resume) the actor for the Round at `this.roundIndex`. Every Round gets a
	 * fresh actor rather than one long-lived machine instance that advances through
	 * plies via events: the round-machine's context (answerKey, isScoringRound,
	 * priorTotals) is set once at creation from `input`, so moving to a new Round means
	 * constructing a new actor with that Round's answerKey and the running totals carried
	 * forward from the last one (see `next_round` above and `priorTotals` below).
	 */
	private async getActor(): Promise<Actor<typeof roundMachine>> {
		if (this.actor) return this.actor;

		const participantIds =
			(await this.ctx.storage.get<string[]>(STORAGE_KEY_PARTICIPANT_IDS)) ?? this.participantIds;
		this.roundIndex =
			(await this.ctx.storage.get<number>(STORAGE_KEY_ROUND_INDEX)) ?? this.roundIndex;
		const priorTotals =
			(await this.ctx.storage.get<Record<string, number>>(STORAGE_KEY_TOTALS)) ?? {};
		const snapshot = await this.ctx.storage.get<Snapshot<unknown>>(STORAGE_KEY_SNAPSHOT);
		const answerKey = quizSteps()[this.roundIndex] ?? null;

		this.actor = createActor(roundMachine, {
			input: { participantIds, answerKey, isScoringRound: true, priorTotals },
			...(snapshot ? { snapshot } : {})
		});
		this.actor.start();
		return this.actor;
	}

	private async persistSnapshot(): Promise<void> {
		const actor = await this.getActor();
		await this.ctx.storage.put(STORAGE_KEY_SNAPSHOT, actor.getPersistedSnapshot());
	}

	private async scheduleRoundTimeout(): Promise<void> {
		await this.ctx.storage.setAlarm(Date.now() + ROUND_DURATION_MS);
	}

	private async broadcastSnapshot(): Promise<void> {
		const actor = await this.getActor();
		const snapshot = actor.getSnapshot();
		const payload: RoundSnapshot = {
			value: snapshot.value as RoundSnapshot['value'],
			context: snapshot.context,
			deadline: await this.ctx.storage.getAlarm(),
			roundIndex: this.roundIndex,
			totalRounds: quizSteps().length
		};
		const serialized = JSON.stringify(payload);

		for (const ws of this.ctx.getWebSockets()) {
			try {
				ws.send(serialized);
			} catch {
				// A socket that just closed (e.g. the one `kick` closed moments earlier in this
				// same message handler) can still be returned by getWebSockets() for this tick;
				// sending to it throws. It's about to be dropped on its own — skip it.
			}
		}
	}
}
