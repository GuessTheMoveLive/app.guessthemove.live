<script lang="ts">
	import type { GameSheetMove, GameSheetRow } from '#lib/round/game-sheet.js';
	import { scoreColor } from '#lib/round/score-color.js';
	import { m } from '#lib/paraglide/messages.js';

	// The Participant's own Game Sheet (#58): the same club-paper-form move list as
	// score-sheet.svelte (#40), decorated per move with this participant's Guess (blank
	// when it matched, the Guess itself when it didn't, an em-dash on a timeout) and the
	// points that move earned, always shown and colored via the shared -3..+3 palette
	// (#51). Kept as its own component rather than folded into score-sheet.svelte since
	// the Host's score sheet has no per-participant Guess to show.

	interface Props {
		rows: GameSheetRow[];
		white?: string;
		black?: string;
		event?: string;
		date?: string;
	}

	const { rows, white, black, event, date }: Props = $props();

	const ROWS_PER_HALF = 20;
	const byNumber = $derived(new Map(rows.map((row) => [row.number, row])));

	function half(
		start: number
	): { number: number; white: GameSheetMove | null; black: GameSheetMove | null }[] {
		return Array.from({ length: ROWS_PER_HALF }, (_, i) => {
			const number = start + i;
			const row = byNumber.get(number);
			return { number, white: row?.white ?? null, black: row?.black ?? null };
		});
	}

	const leftHalf = $derived(half(1));
	const rightHalf = $derived(half(ROWS_PER_HALF + 1));

	// A single mode-invariant accent for a mismatched Guess — distinct from both the move
	// column's default text color and the -3..+3 score palette, same fixed-hex approach as
	// score-color.ts so no separate dark-theme variant is needed.
	const GUESS_COLOR = '#b8860b';

	function pointsLabel(points: number): string {
		return points > 0 ? `+${points}` : `${points}`;
	}
</script>

<div class="rounded-lg border bg-background text-xs">
	{#if event || date || white || black}
		<div class="flex flex-col gap-0.5 border-b px-2 py-1.5 leading-tight">
			{#if event}
				<div class="truncate">
					<span class="text-muted-foreground">{m.score_sheet_tournament()}</span>
					{event}
				</div>
			{/if}
			{#if date}
				<div class="truncate">
					<span class="text-muted-foreground">{m.score_sheet_date()}</span>
					{date}
				</div>
			{/if}
			{#if white}
				<div class="truncate">
					<span class="text-muted-foreground">{m.score_sheet_white()}</span>
					{white}
				</div>
			{/if}
			{#if black}
				<div class="truncate">
					<span class="text-muted-foreground">{m.score_sheet_black()}</span>
					{black}
				</div>
			{/if}
		</div>
	{/if}

	<div class="grid grid-cols-2">
		{#each [leftHalf, rightHalf] as columnRows, col (col)}
			<div class:border-l={col === 1}>
				{#each columnRows as row (row.number)}
					<div class="grid grid-cols-[1.5em_1fr_1fr] items-center">
						<span class="px-1 text-right text-muted-foreground tabular-nums">{row.number}</span>
						{#each [row.white, row.black] as move, side (side)}
							<div class="flex flex-col border-l px-1 py-0.5 font-mono" class:bg-muted={side === 1}>
								<span class="truncate">{move?.san ?? ''}</span>
								{#if move?.guess}
									<span class="flex items-baseline gap-1 text-[0.7em] leading-tight">
										{#if move.guess.text}
											<span class="truncate" style="color: {GUESS_COLOR};">{move.guess.text}</span>
										{/if}
										<span class="tabular-nums" style="color: {scoreColor(move.guess.points)};">
											{pointsLabel(move.guess.points)}
										</span>
									</span>
								{/if}
							</div>
						{/each}
					</div>
				{/each}
			</div>
		{/each}
	</div>
</div>
