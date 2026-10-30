<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/env';
	import { page } from '$app/state';
	import { SessionClient } from '#lib/round/session-client.svelte.js';
	import { remainingMs, formatCountdown, topLeaderboard } from '#lib/host/host-view.js';
	import { getGameData, quizSteps, getAnswerKeyStep } from '#lib/round/game-data.js';
	import {
		FILES,
		DISPLAY_RANKS,
		resolveTapMove,
		buildMoveHistory,
		sanToGlyph,
		formatNumberedMove,
		formatContinuation,
		type ResolvedMove
	} from '#lib/round/participant-input.js';
	import { buildParticipantFeedback, explanationText } from '#lib/round/feedback.js';
	import { m } from '#lib/paraglide/messages.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import Leaderboard from '#lib/components/leaderboard.svelte';
	import Podium from '#lib/components/podium.svelte';
	import ScoreSheet from '#lib/components/score-sheet.svelte';
	import GuessGroupChart from '#lib/components/guess-group-chart.svelte';

	const code = page.params.code ?? '';
	const client = new SessionClient();
	const game = getGameData();

	// A rejoin (dropped connection, refresh, closed tab) must land back on the same
	// identity, or the Participant's whole running total appears to vanish - it's
	// actually still sitting in SessionRoom under their old name, just unreachable
	// because nothing remembered what that name was. Persisting it per room code and
	// auto-rejoining on mount is the fix; the manual join form stays as the fallback
	// for a first-time join or a different device.
	const storageKey = `guess-the-move:name:${code}`;

	let name = $state(page.url.searchParams.get('name') ?? '');
	let joined = $state(false);
	let now = $state(Date.now());
	let tick: ReturnType<typeof setInterval>;

	let origin = $state<string | null>(null);
	let pending = $state<ResolvedMove | null>(null);

	function join() {
		const id = name.trim();
		if (!id) return;
		joined = true;
		if (browser) localStorage.setItem(storageKey, id);
		name = id;
		client.connect({ code, participantId: id });
		tick = setInterval(() => (now = Date.now()), 250);
	}

	onMount(() => {
		const saved = localStorage.getItem(storageKey);
		if (saved) {
			name = saved;
			join();
		}
	});

	onDestroy(() => {
		clearInterval(tick);
		client.disconnect();
	});

	const snapshot = $derived(client.snapshot);
	const phase = $derived(snapshot?.value ?? 'lobby');
	const countdown = $derived(formatCountdown(remainingMs(snapshot?.deadline ?? null, now)));
	const me = $derived(name.trim());
	const myState = $derived(snapshot?.context.participants[me]);
	// The Round Score, broadcast on every snapshot once the Round closes - shown as
	// the headline number instead of the running total (#37), and reused as the
	// `score` fed into this Participant's automatic Reveal explanation (#42).
	const myRoundScore = $derived(snapshot?.context.scores[me] ?? 0);
	const locked = $derived(myState?.status === 'submitted' || myState?.status === 'late');
	const leaders = $derived(topLeaderboard(snapshot?.context.totals ?? {}));
	const top3 = $derived(topLeaderboard(snapshot?.context.totals ?? {}, 3));
	// The Guess Group breakdown only reaches a Participant's phone if the Host shares it.
	const sharedGroups = $derived(client.sharedGroups);

	// Once kicked, forget the saved name - a refresh must land back on the Join screen,
	// not silently retry into a connection the Host has already blocked server-side.
	$effect(() => {
		if (client.kicked && browser) localStorage.removeItem(storageKey);
	});

	// The Host advances Rounds through the Featured Game (#34's Next Round); this screen
	// follows whichever Round SessionRoom says is current rather than always showing the
	// first one (#27's pre-analysed answer-key table is the position/candidate-move source).
	const roundIndex = $derived(snapshot?.roundIndex ?? 0);
	const totalRounds = $derived(snapshot?.totalRounds ?? 0);
	const isFinalRound = $derived(phase === 'reveal' && roundIndex + 1 >= totalRounds);
	const quizStep = $derived(quizSteps()[roundIndex]);
	// The Opponent Response (#48): the single next move played in the game after this Round's
	// Featured move, shown large in numbered notation. Participants see the same move the Host
	// does, with no live controls. Reuses #43's formatNumberedMove.
	const opponentStep = $derived(quizStep ? getAnswerKeyStep(quizStep.ply + 1) : null);
	const opponentMove = $derived(
		opponentStep ? formatNumberedMove(opponentStep.san, opponentStep.ply) : null
	);
	const fen = $derived(quizStep?.fenBefore ?? game.startFen);
	const candidateSans = $derived(
		quizStep ? [quizStep.san, ...quizStep.alternatives.map((a) => a.san)] : []
	);
	// Each Participant's Round Score explanation — whether their Guess matched, which
	// tier, and the Variant — is automatic at Reveal now (#42, retiring #36's separate
	// Host-triggered Feedback). Derived locally from the snapshot and the client's
	// bundled answer key, so it's correct the instant Reveal lands, with no Host action.
	const feedback = $derived(
		phase === 'reveal' && myState
			? buildParticipantFeedback(quizStep ?? null, myState, myRoundScore, quizStep?.ply ?? 1)
			: null
	);
	const history = $derived(
		buildMoveHistory(game.steps.filter((s) => s.ply < (quizStep?.ply ?? 1)))
	);

	// A new Round means a fresh tap — drop any half-made selection, and any shared Guess
	// Group breakdown from the previous Round, so last Round's breakdown can't linger into
	// this one. (The Reveal explanation is derived from the current snapshot, so it clears
	// itself.)
	$effect(() => {
		roundIndex;
		origin = null;
		pending = null;
		client.sharedGroups = null;
	});

	function tapSquare(square: string) {
		if (pending || locked || phase !== 'active') return;
		if (origin === null) {
			origin = square;
			return;
		}
		if (origin === square) {
			origin = null;
			return;
		}
		const move = resolveTapMove(fen, origin, square, candidateSans);
		origin = null;
		// A null move (empty origin, or own piece on the destination) is dropped
		// silently — surfacing it would leak the hidden position (#24).
		if (move) pending = move;
	}

	function clearPending() {
		pending = null;
		origin = null;
	}

	function commit() {
		if (!pending) return;
		client.submit(pending.san);
		pending = null;
	}
</script>

<main class="mx-auto flex max-w-md flex-col gap-6 p-4">
	<header class="flex items-baseline justify-between">
		<h1 class="text-xl font-semibold">{m.app_title()}</h1>
		<p class="text-xs text-muted-foreground">
			{m.room_label()} <span class="font-mono tracking-widest">{code}</span>
		</p>
	</header>

	{#if client.ended}
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.session_ended_title()}</Card.Title>
				<Card.Description>{m.play_session_ended_desc()}</Card.Description>
			</Card.Header>
		</Card.Root>
	{:else if client.kicked}
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.play_kicked_title()}</Card.Title>
				<Card.Description>{m.play_kicked_desc()}</Card.Description>
			</Card.Header>
		</Card.Root>
	{:else if !joined}
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.play_join_title()}</Card.Title>
				<Card.Description>{m.play_join_desc()}</Card.Description>
			</Card.Header>
			<Card.Content>
				<form class="flex gap-2" onsubmit={(e) => (e.preventDefault(), join())}>
					<input
						class="flex-1 rounded-md border px-3 py-2 text-sm"
						placeholder={m.play_name_placeholder()}
						bind:value={name}
						maxlength="24"
					/>
					<Button type="submit" disabled={!name.trim()}>{m.join_button()}</Button>
				</form>
			</Card.Content>
		</Card.Root>
	{:else if phase === 'lobby'}
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.play_lobby_title()}</Card.Title>
				<Card.Description>
					{m.play_lobby_waiting()}{client.connected ? '' : ` · ${m.status_connecting()}`}
				</Card.Description>
			</Card.Header>
		</Card.Root>
	{:else if phase === 'active'}
		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center justify-between">
					<span>{m.play_guess_title()}</span>
					<span class="font-mono text-2xl tabular-nums">{countdown}</span>
				</Card.Title>
				<Card.Description>
					{m.play_guess_desc()}
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-4">
				<div class="flex flex-col">
					{#each DISPLAY_RANKS as rank (rank)}
						<div class="flex">
							<div
								class="flex w-5 items-center justify-center font-mono text-xs text-muted-foreground"
							>
								{rank}
							</div>
							{#each FILES as file (file)}
								{@const sq = `${file}${rank}`}
								{@const isDark = (FILES.indexOf(file) + rank) % 2 === 0}
								<button
									type="button"
									disabled={locked}
									onclick={() => tapSquare(sq)}
									aria-label={sq}
									class="aspect-square flex-1 border border-border/40 text-[10px] disabled:cursor-not-allowed"
									class:bg-muted={isDark}
									class:ring-2={origin === sq}
									class:ring-primary={origin === sq}
									class:ring-inset={origin === sq}
								></button>
							{/each}
						</div>
					{/each}
					<div class="flex">
						<div class="w-5"></div>
						{#each FILES as file (file)}
							<div class="flex-1 text-center font-mono text-xs text-muted-foreground">
								{file}
							</div>
						{/each}
					</div>
				</div>

				{#if locked}
					<p class="text-center text-sm font-medium text-primary">
						{m.play_locked()}
					</p>
				{:else if pending}
					<div class="flex items-center justify-between rounded-lg border px-3 py-2">
						<span>
							{m.play_confirm()} <span class="text-2xl">{pending.glyph}</span>
						</span>
						<span class="flex gap-2">
							<Button variant="outline" size="sm" onclick={clearPending}>{m.play_clear()}</Button>
							<Button size="sm" onclick={commit}>{m.play_submit()}</Button>
						</span>
					</div>
				{:else}
					<p class="text-center text-sm text-muted-foreground">
						{origin ? m.play_tap_from({ square: origin }) : m.play_tap_start()}
					</p>
				{/if}

				{#if history.length}
					<div>
						<h2 class="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
							{m.play_moves_so_far()}
						</h2>
						<ScoreSheet
							rows={history}
							event={game.headers.Event}
							date={game.headers.Date}
							white={game.headers.White}
							black={game.headers.Black}
						/>
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	{:else if phase === 'opponentResponse'}
		<!-- Opponent Response (#48): the same single next move the Host shows, large, with no
		     live controls (consistent with the host-only "Next Round" pattern). -->
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.opponent_response_title()}</Card.Title>
				<Card.Description>{m.opponent_response_desc()}</Card.Description>
			</Card.Header>
			<Card.Content>
				<div class="text-center font-mono text-5xl tracking-tight tabular-nums">
					{opponentMove ?? '—'}
				</div>
			</Card.Content>
		</Card.Root>
	{:else}
		<!-- Three-card Reveal (#46): personal feedback, then the always-visible Ranking, then
		     how the whole room guessed — each its own Card, in that order. -->
		<Card.Root>
			<Card.Header>
				<Card.Title>{phase === 'reveal' ? m.play_reveal_title() : m.play_closed_title()}</Card.Title
				>
				<Card.Description>{m.play_round_score()}</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-4">
				<div class="text-center">
					<div class="font-mono text-5xl tabular-nums">
						{myRoundScore > 0 ? '+' : ''}{myRoundScore}
					</div>
					<p class="mt-2 text-sm text-muted-foreground">{me}</p>
				</div>
				{#if feedback}
					<div class="flex flex-col gap-2 rounded-lg border px-3 py-3">
						<p class="text-sm font-medium">{feedback.phrase ?? explanationText(feedback.tier)}</p>
						<div class="flex flex-col gap-1 text-sm">
							{#if feedback.guessSan}
								<div class="flex items-baseline justify-between gap-2">
									<span class="text-muted-foreground">{m.play_feedback_your_move()}</span>
									<span class="font-mono text-base"
										>{formatNumberedMove(feedback.guessSan, feedback.ply)}</span
									>
								</div>
							{/if}
							<div class="flex items-baseline justify-between gap-2">
								<span class="text-muted-foreground">{m.play_feedback_played()}</span>
								<span class="font-mono text-base"
									>{formatNumberedMove(feedback.playedSan, feedback.ply)}</span
								>
							</div>
						</div>
						{#if feedback.variant && feedback.variant.continuation.length}
							<div class="flex flex-col gap-0.5">
								<span class="text-xs tracking-wide text-muted-foreground uppercase"
									>{m.play_feedback_continuation()}</span
								>
								<span class="font-mono text-sm">
									{formatContinuation(feedback.variant.continuation, feedback.ply + 1)}
									{#if feedback.variant.endEval != null}
										<span class="text-muted-foreground">
											({feedback.variant.endEval > 0 ? '+' : ''}{feedback.variant.endEval})
										</span>
									{/if}
								</span>
							</div>
						{/if}
					</div>
				{/if}
			</Card.Content>
		</Card.Root>

		<!-- Ranking: the shared Leaderboard, always shown to Participants at Reveal — no
		     gating button (#46). The viewer's own row is highlighted as today's. -->
		<Card.Root>
			<Card.Header>
				<Card.Title>{isFinalRound ? m.final_results_title() : m.leaderboard_title()}</Card.Title>
			</Card.Header>
			<Card.Content class="flex flex-col gap-4">
				{#if isFinalRound}
					<Podium entries={top3} highlightId={me} />
				{/if}
				<Leaderboard entries={leaders} highlightId={me} />
			</Card.Content>
		</Card.Root>

		{#if sharedGroups}
			<Card.Root>
				<Card.Header>
					<Card.Title>{m.play_guess_groups_title()}</Card.Title>
				</Card.Header>
				<Card.Content class="flex flex-col gap-3">
					<GuessGroupChart buckets={sharedGroups.buckets} highlightScore={myRoundScore} />
					<ul class="flex flex-col gap-1.5 text-sm">
						{#each sharedGroups.groups as group (group.san ?? '\u0000')}
							<li
								class="flex flex-col gap-0.5 rounded-lg border px-3 py-1.5"
								class:border-primary={group.names != null}
							>
								<div class="flex items-baseline justify-between gap-2">
									<span class="font-mono text-base">
										{group.san ? sanToGlyph(group.san) : m.guess_groups_no_move()}
									</span>
									<span class="font-mono text-xs text-muted-foreground tabular-nums">
										{group.score > 0 ? '+' : ''}{group.score}
									</span>
								</div>
								{#if group.names}
									<span class="text-xs text-muted-foreground">
										<span class="font-medium text-foreground"
											>{m.play_guess_groups_your_group()}:</span
										>
										{group.names.join(', ')}
									</span>
								{:else}
									<span class="text-xs text-muted-foreground">
										{group.count === 1
											? m.guess_group_players_one({ count: group.count })
											: m.guess_group_players_other({ count: group.count })}
									</span>
								{/if}
							</li>
						{/each}
					</ul>
				</Card.Content>
			</Card.Root>
		{/if}
	{/if}
</main>
