<script lang="ts">
	import { flip } from 'svelte/animate';
	import { cubicOut } from 'svelte/easing';
	import { priorRanking, type LeaderboardEntry } from '#lib/host/host-view.js';
	import { m } from '#lib/paraglide/messages.js';

	// The shared, Kahoot-style Leaderboard rendering shown on both the Host control
	// screen and the Participant screen (#23, #34) - kept in one place so the two
	// never drift out of sync.
	//
	// Animated (#51, fixed #55): entering with `priorTotals` set, this first renders every
	// row at its *prior*-Round ranking and total, then - on the very next frame, so the
	// first frame actually paints - simultaneously reorders to this Round's ranking (via
	// FLIP) and counts every total up to its post-Reveal value. One single, room-wide
	// reveal, not a staggered one-row-at-a-time animation.

	interface Props {
		entries: LeaderboardEntry[];
		/** Participant to pick out with a highlighted border - the Participant screen's own row. */
		highlightId?: string;
		emptyMessage?: string;
		/** Each Participant's running total coming into this Round, so a row can render at
		 *  its prior ranking and count up from there to its post-Reveal total/order instead
		 *  of snapping straight to them. Omit entirely for a view with nothing to animate
		 *  from, e.g. the Finished phase's full ranking - rows then just show their current
		 *  total and order, no reveal. Pass `{}` (as opposed to omitting) for a genuine
		 *  Round 1, where every prior total really is 0 - that still animates. */
		priorTotals?: Record<string, number>;
	}

	const {
		entries,
		highlightId,
		emptyMessage = m.leaderboard_empty(),
		priorTotals
	}: Props = $props();

	let ordered = $state<LeaderboardEntry[]>(
		priorTotals ? priorRanking(entries, priorTotals) : entries
	);
	let displayed = $state<Record<string, number>>(
		Object.fromEntries(
			entries.map((e) => [
				e.participantId,
				priorTotals ? (priorTotals[e.participantId] ?? 0) : e.total
			])
		)
	);

	// A broadcast snapshot can arrive again for reasons that have nothing to do with this
	// Round's score (another Participant joining, a reconnect) - each one hands this
	// component a freshly-derived `entries`/`priorTotals` even when their content hasn't
	// moved. Without this guard, every such broadcast would replay the reveal from
	// scratch. Keyed on content, not identity, so only an actual score change re-reveals.
	let revealedKey: string | null = null;

	$effect(() => {
		if (!priorTotals) {
			// Nothing to reveal from (e.g. the Finished phase's full ranking) - just mirror
			// `entries` directly, with no animation.
			ordered = entries;
			displayed = Object.fromEntries(entries.map((e) => [e.participantId, e.total]));
			return;
		}

		const key = JSON.stringify([entries, priorTotals]);
		if (key === revealedKey) return;
		revealedKey = key;

		const targets = entries.map((e) => [e.participantId, e.total] as const);
		// A participant missing from `priorTotals` entirely (e.g. every participant, on
		// Round 1 - `priorTotals` arrives as `{}`, not `{alice: 0, bob: 0, ...}`) came into
		// this Round at 0, same as the round-machine's own scoring - not at their post-
		// Reveal total, which would collapse the count-up to nothing.
		const starts = Object.fromEntries(
			entries.map((e) => [e.participantId, priorTotals[e.participantId] ?? 0])
		);
		ordered = priorRanking(entries, priorTotals);
		displayed = Object.fromEntries(targets.map(([id]) => [id, starts[id]]));

		// Let the prior-ranking frame actually paint, then flip to this Round's order and
		// start counting up on the very next frame - both land together, across every row.
		let tickRaf: number;
		const revealRaf = requestAnimationFrame(() => {
			ordered = entries;

			const duration = 600;
			const startedAt = performance.now();

			function tick() {
				const t = Math.min(1, (performance.now() - startedAt) / duration);
				const eased = cubicOut(t);
				const next: Record<string, number> = {};
				for (const [id, target] of targets) {
					const start = starts[id];
					next[id] = Math.round(start + (target - start) * eased);
				}
				displayed = next;
				if (t < 1) tickRaf = requestAnimationFrame(tick);
			}
			tickRaf = requestAnimationFrame(tick);
		});

		return () => {
			cancelAnimationFrame(revealRaf);
			cancelAnimationFrame(tickRaf);
		};
	});
</script>

{#if entries.length === 0}
	<p class="text-sm text-muted-foreground">{emptyMessage}</p>
{:else}
	<ol class="flex flex-col gap-2">
		{#each ordered as entry, i (entry.participantId)}
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
