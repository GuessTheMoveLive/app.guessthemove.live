<script lang="ts">
	import { onMount } from 'svelte';
	import { fly, scale } from 'svelte/transition';
	import type { LeaderboardEntry } from '#lib/host/host-view.js';

	// Kahoot-style final-ranking reveal: suspense comes from revealing the podium
	// back-to-front — third place, then second, then first — instead of dumping the
	// whole ranking on screen at once like every other Reveal between Rounds.

	interface Props {
		/** The top 3 by running total, highest first (host-view's topLeaderboard(totals, 3)). */
		entries: LeaderboardEntry[];
		highlightId?: string;
	}

	const { entries, highlightId }: Props = $props();

	const first = $derived(entries[0]);
	const second = $derived(entries[1]);
	const third = $derived(entries[2]);

	// 0 = nothing revealed yet, 1 = third shown, 2 = +second, 3 = +first.
	let revealed = $state(0);

	onMount(() => {
		const timers = [
			setTimeout(() => (revealed = 1), 300),
			setTimeout(() => (revealed = 2), 1400),
			setTimeout(() => (revealed = 3), 2500)
		];
		return () => timers.forEach(clearTimeout);
	});
</script>

<div class="flex items-end justify-center gap-3 py-2">
	{#if second}
		<div class="flex w-24 flex-col items-center justify-end gap-1">
			<div class="flex min-h-16 flex-col items-center justify-end gap-1">
				{#if revealed >= 2}
					<div
						in:fly={{ y: 24, duration: 400 }}
						class="flex flex-col items-center gap-0.5 rounded-lg px-2 py-1"
						class:ring-2={second.participantId === highlightId}
						class:ring-primary={second.participantId === highlightId}
					>
						<span class="text-2xl">🥈</span>
						<span class="w-full max-w-24 truncate text-center text-sm font-medium"
							>{second.participantId}</span
						>
						<span class="font-mono text-sm text-muted-foreground tabular-nums">{second.total}</span>
					</div>
				{/if}
			</div>
			<div class="h-16 w-full rounded-t-md bg-muted"></div>
		</div>
	{/if}

	{#if first}
		<div class="flex w-28 flex-col items-center justify-end gap-1">
			<div class="flex min-h-20 flex-col items-center justify-end gap-1">
				{#if revealed >= 3}
					<div
						in:scale={{ duration: 450, start: 0.6 }}
						class="flex flex-col items-center gap-0.5 rounded-lg px-2 py-1"
						class:ring-2={first.participantId === highlightId}
						class:ring-primary={first.participantId === highlightId}
					>
						<span class="text-4xl">🥇</span>
						<span class="w-full max-w-28 truncate text-center text-base font-semibold"
							>{first.participantId}</span
						>
						<span class="font-mono text-base text-muted-foreground tabular-nums">{first.total}</span
						>
					</div>
				{/if}
			</div>
			<div class="h-24 w-full rounded-t-md bg-primary/20"></div>
		</div>
	{/if}

	{#if third}
		<div class="flex w-24 flex-col items-center justify-end gap-1">
			<div class="flex min-h-16 flex-col items-center justify-end gap-1">
				{#if revealed >= 1}
					<div
						in:fly={{ y: 24, duration: 400 }}
						class="flex flex-col items-center gap-0.5 rounded-lg px-2 py-1"
						class:ring-2={third.participantId === highlightId}
						class:ring-primary={third.participantId === highlightId}
					>
						<span class="text-2xl">🥉</span>
						<span class="w-full max-w-24 truncate text-center text-sm font-medium"
							>{third.participantId}</span
						>
						<span class="font-mono text-sm text-muted-foreground tabular-nums">{third.total}</span>
					</div>
				{/if}
			</div>
			<div class="h-10 w-full rounded-t-md bg-muted"></div>
		</div>
	{/if}
</div>
