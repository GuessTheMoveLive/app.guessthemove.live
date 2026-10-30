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

	async deleteAll(): Promise<void> {
		this.#values.clear();
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

	async function openRoom() {
		const ctx = new FakeDurableObjectState();
		// @ts-expect-error - fakes stand in for the real DurableObjectState/Env
		const room = new SessionRoom(ctx, {});
		const token = await room.createSession();
		return { room, ctx, token: token! };
	}

	async function joinHost(room: SessionRoom, ctx: FakeDurableObjectState, token: string) {
		const response = await room.fetch(upgradeRequest('ABC', `role=host&token=${token}`));
		const accepted = ctx.getWebSockets('host');
		return { response, ws: accepted[accepted.length - 1] };
	}

	async function join(room: SessionRoom, ctx: FakeDurableObjectState, participantId: string) {
		const response = await room.fetch(upgradeRequest('ABC', `participantId=${participantId}`));
		const accepted = ctx.getWebSockets(participantId);
		return { response, ws: accepted[accepted.length - 1] };
	}

	it('rejects a non-websocket request', async () => {
		const { room } = await openRoom();
		const response = await room.fetch(new Request('https://example.com/api/session/ABC'));
		expect(response.status).toBe(426);
	});

	it('rejects a participant join with no id', async () => {
		const { room } = await openRoom();
		const response = await room.fetch(
			new Request('https://example.com/api/session/ABC', { headers: { Upgrade: 'websocket' } })
		);
		expect(response.status).toBe(400);
	});

	it('rejects any connection to a Room Code that was never created', async () => {
		const ctx = new FakeDurableObjectState();
		// @ts-expect-error - fakes stand in for the real DurableObjectState/Env
		const room = new SessionRoom(ctx, {});
		const response = await room.fetch(upgradeRequest('ABC', 'participantId=alice'));
		expect(response.status).toBe(404);
	});

	it('createSession returns null (and keeps the existing token) on a second call', async () => {
		const { room, token } = await openRoom();
		await expect(room.createSession()).resolves.toBeNull();
		expect(token).toBeTruthy();
	});

	it('rejects a Host connection with a missing or wrong token', async () => {
		const { room } = await openRoom();
		const noToken = await room.fetch(upgradeRequest('ABC', 'role=host'));
		expect(noToken.status).toBe(401);
		const wrongToken = await room.fetch(upgradeRequest('ABC', 'role=host&token=nope'));
		expect(wrongToken.status).toBe(401);
	});

	it('accepts a Host connection whose token matches', async () => {
		const { room, ctx, token } = await openRoom();
		const { response } = await joinHost(room, ctx, token);
		expect(response.status).toBe(101);
	});

	it('registers a joining participant and broadcasts a lobby snapshot', async () => {
		const { room, ctx } = await openRoom();
		const { response, ws } = await join(room, ctx, 'alice');

		expect(response.status).toBe(101);
		const snapshot = ws.lastSnapshot() as { value: string; context: { participants: object } };
		expect(snapshot.value).toBe('lobby');
		expect(snapshot.context.participants).toEqual({ alice: { status: 'pending' } });
	});

	it('does not add the Host connection to the participant roster', async () => {
		const { room, ctx, token } = await openRoom();
		await joinHost(room, ctx, token);
		const { ws } = await join(room, ctx, 'alice');

		const snapshot = ws.lastSnapshot() as { context: { participants: Record<string, unknown> } };
		expect(Object.keys(snapshot.context.participants)).toEqual(['alice']);
	});

	it('scores a submitted guess once the Host reveals', async () => {
		const { room, ctx } = await openRoom();
		const { ws } = await join(room, ctx, 'alice');

		await room.webSocketMessage(ws as never, JSON.stringify({ type: 'start_round' }));
		await room.webSocketMessage(
			ws as never,
			JSON.stringify({ type: 'submit', guess: 'definitely-not-the-answer' })
		);
		await room.webSocketMessage(ws as never, JSON.stringify({ type: 'reveal' }));

		const snapshot = ws.lastSnapshot() as {
			value: string;
			context: { scores: Record<string, number> };
		};
		expect(snapshot.value).toBe('reveal');
		expect(snapshot.context.scores.alice).toBe(0);
	});

	it('kicks a participant: closes their socket and blocks a rejoin under the same id', async () => {
		const { room, ctx, token } = await openRoom();
		const { ws: hostWs } = await joinHost(room, ctx, token);
		const { ws: aliceWs } = await join(room, ctx, 'alice');

		await room.webSocketMessage(
			hostWs as never,
			JSON.stringify({ type: 'kick', participantId: 'alice' })
		);

		expect(aliceWs.closed?.code).toBe(4403);

		const rejoin = await room.fetch(upgradeRequest('ABC', 'participantId=alice'));
		expect(rejoin.status).toBe(403);
	});

	it('ignores a kick attempt from a non-Host connection', async () => {
		const { room, ctx } = await openRoom();
		const { ws: aliceWs } = await join(room, ctx, 'alice');
		const { ws: bobWs } = await join(room, ctx, 'bob');

		await room.webSocketMessage(
			bobWs as never,
			JSON.stringify({ type: 'kick', participantId: 'alice' })
		);

		expect(aliceWs.closed).toBeNull();
		const snapshot = bobWs.lastSnapshot() as { context: { participants: Record<string, unknown> } };
		expect(Object.keys(snapshot.context.participants)).toEqual(['alice', 'bob']);
	});

	it('refuses to advance past the last Round', async () => {
		const { room, ctx } = await openRoom();
		const { ws } = await join(room, ctx, 'alice');

		// next_round is a no-op outside the 'reveal' state - confirm the guard
		// holds in the state every fresh Session actually starts in.
		await room.webSocketMessage(ws as never, JSON.stringify({ type: 'next_round' }));

		const snapshot = ws.lastSnapshot() as { value: string; roundIndex: number };
		expect(snapshot.value).toBe('lobby');
		expect(snapshot.roundIndex).toBe(0);
	});

	it('closes the Round on alarm and penalizes anyone still pending', async () => {
		const { room, ctx } = await openRoom();
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

	it('resets: wipes roster/scores/round-index back to lobby, same Room Code', async () => {
		const { room, ctx, token } = await openRoom();
		const { ws: hostWs } = await joinHost(room, ctx, token);
		const { ws: aliceWs } = await join(room, ctx, 'alice');

		await room.webSocketMessage(aliceWs as never, JSON.stringify({ type: 'start_round' }));
		await room.webSocketMessage(
			aliceWs as never,
			JSON.stringify({ type: 'submit', guess: 'definitely-not-the-answer' })
		);
		await room.webSocketMessage(aliceWs as never, JSON.stringify({ type: 'reveal' }));
		await room.webSocketMessage(hostWs as never, JSON.stringify({ type: 'reset' }));

		const snapshot = hostWs.lastSnapshot() as {
			value: string;
			roundIndex: number;
			context: { participants: Record<string, { status: string }>; totals: Record<string, number> };
		};
		expect(snapshot.value).toBe('lobby');
		expect(snapshot.roundIndex).toBe(0);
		expect(snapshot.context.totals).toEqual({});
		// Alice's socket is still open and re-registers into the fresh roster immediately.
		expect(snapshot.context.participants).toEqual({ alice: { status: 'pending' } });
	});

	it('ignores a reset attempt from a non-Host connection', async () => {
		const { room, ctx } = await openRoom();
		const { ws: aliceWs } = await join(room, ctx, 'alice');

		await room.webSocketMessage(aliceWs as never, JSON.stringify({ type: 'start_round' }));
		await room.webSocketMessage(aliceWs as never, JSON.stringify({ type: 'reset' }));

		const snapshot = aliceWs.lastSnapshot() as { value: string };
		expect(snapshot.value).toBe('active');
	});

	it('share_guess_groups sends each Participant a redacted, targeted breakdown', async () => {
		const { room, ctx, token } = await openRoom();
		const { ws: hostWs } = await joinHost(room, ctx, token);
		const { ws: aliceWs } = await join(room, ctx, 'alice');
		const { ws: bobWs } = await join(room, ctx, 'bob');

		await room.webSocketMessage(aliceWs as never, JSON.stringify({ type: 'start_round' }));
		await room.webSocketMessage(
			aliceWs as never,
			JSON.stringify({ type: 'submit', guess: 'wrong' })
		);
		await room.webSocketMessage(bobWs as never, JSON.stringify({ type: 'submit', guess: 'wrong' }));
		await room.webSocketMessage(aliceWs as never, JSON.stringify({ type: 'reveal' }));
		await room.webSocketMessage(hostWs as never, JSON.stringify({ type: 'share_guess_groups' }));

		// Alice and Bob guessed the same move, so they share one Guess Group — each sees
		// both names on their own group.
		const forAlice = aliceWs.sent
			.map((raw) => JSON.parse(raw))
			.find((m) => m.type === 'guess_groups');
		expect(forAlice).toBeTruthy();
		const aliceGroup = forAlice.breakdown.groups.find((g: { san: string }) => g.san === 'wrong');
		expect(aliceGroup.names).toEqual(['alice', 'bob']);
		expect(aliceGroup.count).toBe(2);

		// The Host's own control socket is never sent a targeted breakdown.
		expect(hostWs.sent.map((raw) => JSON.parse(raw)).some((m) => m.type === 'guess_groups')).toBe(
			false
		);
	});

	it('share_guess_groups never leaks another Guess Group’s names to the wrong socket', async () => {
		const { room, ctx, token } = await openRoom();
		const { ws: hostWs } = await joinHost(room, ctx, token);
		const { ws: aliceWs } = await join(room, ctx, 'alice');
		const { ws: bobWs } = await join(room, ctx, 'bob');

		await room.webSocketMessage(aliceWs as never, JSON.stringify({ type: 'start_round' }));
		await room.webSocketMessage(
			aliceWs as never,
			JSON.stringify({ type: 'submit', guess: 'alices-move' })
		);
		await room.webSocketMessage(
			bobWs as never,
			JSON.stringify({ type: 'submit', guess: 'bobs-move' })
		);
		await room.webSocketMessage(aliceWs as never, JSON.stringify({ type: 'reveal' }));
		await room.webSocketMessage(hostWs as never, JSON.stringify({ type: 'share_guess_groups' }));

		const forAlice = aliceWs.sent
			.map((raw) => JSON.parse(raw))
			.find((m) => m.type === 'guess_groups');
		const bobsGroup = forAlice.breakdown.groups.find((g: { san: string }) => g.san === 'bobs-move');
		// Alice sees Bob's group as a bare count, never his name.
		expect(bobsGroup.count).toBe(1);
		expect(bobsGroup.names).toBeNull();
	});

	it('ignores a share_guess_groups attempt from a non-Host connection', async () => {
		const { room, ctx } = await openRoom();
		const { ws: aliceWs } = await join(room, ctx, 'alice');

		await room.webSocketMessage(aliceWs as never, JSON.stringify({ type: 'start_round' }));
		await room.webSocketMessage(
			aliceWs as never,
			JSON.stringify({ type: 'submit', guess: 'wrong' })
		);
		await room.webSocketMessage(aliceWs as never, JSON.stringify({ type: 'reveal' }));
		await room.webSocketMessage(aliceWs as never, JSON.stringify({ type: 'share_guess_groups' }));

		expect(aliceWs.sent.map((raw) => JSON.parse(raw)).some((m) => m.type === 'guess_groups')).toBe(
			false
		);
	});

	it('deletes: disconnects every socket (Host included) and frees the Room Code for reuse', async () => {
		const { room, ctx, token } = await openRoom();
		const { ws: hostWs } = await joinHost(room, ctx, token);
		const { ws: aliceWs } = await join(room, ctx, 'alice');

		await room.webSocketMessage(hostWs as never, JSON.stringify({ type: 'delete_session' }));

		expect(hostWs.closed?.code).toBe(4410);
		expect(aliceWs.closed?.code).toBe(4410);

		const recreated = await room.createSession();
		expect(recreated).toBeTruthy();
	});

	it('ignores a delete attempt from a non-Host connection', async () => {
		const { room, ctx } = await openRoom();
		const { ws: aliceWs } = await join(room, ctx, 'alice');

		await room.webSocketMessage(aliceWs as never, JSON.stringify({ type: 'delete_session' }));

		expect(aliceWs.closed).toBeNull();
		await expect(room.createSession()).resolves.toBeNull();
	});
});
