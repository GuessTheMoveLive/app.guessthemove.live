<script lang="ts">
	import { scaleBand } from 'd3-scale';
	import { BarChart } from 'layerchart';
	import * as Chart from '#lib/components/ui/chart/index.js';
	import {
		chartParticipantLabel,
		chartPointsLabel,
		type ScoreBucket
	} from '#lib/round/guess-groups.js';
	import { scoreColor } from '#lib/round/score-color.js';

	// True diverging bar chart of a Round's bounded Guess Group breakdown (#42, made
	// diverging in #54), rebuilt on shadcn-svelte/layerchart's BarChart (#73, modeled on
	// its "Bar Chart - Label" and "Bar Chart - Negative" examples) rather than hand-rolled
	// divs. `y` is each bucket's own score, with `yBaseline={0}` giving the same
	// diverging-from-zero shape as before: positive scores grow up, negative grow down.
	// Left-to-right order simply follows `buckets`' own order — weakest (-3) to strongest
	// (+3), per computeGuessGroupBreakdown (#73). The participant count is rendered as
	// each bar's label (pluralised via chartParticipantLabel); the signed score itself is
	// the x-axis tick (chartPointsLabel), so color is never the only cue distinguishing a
	// bucket (colorblind-safe).

	/** A literal score of 0 would plot a zero-height bar right on the baseline — invisible
	 *  — so its bar height stands in at half of the +1/-1 bar's, same as the old hand-
	 *  rolled chart; only the bar's height is nudged, `x`/`c` still key off the bucket's
	 *  real score. */
	function barValue(score: number): number {
		return score === 0 ? 0.5 : score;
	}

	interface Props {
		buckets: ScoreBucket[];
		/** The viewer's own Round Score, to pick out their bar; null on the Host Display. */
		highlightScore?: number | null;
	}

	const { buckets, highlightScore = null }: Props = $props();

	// Each bar's color comes from scoreColor(), keyed by that bucket's own score — a
	// fixed domain/range pair covering every possible score rather than just the ones in
	// `buckets` this Round, so a bucket's color never shifts depending on which other
	// buckets happen to be present. `c` must resolve through this explicit cScale
	// (BarChart's own default `cRange` is a single placeholder color) for per-bar
	// coloring to take effect at all. scoreColor's fixed semantic hex gives positive
	// scores green, 0 gray, and negative scores red, matching the Game Sheet and reveal
	// list's coloring of the same scores.
	const SCORES = [-3, -2, -1, 0, 1, 2, 3];
	const scoreColorRange = SCORES.map((score) => scoreColor(score));

	// Only used for Chart.Container's required `config` prop — this chart colors bars
	// directly by score (see `c`/`cDomain`/`cRange` below) rather than through a named
	// series, so there's nothing else for the config to carry.
	const chartConfig = {
		count: { label: 'Participants' }
	} satisfies Chart.ChartConfig;
</script>

{#if buckets.length}
	<Chart.Container config={chartConfig} class="aspect-auto h-48">
		<BarChart
			data={buckets}
			x="score"
			xScale={scaleBand().padding(0.3)}
			y={(d: ScoreBucket) => barValue(d.score)}
			yBaseline={0}
			yDomain={[-3, 3]}
			c="score"
			cDomain={SCORES}
			cRange={scoreColorRange}
			axis="x"
			labels={{
				value: (d: ScoreBucket) => chartParticipantLabel(d.count),
				offset: 8
			}}
			props={{
				bars: {
					stroke: 'var(--primary)',
					strokeWidth: (d: ScoreBucket) => (d.score === highlightScore ? 3 : 0),
					radius: 6,
					rounded: 'all'
				},
				xAxis: {
					format: (d: number) => chartPointsLabel(d)
				}
			}}
		/>
	</Chart.Container>
{/if}
