<script lang="ts">
	import { onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { SessionClient } from '$lib/round/session-client.svelte';
	import { remainingMs, formatCountdown } from '$lib/host/host-view';
	import { getGameData, quizSteps } from '$lib/round/game-data';
	import {
		FILES,
		DISPLAY_RANKS,
		resolveTapMove,
		buildMoveHistory,
		type ResolvedMove
	} from '$lib/round/participant-input';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';

	const code = page.params.code ?? '';
	const client = new SessionClient();
	const game = getGameData();

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
		client.connect({ code, participantId: id });
		tick = setInterval(() => (now = Date.now()), 250);
	}

	onDestroy(() => {
		clearInterval(tick);
		client.disconnect();
	});

	const snapshot = $derived(client.snapshot);
	const phase = $derived(snapshot?.value ?? 'lobby');
	const countdown = $derived(formatCountdown(remainingMs(snapshot?.deadline ?? null, now)));
	const me = $derived(name.trim());
	const myState = $derived(snapshot?.context.participants[me]);
	const myTotal = $derived(snapshot?.context.totals[me] ?? 0);
	const locked = $derived(myState?.status === 'submitted' || myState?.status === 'late');

	// The Host advances Rounds through the Featured Game (#34's Next Round); this screen
	// follows whichever Round SessionRoom says is current rather than always showing the
	// first one (#27's pre-analysed answer-key table is the position/candidate-move source).
	const roundIndex = $derived(snapshot?.roundIndex ?? 0);
	const quizStep = $derived(quizSteps()[roundIndex]);
	const fen = $derived(quizStep?.fenBefore ?? game.startFen);
	const candidateSans = $derived(
		quizStep ? [quizStep.san, ...quizStep.alternatives.map((a) => a.san)] : []
	);
	const history = $derived(
		buildMoveHistory(game.steps.filter((s) => s.ply < (quizStep?.ply ?? 1)))
	);

	// A new Round means a fresh tap — drop any half-made selection from the last one.
	$effect(() => {
		roundIndex;
		origin = null;
		pending = null;
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
		<h1 class="text-xl font-semibold">Guess the Move</h1>
		<p class="text-xs text-muted-foreground">
			Room <span class="font-mono tracking-widest">{code}</span>
		</p>
	</header>

	{#if !joined}
		<Card.Root>
			<Card.Header>
				<Card.Title>Join the room</Card.Title>
				<Card.Description>Pick a display name — no account needed.</Card.Description>
			</Card.Header>
			<Card.Content>
				<form class="flex gap-2" onsubmit={(e) => (e.preventDefault(), join())}>
					<input
						class="flex-1 rounded-md border px-3 py-2 text-sm"
						placeholder="Your name"
						bind:value={name}
						maxlength="24"
					/>
					<Button type="submit" disabled={!name.trim()}>Join</Button>
				</form>
			</Card.Content>
		</Card.Root>
	{:else if phase === 'lobby'}
		<Card.Root>
			<Card.Header>
				<Card.Title>You're in</Card.Title>
				<Card.Description>
					Waiting for the Host to start the Round{client.connected ? '' : ' · connecting…'}
				</Card.Description>
			</Card.Header>
		</Card.Root>
	{:else if phase === 'active'}
		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center justify-between">
					<span>Your guess</span>
					<span class="font-mono text-2xl tabular-nums">{countdown}</span>
				</Card.Title>
				<Card.Description>
					Tap the square your move starts on, then where it lands.
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
							<div
								class="flex-1 text-center font-mono text-xs text-muted-foreground"
							>
								{file}
							</div>
						{/each}
					</div>
				</div>

				{#if locked}
					<p class="text-center text-sm font-medium text-primary">
						Locked in — waiting for the Reveal.
					</p>
				{:else if pending}
					<div class="flex items-center justify-between rounded-lg border px-3 py-2">
						<span>
							Confirm <span class="text-2xl">{pending.glyph}</span>
						</span>
						<span class="flex gap-2">
							<Button variant="outline" size="sm" onclick={clearPending}>Clear</Button>
							<Button size="sm" onclick={commit}>Submit</Button>
						</span>
					</div>
				{:else}
					<p class="text-center text-sm text-muted-foreground">
						{origin ? `From ${origin} — now tap the destination.` : 'Tap your starting square.'}
					</p>
				{/if}

				{#if history.length}
					<div>
						<h2 class="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
							Moves so far
						</h2>
						<p class="font-mono text-sm leading-relaxed">
							{#each history as row (row.number)}
								<span class="text-muted-foreground">{row.number}.</span>
								{row.white ?? ''}
								{row.black ?? ''}
							{/each}
						</p>
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	{:else}
		<Card.Root>
			<Card.Header>
				<Card.Title>{phase === 'reveal' ? 'Reveal' : 'Round closed'}</Card.Title>
				<Card.Description>Your running score</Card.Description>
			</Card.Header>
			<Card.Content>
				<div class="text-center">
					<div class="font-mono text-5xl tabular-nums">
						{myTotal > 0 ? '+' : ''}{myTotal}
					</div>
					<p class="mt-2 text-sm text-muted-foreground">{me}</p>
				</div>
			</Card.Content>
		</Card.Root>
	{/if}
</main>
