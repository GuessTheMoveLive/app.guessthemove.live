<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { SessionClient } from '#lib/round/session-client.svelte.js';
	import {
		topLeaderboard,
		scoreboardRows,
		submissionProgress,
		everyoneAnswered,
		remainingMs,
		formatCountdown
	} from '#lib/host/host-view.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import Leaderboard from '#lib/components/leaderboard.svelte';

	const code = page.params.code ?? '';
	const client = new SessionClient();

	let now = $state(Date.now());
	let tick: ReturnType<typeof setInterval>;

	onMount(() => {
		client.connect({ code, role: 'host' });
		tick = setInterval(() => (now = Date.now()), 250);
	});
	onDestroy(() => {
		clearInterval(tick);
		client.disconnect();
	});

	const snapshot = $derived(client.snapshot);
	const phase = $derived(snapshot?.value ?? 'lobby');
	const participants = $derived(snapshot?.context.participants ?? {});
	const progress = $derived(submissionProgress(participants));
	const answered = $derived(everyoneAnswered(participants));
	const leaders = $derived(topLeaderboard(snapshot?.context.totals ?? {}));
	const countdown = $derived(formatCountdown(remainingMs(snapshot?.deadline ?? null, now)));
	const scoreboard = $derived(
		scoreboardRows(participants, snapshot?.context.totals ?? {}, snapshot?.context.priorTotals ?? {})
	);
	const rosterSize = $derived(scoreboard.length);
	const roundIndex = $derived(snapshot?.roundIndex ?? 0);
	const totalRounds = $derived(snapshot?.totalRounds ?? 0);
	const hasNextRound = $derived(roundIndex + 1 < totalRounds);
</script>

<main class="mx-auto flex max-w-2xl flex-col gap-6 p-6">
	<header class="flex items-baseline justify-between">
		<h1 class="text-2xl font-semibold">Guess the Move — Host</h1>
		<p class="text-sm text-muted-foreground">
			Room <span class="font-mono font-medium tracking-widest">{code}</span>
			· {client.connected ? 'live' : 'connecting…'}
			{#if totalRounds > 0}
				· Round {roundIndex + 1} of {totalRounds}
			{/if}
		</p>
	</header>

	{#if phase === 'lobby'}
		<Card.Root>
			<Card.Header>
				<Card.Title>Lobby</Card.Title>
				<Card.Description>{rosterSize} player{rosterSize === 1 ? '' : 's'} joined</Card.Description>
			</Card.Header>
			<Card.Footer>
				<Button onclick={() => client.startRound()}>Start Round</Button>
			</Card.Footer>
		</Card.Root>
	{:else if phase === 'active'}
		<Card.Root>
			<Card.Header>
				<Card.Title>Round in progress</Card.Title>
				<Card.Description>
					Reveal is always triggered by you — never automatically.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-4">
				<div class="text-center">
					<div class="font-mono text-5xl tabular-nums">{countdown}</div>
					<div class="mt-2 text-sm text-muted-foreground">
						{progress.submitted}/{progress.total} answered
					</div>
					{#if answered}
						<p class="mt-2 text-sm font-medium text-primary">
							Everyone has answered — safe to reveal.
						</p>
					{/if}
				</div>
				<div class="flex justify-center gap-2">
					<Button variant="outline" size="sm" onclick={() => client.adjustRound(-30_000)}>
						−30s
					</Button>
					<Button variant="outline" size="sm" onclick={() => client.adjustRound(30_000)}>
						+30s
					</Button>
				</div>
			</Card.Content>
			<Card.Footer>
				<Button onclick={() => client.reveal()}>Reveal</Button>
			</Card.Footer>
		</Card.Root>
	{:else if phase === 'closed'}
		<Card.Root>
			<Card.Header>
				<Card.Title>Round closed</Card.Title>
				<Card.Description>Top 5 leaderboard</Card.Description>
			</Card.Header>
			<Card.Content>
				<Leaderboard entries={leaders} />
			</Card.Content>
			<Card.Footer>
				<Button onclick={() => client.reveal()}>Reveal</Button>
			</Card.Footer>
		</Card.Root>
	{:else}
		<Card.Root>
			<Card.Header>
				<Card.Title>Reveal</Card.Title>
				<Card.Description>Top 5 leaderboard</Card.Description>
			</Card.Header>
			<Card.Content>
				<Leaderboard entries={leaders} />
			</Card.Content>
			<Card.Footer>
				{#if hasNextRound}
					<Button onclick={() => client.nextRound()}>Next Round</Button>
				{:else}
					<p class="text-sm font-medium text-muted-foreground">
						Final Round complete — no Rounds left in the Featured Game.
					</p>
				{/if}
			</Card.Footer>
		</Card.Root>
	{/if}

	{#if rosterSize > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-sm">Scoreboard ({rosterSize})</Card.Title>
			</Card.Header>
			<Card.Content class="max-h-72 overflow-y-auto">
				<ol class="flex flex-col gap-2">
					{#each scoreboard as row (row.participantId)}
						<li class="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
							<span class="min-w-0 flex-1 truncate font-medium">{row.participantId}</span>
							{#if phase === 'active' || phase === 'closed'}
								<span class="w-10 shrink-0 text-center font-mono text-muted-foreground">
									{row.move ?? '…'}
								</span>
							{/if}
							<span class="w-8 shrink-0 text-right font-mono tabular-nums">{row.score}</span>
							<Button
								variant="destructive"
								size="icon-xs"
								aria-label={`Kick ${row.participantId}`}
								onclick={() => client.kick(row.participantId)}
							>
								&times;
							</Button>
						</li>
					{/each}
				</ol>
			</Card.Content>
		</Card.Root>
	{/if}
</main>
