<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { SessionClient } from '#lib/round/session-client.svelte.js';
	import {
		topLeaderboard,
		submissionProgress,
		everyoneAnswered,
		remainingMs,
		formatCountdown
	} from '#lib/host/host-view.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';

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
	const rosterIds = $derived(Object.keys(participants));
	const rosterSize = $derived(rosterIds.length);
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

	{#if rosterSize > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-sm">Participants ({rosterSize})</Card.Title>
			</Card.Header>
			<Card.Content>
				<ul class="flex flex-wrap gap-2">
					{#each rosterIds as id (id)}
						<li class="flex items-center gap-1 rounded-full border py-0.5 pl-3 pr-1 text-sm">
							{id}
							<Button
								variant="destructive"
								size="icon-xs"
								aria-label={`Kick ${id}`}
								onclick={() => client.kick(id)}
							>
								&times;
							</Button>
						</li>
					{/each}
				</ul>
			</Card.Content>
		</Card.Root>
	{/if}

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
				{@render leaderboard()}
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
				{@render leaderboard()}
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
</main>

{#snippet leaderboard()}
	{#if leaders.length === 0}
		<p class="text-sm text-muted-foreground">No scores yet.</p>
	{:else}
		<ol class="flex flex-col gap-2">
			{#each leaders as entry, i (entry.participantId)}
				<li class="flex items-center justify-between rounded-lg border px-3 py-2">
					<span class="flex items-center gap-3">
						<span class="w-5 text-right font-mono text-muted-foreground">{i + 1}</span>
						<span class="font-medium">{entry.participantId}</span>
					</span>
					<span class="font-mono tabular-nums">{entry.total}</span>
				</li>
			{/each}
		</ol>
	{/if}
{/snippet}
