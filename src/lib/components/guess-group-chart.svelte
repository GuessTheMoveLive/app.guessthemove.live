<script lang="ts">
	import {
		chartParticipantLabel,
		chartPointsLabel,
		type ScoreBucket
	} from '#lib/round/guess-groups.js';
	import { scoreColor } from '#lib/round/score-color.js';

	// True diverging bar chart of a Round's bounded Guess Group breakdown (#42, made
	// diverging in #54): one bar per Round Score present in -3..+3, on a visible 0
	// baseline. Positive-score bars grow upward above the baseline, negative-score bars
	// grow downward below it, and the 0 bucket's bar sits right at the baseline. Left-
	// to-right order simply follows `buckets`' own order — weakest (-3) to strongest
	// (+3), per computeGuessGroupBreakdown (#73) — rather than any sign-based layout rule
	// in this component. Each bar is colored via the shared score palette (#51) instead
	// of a flat positive/negative/zero color. Each bar is labelled on two lines (#46):
	// "N participant(s)" at its outer tip (farthest from the baseline) and the signed
	// "+N points"/"-N points" right at the baseline — the points line is a deliberate
	// second channel beside color, so the palette is never the only cue (colorblind-
	// safe). Both lines are pluralised through paraglide (see chart*Label in
	// guess-groups).
	//
	// Bar height tracks the Round Score's own magnitude (#51), not how many Participants
	// landed on it: +3 stands three times as tall as +1 (same for -3/-2/-1), and 0 stands
	// half as tall as +1 — so the chart reads as a points scale at a glance, independent
	// of how the room happened to split across it. The participant-count label lives in
	// its own row outside the bar's fixed-height zone (#68) so its own height never
	// shrinks the bar it sits above/below.

	interface Props {
		buckets: ScoreBucket[];
		/** The viewer's own Round Score, to pick out their bar; null on the Host Display. */
		highlightScore?: number | null;
	}

	const { buckets, highlightScore = null }: Props = $props();

	/** Pixel height of the +1/-1 bar; every other bar scales off this unit. */
	const UNIT_PX = 24;

	/** Fixed height of the area above/below the baseline, sized for the max |score| of 3. */
	const ZONE_PX = 3 * UNIT_PX;

	function barHeight(score: number): number {
		return score === 0 ? UNIT_PX / 2 : Math.abs(score) * UNIT_PX;
	}
</script>

{#if buckets.length}
	<div class="flex items-start justify-center gap-2">
		{#each buckets as bucket (bucket.score)}
			<div class="flex min-w-9 flex-1 flex-col items-center" style="max-width: 4rem;">
				<!-- The participant-count label sits in its own, unconstrained row above the bar
				     zone (#68) — sharing the fixed-height zone with the bar let the label's own
				     height eat into how tall the bar visually read, so a +3 bar never looked
				     three times a +1 bar even though barHeight()'s pixel math was already correct. -->
				<div class="flex h-4 w-full items-end justify-center">
					{#if bucket.score >= 0}
						<span class="text-center text-xs text-muted-foreground tabular-nums">
							{chartParticipantLabel(bucket.count)}
						</span>
					{/if}
				</div>
				<div class="flex w-full flex-col items-center justify-end" style="height: {ZONE_PX}px;">
					{#if bucket.score >= 0}
						<div
							class="w-full rounded-t"
							class:ring-2={bucket.score === highlightScore}
							class:ring-primary={bucket.score === highlightScore}
							class:ring-offset-1={bucket.score === highlightScore}
							style="height: {barHeight(bucket.score)}px; background-color: {scoreColor(
								bucket.score
							)};"
						></div>
					{/if}
				</div>
				<div class="w-full border-t border-border pt-1">
					<span class="block text-center text-xs font-medium tabular-nums">
						{chartPointsLabel(bucket.score)}
					</span>
				</div>
				<div class="flex w-full flex-col items-center justify-start" style="height: {ZONE_PX}px;">
					{#if bucket.score < 0}
						<div
							class="w-full rounded-b"
							class:ring-2={bucket.score === highlightScore}
							class:ring-primary={bucket.score === highlightScore}
							class:ring-offset-1={bucket.score === highlightScore}
							style="height: {barHeight(bucket.score)}px; background-color: {scoreColor(
								bucket.score
							)};"
						></div>
					{/if}
				</div>
				<div class="flex h-4 w-full items-start justify-center">
					{#if bucket.score < 0}
						<span class="text-center text-xs text-muted-foreground tabular-nums">
							{chartParticipantLabel(bucket.count)}
						</span>
					{/if}
				</div>
			</div>
		{/each}
	</div>
{/if}
