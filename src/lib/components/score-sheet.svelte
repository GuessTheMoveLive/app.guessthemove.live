<script lang="ts">
	import type { MoveHistoryRow } from '#lib/round/participant-input.js';
	import { m } from '#lib/paraglide/messages.js';

	// A club-paper-form style move list (#40): two columns side by side, moves 1-20 on
	// the left and 21-40 on the right, each row's Black cell shaded to set it apart from
	// White's - modeled on SG Biel / Société d'échecs de Bienne's Partieformular
	// (doc/SG Biel Partieformular - Recto.pdf). All 40 rows are always drawn (blank until
	// reached) so the layout doesn't reflow move by move, same as a real paper sheet.
	// Shared by the Participant screen (phone width) and the Host Display (beamer
	// distance, #16) - a single shared move list, not one column per Participant.

	interface Props {
		rows: MoveHistoryRow[];
		white?: string;
		black?: string;
		event?: string;
		date?: string;
	}

	const { rows, white, black, event, date }: Props = $props();

	const ROWS_PER_HALF = 20;
	const byNumber = $derived(new Map(rows.map((row) => [row.number, row])));

	function half(start: number): { number: number; white: string | null; black: string | null }[] {
		return Array.from({ length: ROWS_PER_HALF }, (_, i) => {
			const number = start + i;
			const row = byNumber.get(number);
			return { number, white: row?.white ?? null, black: row?.black ?? null };
		});
	}

	const leftHalf = $derived(half(1));
	const rightHalf = $derived(half(ROWS_PER_HALF + 1));
</script>

<div class="rounded-lg border bg-background text-xs">
	{#if event || date || white || black}
		<div class="flex flex-col gap-0.5 border-b px-2 py-1.5 leading-tight">
			{#if event}
				<div class="truncate"><span class="text-muted-foreground">{m.score_sheet_tournament()}</span> {event}</div>
			{/if}
			{#if date}
				<div class="truncate"><span class="text-muted-foreground">{m.score_sheet_date()}</span> {date}</div>
			{/if}
			{#if white}
				<div class="truncate"><span class="text-muted-foreground">{m.score_sheet_white()}</span> {white}</div>
			{/if}
			{#if black}
				<div class="truncate"><span class="text-muted-foreground">{m.score_sheet_black()}</span> {black}</div>
			{/if}
		</div>
	{/if}

	<div class="grid grid-cols-2">
		{#each [leftHalf, rightHalf] as columnRows, col (col)}
			<div class:border-l={col === 1}>
				{#each columnRows as row (row.number)}
					<div class="grid grid-cols-[1.5em_1fr_1fr] items-center">
						<span class="px-1 text-right text-muted-foreground tabular-nums">{row.number}</span>
						<span class="truncate border-l px-1 py-0.5 font-mono">{row.white ?? ''}</span>
						<span class="truncate border-l bg-muted px-1 py-0.5 font-mono">{row.black ?? ''}</span>
					</div>
				{/each}
			</div>
		{/each}
	</div>
</div>
