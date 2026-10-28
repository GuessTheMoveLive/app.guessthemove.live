import { DurableObject } from 'cloudflare:workers';
import { createActor, type Actor, type Snapshot } from 'xstate';
import { roundMachine, type RoundEvent } from '$lib/round/round-machine';
import type { RoundSnapshot } from '$lib/round/snapshot';
import { quizSteps } from '$lib/round/game-data';

type ClientMessage =
	| { type: 'join'; participantId: string }
	| { type: 'start_round' }
	| { type: 'submit'; guess: string }
	| { type: 'adjust_round'; deltaMs: number }
	| { type: 'reveal' }
	| { type: 'next_round' }
	| { type: 'kick'; participantId: string };

/** WebSocket close code used when the Host removes a Participant, so the client can tell
 *  a kick apart from an ordinary dropped connection and show the right message. */
const KICK_CLOSE_CODE = 4403;

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

export class SessionRoom extends DurableObject {
	private actor: Actor<typeof roundMachine> | undefined;
	private participantIds: string[] = [];
	private roundIndex = 0;

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

		if (!isHost) {
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
		const priorTotals = (await this.ctx.storage.get<Record<string, number>>(STORAGE_KEY_TOTALS)) ?? {};
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
