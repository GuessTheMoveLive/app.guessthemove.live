import { DurableObject } from 'cloudflare:workers';
import { createActor, type Actor, type Snapshot } from 'xstate';
import { roundMachine, type RoundEvent } from '$lib/round/round-machine';
import type { RoundSnapshot } from '$lib/round/snapshot';

type ClientMessage =
	| { type: 'join'; participantId: string }
	| { type: 'start_round' }
	| { type: 'submit'; guess: string }
	| { type: 'adjust_round'; deltaMs: number }
	| { type: 'reveal' };

const STORAGE_KEY_SNAPSHOT = 'round-snapshot';
const STORAGE_KEY_PARTICIPANT_IDS = 'participant-ids';
/** Default visible Round length: 3 minutes (#22), shortenable/extendable by the Host. */
const ROUND_DURATION_MS = 180_000;
/** A Host's control connection never joins as a Participant (#10); it is tagged with this. */
const HOST_TAG = 'host';

export class SessionRoom extends DurableObject {
	private actor: Actor<typeof roundMachine> | undefined;
	private participantIds: string[] = [];

	async fetch(request: Request): Promise<Response> {
		if (request.headers.get('Upgrade') !== 'websocket') {
			return new Response('Expected a WebSocket upgrade', { status: 426 });
		}

		const url = new URL(request.url);
		const isHost = url.searchParams.get('role') === HOST_TAG;
		const participantId = url.searchParams.get('participantId');
		if (!isHost && !participantId) {
			return new Response('Missing participantId', { status: 400 });
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

	private async getActor(): Promise<Actor<typeof roundMachine>> {
		if (this.actor) return this.actor;

		const participantIds =
			(await this.ctx.storage.get<string[]>(STORAGE_KEY_PARTICIPANT_IDS)) ?? this.participantIds;
		const snapshot = await this.ctx.storage.get<Snapshot<unknown>>(STORAGE_KEY_SNAPSHOT);

		this.actor = createActor(roundMachine, {
			input: { participantIds },
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
			deadline: await this.ctx.storage.getAlarm()
		};
		const serialized = JSON.stringify(payload);

		for (const ws of this.ctx.getWebSockets()) {
			ws.send(serialized);
		}
	}
}
