<script lang="ts">
	import { flip } from 'svelte/animate';
	import { cubicOut } from 'svelte/easing';
	import type { LeaderboardEntry } from '#lib/host/host-view.js';
	import { m } from '#lib/paraglide/messages.js';

	// The shared, Kahoot-style Leaderboard rendering shown on both the Host control
	// screen and the Participant screen (#23, #34) - kept in one place so the two
	// never drift out of sync.
	//
	// Animated (#51): entering with `priorTotals` set, each row counts up from where the
	// Participant stood coming into this Round to their post-Reveal total, while any place
	// changes animate via FLIP — so the room sees the points just earned land, and places
	// swap, rather than the Leaderboard just snapping to its new order and numbers.

	interface Props {
		entries: LeaderboardEntry[];
		/** Participant to pick out with a highlighted border - the Participant screen's own row. */
		highlightId?: string;
		emptyMessage?: string;
		/** Each Participant's running total coming into this Round, so a row can count up
		 *  from there to its post-Reveal total instead of snapping straight to it. Omit (or
		 *  pass {}) for a view with nothing to animate from, e.g. the Finished phase's full
		 *  ranking — rows then just show their total with no count-up. */
		priorTotals?: Record<string, number>;
	}

	const {
		entries,
		highlightId,
		emptyMessage = m.leaderboard_empty(),
		priorTotals = {}
	}: Props = $props();

	let displayed = $state<Record<string, number>>({});

	$effect(() => {
		const targets = entries.map((e) => [e.participantId, e.total] as const);
		const duration = 600;
		const startedAt = performance.now();
		let raf: number;

		function tick() {
			const t = Math.min(1, (performance.now() - startedAt) / duration);
			const eased = cubicOut(t);
			const next: Record<string, number> = {};
			for (const [id, target] of targets) {
				const start = priorTotals[id] ?? target;
				next[id] = Math.round(start + (target - start) * eased);
			}
			displayed = next;
			if (t < 1) raf = requestAnimationFrame(tick);
		}
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	});
</script>

{#if entries.length === 0}
	<p class="text-sm text-muted-foreground">{emptyMessage}</p>
{:else}
	<ol class="flex flex-col gap-2">
		{#each entries as entry, i (entry.participantId)}
			<li
				animate:flip={{ duration: 400 }}
				class="flex items-center justify-between rounded-lg border px-3 py-2"
				class:border-primary={entry.participantId === highlightId}
			>
				<span class="flex items-center gap-3">
					<span class="w-5 text-right font-mono text-muted-foreground">{i + 1}</span>
					<span class="font-medium">{entry.participantId}</span>
				</span>
				<span class="font-mono tabular-nums">{displayed[entry.participantId] ?? entry.total}</span>
			</li>
		{/each}
	</ol>
{/if}
