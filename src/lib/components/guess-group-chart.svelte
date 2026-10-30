<script lang="ts">
	import {
		chartParticipantLabel,
		chartPointsLabel,
		type ScoreBucket
	} from '#lib/round/guess-groups.js';

	// Kahoot-style diverging bar chart of a Round's bounded Guess Group breakdown (#42):
	// one bar per Round Score present in -3..+3, left (negative) to right (positive),
	// green for positive scores, red for negative, neutral gray for zero. Each bar is
	// labelled on two lines (#46): "N participant(s)" above it and the signed "+N
	// points"/"-N points" below it — the points line is a deliberate second channel
	// beside color, so the red/green split is never the only cue (colorblind-safe).
	// Both lines are pluralised through paraglide (see chart*Label in guess-groups).
	// Bar sizing is a first pass, intentionally rough — it'll be iterated on separately.

	interface Props {
		buckets: ScoreBucket[];
		/** The viewer's own Round Score, to pick out their bar; null on the Host Display. */
		highlightScore?: number | null;
	}

	const { buckets, highlightScore = null }: Props = $props();

	const maxCount = $derived(Math.max(1, ...buckets.map((b) => b.count)));

	// Status palette (validated for >=3:1 on both light and dark surfaces, mode-invariant).
	function barColor(score: number): string {
		if (score > 0) return '#0ca30c';
		if (score < 0) return '#d03b3b';
		return '#898781';
	}
</script>

{#if buckets.length}
	<div class="flex items-end justify-center gap-2" style="height: 7rem;">
		{#each buckets as bucket (bucket.score)}
			<div
				class="flex min-w-9 flex-1 flex-col items-center justify-end gap-1"
				style="max-width: 4rem;"
			>
				<span class="text-center text-xs text-muted-foreground tabular-nums">
					{chartParticipantLabel(bucket.count)}
				</span>
				<div
					class="w-full rounded-t"
					class:ring-2={bucket.score === highlightScore}
					class:ring-primary={bucket.score === highlightScore}
					class:ring-offset-1={bucket.score === highlightScore}
					style="height: {Math.round(
						(bucket.count / maxCount) * 80
					)}px; min-height: 4px; background-color: {barColor(bucket.score)};"
				></div>
				<span class="text-center text-xs font-medium tabular-nums">
					{chartPointsLabel(bucket.score)}
				</span>
			</div>
		{/each}
	</div>
{/if}
