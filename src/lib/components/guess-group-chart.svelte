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
	//
	// Bar height tracks the Round Score's own magnitude (#51), not how many Participants
	// landed on it: +3 stands three times as tall as +1 (same for -3/-2/-1), and 0 stands
	// half as tall as +1 — so the chart reads as a points scale at a glance, independent
	// of how the room happened to split across it.

	interface Props {
		buckets: ScoreBucket[];
		/** The viewer's own Round Score, to pick out their bar; null on the Host Display. */
		highlightScore?: number | null;
	}

	const { buckets, highlightScore = null }: Props = $props();

	/** Pixel height of the +1/-1 bar; every other bar scales off this unit. */
	const UNIT_PX = 24;

	function barHeight(score: number): number {
		return score === 0 ? UNIT_PX / 2 : Math.abs(score) * UNIT_PX;
	}

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
					style="height: {barHeight(bucket.score)}px; background-color: {barColor(
						bucket.score
					)};"
				></div>
				<span class="text-center text-xs font-medium tabular-nums">
					{chartPointsLabel(bucket.score)}
				</span>
			</div>
		{/each}
	</div>
{/if}
