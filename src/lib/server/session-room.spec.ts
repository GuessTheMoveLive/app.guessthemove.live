import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionRoom } from './session-room.js';
import { quizSteps } from '#lib/round/game-data.js';

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

	it('continue moves every client into the Opponent Response phase (#48)', async () => {
		const { room, ctx } = await openRoom();
		const { ws } = await join(room, ctx, 'alice');

		await room.webSocketMessage(ws as never, JSON.stringify({ type: 'start_round' }));
		await room.webSocketMessage(ws as never, JSON.stringify({ type: 'reveal' }));
		await room.webSocketMessage(ws as never, JSON.stringify({ type: 'continue' }));

		const snapshot = ws.lastSnapshot() as { value: string };
		expect(snapshot.value).toBe('opponentResponse');
	});

	it('back returns from Opponent Response to Reveal (#48)', async () => {
		const { room, ctx } = await openRoom();
		const { ws } = await join(room, ctx, 'alice');

		await room.webSocketMessage(ws as never, JSON.stringify({ type: 'start_round' }));
		await room.webSocketMessage(ws as never, JSON.stringify({ type: 'reveal' }));
		await room.webSocketMessage(ws as never, JSON.stringify({ type: 'continue' }));
		await room.webSocketMessage(ws as never, JSON.stringify({ type: 'back' }));

		const snapshot = ws.lastSnapshot() as { value: string };
		expect(snapshot.value).toBe('reveal');
	});

	it('finish moves every client into the Finished phase, only on the Featured Game’s final Round (#50)', async () => {
		const { room, ctx } = await openRoom();
		await ctx.storage.put('round-index', quizSteps().length - 1);
		const { ws } = await join(room, ctx, 'alice');

		await room.webSocketMessage(ws as never, JSON.stringify({ type: 'start_round' }));
		await room.webSocketMessage(ws as never, JSON.stringify({ type: 'reveal' }));
		await room.webSocketMessage(ws as never, JSON.stringify({ type: 'continue' }));
		await room.webSocketMessage(ws as never, JSON.stringify({ type: 'finish' }));

		const snapshot = ws.lastSnapshot() as { value: string };
		expect(snapshot.value).toBe('finished');
	});

	it('ignores finish before the Featured Game’s final Round (#50)', async () => {
		const { room, ctx } = await openRoom();
		const { ws } = await join(room, ctx, 'alice');

		await room.webSocketMessage(ws as never, JSON.stringify({ type: 'start_round' }));
		await room.webSocketMessage(ws as never, JSON.stringify({ type: 'reveal' }));
		await room.webSocketMessage(ws as never, JSON.stringify({ type: 'continue' }));
		await room.webSocketMessage(ws as never, JSON.stringify({ type: 'finish' }));

		const snapshot = ws.lastSnapshot() as { value: string };
		expect(snapshot.value).toBe('opponentResponse');
	});

	it('ignores finish outside Opponent Response, even on the final Round (#50)', async () => {
		const { room, ctx } = await openRoom();
		await ctx.storage.put('round-index', quizSteps().length - 1);
		const { ws } = await join(room, ctx, 'alice');

		await room.webSocketMessage(ws as never, JSON.stringify({ type: 'start_round' }));
		await room.webSocketMessage(ws as never, JSON.stringify({ type: 'reveal' }));

		await room.webSocketMessage(ws as never, JSON.stringify({ type: 'finish' }));

		const snapshot = ws.lastSnapshot() as { value: string };
		expect(snapshot.value).toBe('reveal');
	});

	it('next_round from Opponent Response advances to the next Round’s active phase (#48)', async () => {
		const { room, ctx } = await openRoom();
		const { ws } = await join(room, ctx, 'alice');

		await room.webSocketMessage(ws as never, JSON.stringify({ type: 'start_round' }));
		await room.webSocketMessage(ws as never, JSON.stringify({ type: 'reveal' }));
		await room.webSocketMessage(ws as never, JSON.stringify({ type: 'continue' }));
		await room.webSocketMessage(ws as never, JSON.stringify({ type: 'next_round' }));

		const snapshot = ws.lastSnapshot() as { value: string; roundIndex: number };
		expect(snapshot.value).toBe('active');
		expect(snapshot.roundIndex).toBe(1);
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

	it('on Reveal, every socket gets the closed Round’s scores on the one broadcast snapshot', async () => {
		// #53 retires #45's separate targeted "guess_groups" push (lost on reconnect) in
		// favour of every client deriving its own Guess Group breakdown off the same
		// `context.participants`/`context.scores` the broadcast snapshot already carries —
		// so there's nothing left here for SessionRoom to compute or redact itself.
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

		for (const ws of [hostWs, aliceWs, bobWs]) {
			expect(ws.sent.some((raw) => JSON.parse(raw).type === 'guess_groups')).toBe(false);
			const snapshot = ws.lastSnapshot() as {
				context: { participants: Record<string, unknown>; scores: Record<string, number> };
			};
			expect(Object.keys(snapshot.context.participants)).toEqual(['alice', 'bob']);
			expect(snapshot.context.scores.alice).toBe(snapshot.context.scores.bob);
		}
	});

	it('a Participant reconnecting after Reveal is replayed the same closed-Round scores (#53)', async () => {
		const { room, ctx, token } = await openRoom();
		await joinHost(room, ctx, token);
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

		// Simulate Alice's phone reloading: a brand-new socket, same participantId, with no
		// memory of the earlier session — the fresh connection alone must be enough to
		// rebuild her Reveal breakdown.
		const { ws: reconnectWs } = await join(room, ctx, 'alice');

		const snapshot = reconnectWs.lastSnapshot() as {
			value: string;
			context: { participants: Record<string, unknown>; scores: Record<string, number> };
		};
		expect(snapshot.value).toBe('reveal');
		expect(Object.keys(snapshot.context.participants)).toEqual(['alice', 'bob']);
		expect(snapshot.context.scores).toHaveProperty('alice');
		expect(snapshot.context.scores).toHaveProperty('bob');
	});

	it('show_leaderboard is a one-way, Host-only flag, reset by a new Round (#51, #55)', async () => {
		const { room, ctx, token } = await openRoom();
		const { ws: hostWs } = await joinHost(room, ctx, token);
		const { ws: aliceWs } = await join(room, ctx, 'alice');

		await room.webSocketMessage(aliceWs as never, JSON.stringify({ type: 'start_round' }));
		expect((hostWs.lastSnapshot() as { showLeaderboard: boolean }).showLeaderboard).toBe(false);

		await room.webSocketMessage(hostWs as never, JSON.stringify({ type: 'show_leaderboard' }));
		expect((hostWs.lastSnapshot() as { showLeaderboard: boolean }).showLeaderboard).toBe(true);

		// A Participant's socket can never trigger it.
		await room.webSocketMessage(aliceWs as never, JSON.stringify({ type: 'show_leaderboard' }));
		expect((hostWs.lastSnapshot() as { showLeaderboard: boolean }).showLeaderboard).toBe(true);

		// One-way: a repeat Host message doesn't hide it back.
		await room.webSocketMessage(hostWs as never, JSON.stringify({ type: 'show_leaderboard' }));
		expect((hostWs.lastSnapshot() as { showLeaderboard: boolean }).showLeaderboard).toBe(true);

		await room.webSocketMessage(aliceWs as never, JSON.stringify({ type: 'reveal' }));
		await room.webSocketMessage(aliceWs as never, JSON.stringify({ type: 'continue' }));
		await room.webSocketMessage(aliceWs as never, JSON.stringify({ type: 'next_round' }));
		expect((hostWs.lastSnapshot() as { showLeaderboard: boolean }).showLeaderboard).toBe(false);
	});

	it('end_session_early: jumps every client straight to Final Results, keeping the Room Code alive (#57)', async () => {
		const { room, ctx, token } = await openRoom();
		const { ws: hostWs } = await joinHost(room, ctx, token);
		const { ws: aliceWs } = await join(room, ctx, 'alice');

		await room.webSocketMessage(aliceWs as never, JSON.stringify({ type: 'start_round' }));
		await room.webSocketMessage(hostWs as never, JSON.stringify({ type: 'end_session_early' }));

		const snapshot = hostWs.lastSnapshot() as { value: string; endedEarly: boolean };
		expect(snapshot.value).toBe('finished');
		expect(snapshot.endedEarly).toBe(true);
		expect(hostWs.closed).toBeNull();
		expect(aliceWs.closed).toBeNull();

		// Unlike delete_session, the Room Code is still live - createSession refuses to
		// mint a second token for a Session that still exists.
		await expect(room.createSession()).resolves.toBeNull();
	});

	it('end_session_early uses only the Rounds actually played - an in-flight Round falls back to priorTotals', async () => {
		const { room, ctx, token } = await openRoom();
		const { ws: hostWs } = await joinHost(room, ctx, token);
		const { ws: aliceWs } = await join(room, ctx, 'alice');

		await room.webSocketMessage(aliceWs as never, JSON.stringify({ type: 'start_round' }));
		await room.webSocketMessage(
			aliceWs as never,
			JSON.stringify({ type: 'submit', guess: 'definitely-not-the-answer' })
		);
		await room.webSocketMessage(hostWs as never, JSON.stringify({ type: 'end_session_early' }));

		const snapshot = hostWs.lastSnapshot() as {
			value: string;
			context: { totals: Record<string, number> };
		};
		expect(snapshot.value).toBe('finished');
		// The active Round never closed, so its guess can't score - alice's total stays at
		// the empty priorTotals she came into Round 1 with, not some half-played score.
		expect(snapshot.context.totals).toEqual({});
	});

	it('ignores an end_session_early attempt from a non-Host connection', async () => {
		const { room, ctx } = await openRoom();
		const { ws: aliceWs } = await join(room, ctx, 'alice');

		await room.webSocketMessage(aliceWs as never, JSON.stringify({ type: 'start_round' }));
		await room.webSocketMessage(aliceWs as never, JSON.stringify({ type: 'end_session_early' }));

		const snapshot = aliceWs.lastSnapshot() as { value: string };
		expect(snapshot.value).toBe('active');
	});

	it('a Reset after an early end clears the ended-early flag so a restarted Session starts clean', async () => {
		const { room, ctx, token } = await openRoom();
		const { ws: hostWs } = await joinHost(room, ctx, token);
		const { ws: aliceWs } = await join(room, ctx, 'alice');

		await room.webSocketMessage(aliceWs as never, JSON.stringify({ type: 'start_round' }));
		await room.webSocketMessage(hostWs as never, JSON.stringify({ type: 'end_session_early' }));
		await room.webSocketMessage(hostWs as never, JSON.stringify({ type: 'reset' }));

		const snapshot = hostWs.lastSnapshot() as { value: string; endedEarly: boolean };
		expect(snapshot.value).toBe('lobby');
		expect(snapshot.endedEarly).toBe(false);
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

	describe('Guess history & Session start time (#52)', () => {
		it('retains a submitted Guess under its round index, across a round advance', async () => {
			const { room, ctx } = await openRoom();
			const { ws } = await join(room, ctx, 'alice');

			await room.webSocketMessage(ws as never, JSON.stringify({ type: 'start_round' }));
			await room.webSocketMessage(ws as never, JSON.stringify({ type: 'submit', guess: 'e4' }));
			await room.webSocketMessage(ws as never, JSON.stringify({ type: 'reveal' }));
			await room.webSocketMessage(ws as never, JSON.stringify({ type: 'continue' }));
			await room.webSocketMessage(ws as never, JSON.stringify({ type: 'next_round' }));

			const history =
				await ctx.storage.get<Record<number, Record<string, string>>>('guess-history');
			expect(history?.[0]).toEqual({ alice: 'e4' });
		});

		it('omits a timed-out participant from that Round’s history, distinct from an empty Guess', async () => {
			const { room, ctx } = await openRoom();
			const { ws } = await join(room, ctx, 'alice');

			await room.webSocketMessage(ws as never, JSON.stringify({ type: 'start_round' }));
			await room.alarm();

			const history =
				await ctx.storage.get<Record<number, Record<string, string>>>('guess-history');
			expect(history?.[0]).toEqual({});
			expect('alice' in (history?.[0] ?? {})).toBe(false);
		});

		it('records a late Guess (submitted after timeout, before Reveal)', async () => {
			const { room, ctx } = await openRoom();
			const { ws } = await join(room, ctx, 'alice');

			await room.webSocketMessage(ws as never, JSON.stringify({ type: 'start_round' }));
			await room.alarm();
			await room.webSocketMessage(
				ws as never,
				JSON.stringify({ type: 'submit', guess: 'late-e4' })
			);

			const history =
				await ctx.storage.get<Record<number, Record<string, string>>>('guess-history');
			expect(history?.[0]).toEqual({ alice: 'late-e4' });
		});

		it('keeps every Round’s Guesses as the Session progresses through several Rounds', async () => {
			const { room, ctx } = await openRoom();
			const { ws } = await join(room, ctx, 'alice');

			await room.webSocketMessage(ws as never, JSON.stringify({ type: 'start_round' }));
			await room.webSocketMessage(
				ws as never,
				JSON.stringify({ type: 'submit', guess: 'round-0' })
			);
			await room.webSocketMessage(ws as never, JSON.stringify({ type: 'reveal' }));
			await room.webSocketMessage(ws as never, JSON.stringify({ type: 'continue' }));
			await room.webSocketMessage(ws as never, JSON.stringify({ type: 'next_round' }));
			await room.webSocketMessage(
				ws as never,
				JSON.stringify({ type: 'submit', guess: 'round-1' })
			);
			await room.webSocketMessage(ws as never, JSON.stringify({ type: 'reveal' }));

			const history =
				await ctx.storage.get<Record<number, Record<string, string>>>('guess-history');
			expect(history?.[0]).toEqual({ alice: 'round-0' });
			expect(history?.[1]).toEqual({ alice: 'round-1' });
		});

		it('captures the Session start time exactly once, on the first Start Round for Round 1', async () => {
			const { room, ctx } = await openRoom();
			const { ws } = await join(room, ctx, 'alice');

			vi.useFakeTimers();
			vi.setSystemTime(1_000_000);
			await room.webSocketMessage(ws as never, JSON.stringify({ type: 'start_round' }));
			const firstStart = await ctx.storage.get<number>('session-start-time');
			expect(firstStart).toBe(1_000_000);

			vi.setSystemTime(2_000_000);
			await room.webSocketMessage(ws as never, JSON.stringify({ type: 'submit', guess: 'e4' }));
			await room.webSocketMessage(ws as never, JSON.stringify({ type: 'reveal' }));
			await room.webSocketMessage(ws as never, JSON.stringify({ type: 'continue' }));
			await room.webSocketMessage(ws as never, JSON.stringify({ type: 'next_round' }));

			expect(await ctx.storage.get<number>('session-start-time')).toBe(1_000_000);
		});

		it('a Reset clears Guess history and the Session start time so a new Session recaptures both', async () => {
			const { room, ctx, token } = await openRoom();
			const { ws: hostWs } = await joinHost(room, ctx, token);
			const { ws: aliceWs } = await join(room, ctx, 'alice');

			await room.webSocketMessage(aliceWs as never, JSON.stringify({ type: 'start_round' }));
			await room.webSocketMessage(
				aliceWs as never,
				JSON.stringify({ type: 'submit', guess: 'e4' })
			);
			await room.webSocketMessage(hostWs as never, JSON.stringify({ type: 'reset' }));

			// The fresh Round 0 actor re-derives an (empty) history entry on the very next
			// persistSnapshot - the Reset's effect is that alice's pre-reset Guess is gone,
			// not that the key disappears outright.
			const history =
				await ctx.storage.get<Record<number, Record<string, string>>>('guess-history');
			expect(history?.[0]).toEqual({});
			expect(await ctx.storage.get('session-start-time')).toBeUndefined();
		});
	});

	describe('Guess history on the broadcast snapshot (#58: Game Sheet)', () => {
		it('includes every recorded Round’s Guesses, keyed by Round index then participant id', async () => {
			const { room, ctx } = await openRoom();
			const { ws } = await join(room, ctx, 'alice');

			await room.webSocketMessage(ws as never, JSON.stringify({ type: 'start_round' }));
			await room.webSocketMessage(ws as never, JSON.stringify({ type: 'submit', guess: 'e4' }));

			const snapshot = ws.lastSnapshot() as { guessHistory: Record<number, Record<string, string>> };
			expect(snapshot.guessHistory).toEqual({ 0: { alice: 'e4' } });
		});

		it('is an empty object before any Round has recorded a Guess', async () => {
			const { room, ctx } = await openRoom();
			const { ws } = await join(room, ctx, 'alice');

			const snapshot = ws.lastSnapshot() as { guessHistory: Record<number, Record<string, string>> };
			expect(snapshot.guessHistory).toEqual({});
		});
	});
});
