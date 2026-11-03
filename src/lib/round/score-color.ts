// Shared Guess/Round Score (-3..+3) color palette (#51), a prefactor for the Guess Group
// chart, the bucketed reveal list, and the Game Sheet points column to color-code scores
// consistently. Seven fixed hex values, mode-invariant (validated for use on both light and
// dark surfaces, same approach as the chart's prior ad hoc barColor — see commit 201ecfe) so
// no separate dark-theme table is needed.

const SCORE_COLORS: Record<number, string> = {
	3: '#0b6e0b', // dark green
	2: '#0ca30c', // green
	1: '#6fbf6f', // light green
	0: '#898781', // gray
	[-1]: '#e08a8a', // light red
	[-2]: '#d03b3b', // red
	[-3]: '#8f1f1f' // dark red
};

/** The color for a Guess/Round Score in -3..+3, for anything that color-codes a score. */
export function scoreColor(score: number): string {
	return SCORE_COLORS[score];
}

/** The Guess Group chart's own bar color (#83): the shadcn/olive theme's `--chart-1..4`
 *  tokens, keyed by a score's magnitude rather than `scoreColor`'s fixed semantic hex
 *  (0 lightest, 3 darkest) — sign is already conveyed by the bar's direction (up/down
 *  off `yBaseline={0}`) and its signed value label, so the ramp only needs to carry
 *  strength, not a separate good/bad hue. Unlike `scoreColor`, this tracks whatever the
 *  active theme's `--chart-N` custom properties resolve to rather than owning its own
 *  palette. */
export function chartScoreColor(score: number): string {
	return `var(--chart-${Math.abs(score) + 1})`;
}
