import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionRoom } from './session-room.js';

// SessionRoom is a Cloudflare Durable Object: its base class and the WebSocket
// upgrade machinery it uses (WebSocketPair, hibernatable tags, a 101 Response
// carrying a `webSocket`) only exist inside the Workers runtime (`cloudflare:workers`)
// - "true external" dependencies per the deepening playbook, so these tests fake
// them rather than mock SessionRoom's own logic apart. The fakes are deliberately
// minimal: just enough of the real API surface for SessionRoom to drive, so tests
// exercise the DO through its real interface (fetch / webSocketMessage / alarm)
// and assert on its real observable output (the broadcast RoundSnapshot, close
// codes, stored roster) rather than on internals.

class FakeWebSocket {
	sent: string[] = [];
	closed: { code: number; reason: string } | null = null;

	send(data: string): void {
		this.sent.push(data);
	}

	close(code = 1000, reason = ''): void {
		this.closed = { code, reason };
	}

	lastSnapshot(): unknown {
		return this.sent.length ? JSON.parse(this.sent[this.sent.length - 1]) : null;
	}
}

class FakeStorage {
	#values = new Map<string, unknown>();
	#alarm: number | null = null;

	async get<T>(key: string): Promise<T | undefined> {
		return this.#values.get(key) as T | undefined;
	}

	async put(key: string, value: unknown): Promise<void> {
		this.#values.set(key, value);
	}

	async delete(key: string): Promise<void> {
		this.#values.delete(key);
	}

	async getAlarm(): Promise<number | null> {
		return this.#alarm;
	}

	async setAlarm(time: number): Promise<void> {
		this.#alarm = time;
	}

	async deleteAlarm(): Promise<void> {
		this.#alarm = null;
	}
}

class FakeDurableObjectState {
	storage = new FakeStorage();
	#tags = new Map<FakeWebSocket, string[]>();

	acceptWebSocket(ws: FakeWebSocket, tags: string[] = []): void {
		this.#tags.set(ws, tags);
	}

	getTags(ws: FakeWebSocket): string[] {
		return this.#tags.get(ws) ?? [];
	}

	getWebSockets(tag?: string): FakeWebSocket[] {
		return [...this.#tags.entries()]
			.filter(([ws, tags]) => !ws.closed && (tag === undefined || tags.includes(tag)))
			.map(([ws]) => ws);
	}
}

function upgradeRequest(code: string, query: string): Request {
	return new Request(`https://example.com/api/session/${code}?${query}`, {
		headers: { Upgrade: 'websocket' }
	});
}

describe('SessionRoom', () => {
	let OriginalResponse: typeof Response;

	beforeEach(() => {
		// Node's Response rejects status 101 (an informational/upgrade code); the
		// real Workers runtime accepts it specially to carry the client-side socket.
		OriginalResponse = globalThis.Response;
		class FakeUpgradeResponse {
			status: number;
			webSocket: unknown;
			constructor(_body: unknown, init: { status: number; webSocket?: unknown }) {
				this.status = init.status;
				this.webSocket = init.webSocket;
			}
		}
		// @ts-expect-error - test-only stand-in for the Workers-runtime Response(...,{webSocket}) form
		globalThis.Response = function (body: unknown, init: ResponseInit & { webSocket?: unknown }) {
			if (init?.status === 101) return new FakeUpgradeResponse(body, init as never);
			return new OriginalResponse(body as BodyInit | null, init);
		};
		// @ts-expect-error - WebSocketPair is a Workers-runtime global, not available under Node
		globalThis.WebSocketPair = function () {
			return { 0: new FakeWebSocket(), 1: new FakeWebSocket() };
		};
	});

	afterEach(() => {
		globalThis.Response = OriginalResponse;
		vi.useRealTimers();
	});

	function openRoom() {
		const ctx = new FakeDurableObjectState();
		// @ts-expect-error - fakes stand in for the real DurableObjectState/Env
		const room = new SessionRoom(ctx, {});
		return { room, ctx };
	}

	async function joinHost(room: SessionRoom, ctx: FakeDurableObjectState) {
		const response = await room.fetch(upgradeRequest('ABC', 'role=host'));
		const accepted = ctx.getWebSockets('host');
		return { response, ws: accepted[accepted.length - 1] };
	}

	async function join(room: SessionRoom, ctx: FakeDurableObjectState, participantId: string) {
		const response = await room.fetch(upgradeRequest('ABC', `participantId=${participantId}`));
		const accepted = ctx.getWebSockets(participantId);
		return { response, ws: accepted[accepted.length - 1] };
	}

	it('rejects a non-websocket request', async () => {
		const { room } = openRoom();
		const response = await room.fetch(new Request('https://example.com/api/session/ABC'));
		expect(response.status).toBe(426);
	});

	it('rejects a participant join with no id', async () => {
		const { room } = openRoom();
		const response = await room.fetch(
			new Request('https://example.com/api/session/ABC', { headers: { Upgrade: 'websocket' } })
		);
		expect(response.status).toBe(400);
	});

	it('registers a joining participant and broadcasts a lobby snapshot', async () => {
		const { room, ctx } = openRoom();
		const { response, ws } = await join(room, ctx, 'alice');

		expect(response.status).toBe(101);
		const snapshot = ws.lastSnapshot() as { value: string; context: { participants: object } };
		expect(snapshot.value).toBe('lobby');
		expect(snapshot.context.participants).toEqual({ alice: { status: 'pending' } });
	});

	it('does not add the Host connection to the participant roster', async () => {
		const { room, ctx } = openRoom();
		await room.fetch(upgradeRequest('ABC', 'role=host'));
		const { ws } = await join(room, ctx, 'alice');

		const snapshot = ws.lastSnapshot() as { context: { participants: Record<string, unknown> } };
		expect(Object.keys(snapshot.context.participants)).toEqual(['alice']);
	});

	it('scores a submitted guess once the Host reveals', async () => {
		const { room, ctx } = openRoom();
		const { ws } = await join(room, ctx, 'alice');

		await room.webSocketMessage(ws as never, JSON.stringify({ type: 'start_round' }));
		await room.webSocketMessage(
			ws as never,
			JSON.stringify({ type: 'submit', guess: 'definitely-not-the-answer' })
		);
		await room.webSocketMessage(ws as never, JSON.stringify({ type: 'reveal' }));

		const snapshot = ws.lastSnapshot() as { value: string; context: { scores: Record<string, number> } };
		expect(snapshot.value).toBe('reveal');
		expect(snapshot.context.scores.alice).toBe(0);
	});

	it('kicks a participant: closes their socket and blocks a rejoin under the same id', async () => {
		const { room, ctx } = openRoom();
		const { ws: hostWs } = await joinHost(room, ctx);
		const { ws: aliceWs } = await join(room, ctx, 'alice');

		await room.webSocketMessage(hostWs as never, JSON.stringify({ type: 'kick', participantId: 'alice' }));

		expect(aliceWs.closed?.code).toBe(4403);

		const rejoin = await room.fetch(upgradeRequest('ABC', 'participantId=alice'));
		expect(rejoin.status).toBe(403);
	});

	it("ignores a kick attempt from a non-Host connection", async () => {
		const { room, ctx } = openRoom();
		const { ws: aliceWs } = await join(room, ctx, 'alice');
		const { ws: bobWs } = await join(room, ctx, 'bob');

		await room.webSocketMessage(bobWs as never, JSON.stringify({ type: 'kick', participantId: 'alice' }));

		expect(aliceWs.closed).toBeNull();
		const snapshot = bobWs.lastSnapshot() as { context: { participants: Record<string, unknown> } };
		expect(Object.keys(snapshot.context.participants)).toEqual(['alice', 'bob']);
	});

	it('refuses to advance past the last Round', async () => {
		const { room, ctx } = openRoom();
		const { ws } = await join(room, ctx, 'alice');

		// next_round is a no-op outside the 'reveal' state - confirm the guard
		// holds in the state every fresh Session actually starts in.
		await room.webSocketMessage(ws as never, JSON.stringify({ type: 'next_round' }));

		const snapshot = ws.lastSnapshot() as { value: string; roundIndex: number };
		expect(snapshot.value).toBe('lobby');
		expect(snapshot.roundIndex).toBe(0);
	});

	it('closes the Round on alarm and penalizes anyone still pending', async () => {
		const { room, ctx } = openRoom();
		const { ws } = await join(room, ctx, 'alice');

		await room.webSocketMessage(ws as never, JSON.stringify({ type: 'start_round' }));
		await room.alarm();

		const snapshot = ws.lastSnapshot() as {
			value: string;
			context: { participants: Record<string, { status: string }>; scores: Record<string, number> };
		};
		expect(snapshot.value).toBe('closed');
		expect(snapshot.context.participants.alice.status).toBe('timedOut');
		expect(snapshot.context.scores.alice).toBe(-3);
	});
});
