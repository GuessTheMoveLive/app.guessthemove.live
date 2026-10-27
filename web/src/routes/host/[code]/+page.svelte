<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { SessionClient } from '$lib/round/session-client.svelte';
	import {
		topLeaderboard,
		submissionProgress,
		everyoneAnswered,
		remainingMs,
		formatCountdown
	} from '$lib/host/host-view';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';

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
	const rosterSize = $derived(Object.keys(participants).length);
</script>

<main class="mx-auto flex max-w-2xl flex-col gap-6 p-6">
	<header class="flex items-baseline justify-between">
		<h1 class="text-2xl font-semibold">Guess the Move — Host</h1>
		<p class="text-sm text-muted-foreground">
			Room <span class="font-mono font-medium tracking-widest">{code}</span>
			· {client.connected ? 'live' : 'connecting…'}
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
	{:else}
		<Card.Root>
			<Card.Header>
				<Card.Title>{phase === 'reveal' ? 'Reveal' : 'Round closed'}</Card.Title>
				<Card.Description>Top 5 leaderboard</Card.Description>
			</Card.Header>
			<Card.Content>
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
			</Card.Content>
			{#if phase === 'closed'}
				<Card.Footer>
					<Button onclick={() => client.reveal()}>Reveal</Button>
				</Card.Footer>
			{/if}
		</Card.Root>
	{/if}
</main>
