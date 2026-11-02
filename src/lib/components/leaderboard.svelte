<script lang="ts">
	import { flip } from 'svelte/animate';
	import { cubicOut } from 'svelte/easing';
	import { priorRanking, roundDeltas, type LeaderboardEntry } from '#lib/host/host-view.js';
	import type { ParticipantState } from '#lib/round/round-machine.js';
	import { m } from '#lib/paraglide/messages.js';

	// The shared, Kahoot-style Leaderboard rendering shown on both the Host control
	// screen and the Participant screen (#23, #34) - kept in one place so the two
	// never drift out of sync.
	//
	// Animated as a slow, three-stage sequence (#51, fixed #55, rebuilt #68) so a room can
	// actually follow what just happened to them, entering with `priorTotals` set:
	//   1. Static: every row at its *prior*-Round ranking and total, no delta shown.
	//   2. Delta reveal (paused): still the prior order/totals, but each row that
	//      submitted a Guess this Round additionally shows its own point delta, e.g.
	//      "(+2)" - a row that didn't submit shows no delta label at all.
	//   3. Reorder + count-up (paused once more first): rows simultaneously FLIP to this
	//      Round's ranking while every total counts up (or down) to its post-Reveal
	//      value, over the same duration. Each row's rank-number badge only flips to its
	//      new value once that row has settled into its new slot - tracked separately
	//      from the order driving the FLIP animation itself, so the number never jumps
	//      ahead of the row it's labelling.

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
		/** Every Participant's current status, used only to decide whether a row's delta
		 *  label appears during the delta-reveal stage (#68) - required alongside
		 *  `priorTotals` for the staged reveal to compute deltas correctly; harmless to
		 *  omit when `priorTotals` is also omitted. */
		participants?: Record<string, ParticipantState>;
	}

	const {
		entries,
		highlightId,
		emptyMessage = m.leaderboard_empty(),
		priorTotals,
		participants
	}: Props = $props();

	/** Duration of the simultaneous FLIP reorder and count-up, in ms - also how long a
	 *  row's rank-number badge waits before flipping to its settled value. */
	const REORDER_MS = 900;
	/** Pause before the delta-reveal stage begins. */
	const DELTA_PAUSE_MS = 900;
	/** Further pause, after deltas are shown, before the reorder + count-up begins. */
	const REORDER_PAUSE_MS = 1200;

	let ordered = $state<LeaderboardEntry[]>(
		priorTotals ? priorRanking(entries, priorTotals) : entries
	);
	/** The order used only to compute each row's displayed rank-number badge - lags
	 *  behind `ordered` during the reorder stage so the number updates only once a row
	 *  has visually settled (#68). */
	let rankIds = $state<string[]>(ordered.map((e) => e.participantId));
	let displayed = $state<Record<string, number>>(
		Object.fromEntries(
			entries.map((e) => [
				e.participantId,
				priorTotals ? (priorTotals[e.participantId] ?? 0) : e.total
			])
		)
	);
	/** This Round's point delta per participant, shown only once the delta-reveal stage
	 *  starts; absent entirely (not just 0) for a participant with no delta to show. */
	let deltas = $state<Record<string, number>>({});

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
			rankIds = entries.map((e) => e.participantId);
			displayed = Object.fromEntries(entries.map((e) => [e.participantId, e.total]));
			deltas = {};
			return;
		}

		const key = JSON.stringify([entries, priorTotals]);
		if (key === revealedKey) return;
		revealedKey = key;

		const priorOrder = priorRanking(entries, priorTotals);
		const starts = Object.fromEntries(
			entries.map((e) => [e.participantId, priorTotals[e.participantId] ?? 0])
		);
		const roundDeltasByParticipant = roundDeltas(entries, priorTotals, participants ?? {});

		// Stage 1: static prior state - prior order, prior totals, no deltas.
		ordered = priorOrder;
		rankIds = priorOrder.map((e) => e.participantId);
		displayed = { ...starts };
		deltas = {};

		const timers: ReturnType<typeof setTimeout>[] = [];
		let countRaf: number;

		// Stage 2: delta reveal, after a pause - still the prior order and totals.
		timers.push(
			setTimeout(() => {
				deltas = roundDeltasByParticipant;
			}, DELTA_PAUSE_MS)
		);

		// Stage 3: reorder + count-up, after a further pause.
		timers.push(
			setTimeout(() => {
				ordered = entries;

				const startedAt = performance.now();
				function tick() {
					const t = Math.min(1, (performance.now() - startedAt) / REORDER_MS);
					const eased = cubicOut(t);
					const next: Record<string, number> = {};
					for (const entry of entries) {
						const start = starts[entry.participantId];
						next[entry.participantId] = Math.round(start + (entry.total - start) * eased);
					}
					displayed = next;
					if (t < 1) {
						countRaf = requestAnimationFrame(tick);
					} else {
						// Only now has every row settled into its new slot - flip the rank-number
						// badges to match (#68).
						rankIds = entries.map((e) => e.participantId);
					}
				}
				countRaf = requestAnimationFrame(tick);
			}, DELTA_PAUSE_MS + REORDER_PAUSE_MS)
		);

		return () => {
			for (const timer of timers) clearTimeout(timer);
			cancelAnimationFrame(countRaf);
		};
	});
</script>

{#if entries.length === 0}
	<p class="text-sm text-muted-foreground">{emptyMessage}</p>
{:else}
	<ol class="flex flex-col gap-2">
		{#each ordered as entry (entry.participantId)}
			{@const delta = deltas[entry.participantId]}
			<li
				animate:flip={{ duration: REORDER_MS }}
				class="flex items-center justify-between rounded-lg border px-3 py-2"
				class:border-primary={entry.participantId === highlightId}
			>
				<span class="flex items-center gap-3">
					<span class="w-5 text-right font-mono text-muted-foreground">
						{rankIds.indexOf(entry.participantId) + 1}
					</span>
					<span class="font-medium">{entry.participantId}</span>
					{#if delta != null}
						<span class="font-mono text-xs text-muted-foreground tabular-nums">
							({delta > 0 ? '+' : ''}{delta})
						</span>
					{/if}
				</span>
				<span class="font-mono tabular-nums">{displayed[entry.participantId] ?? entry.total}</span>
			</li>
		{/each}
	</ol>
{/if}
