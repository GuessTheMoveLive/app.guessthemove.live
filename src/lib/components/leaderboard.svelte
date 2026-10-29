<script lang="ts">
	import type { LeaderboardEntry } from '#lib/host/host-view.js';
	import { m } from '#lib/paraglide/messages.js';

	// The shared, Kahoot-style Leaderboard rendering shown on both the Host control
	// screen and the Participant screen (#23, #34) - kept in one place so the two
	// never drift out of sync.

	interface Props {
		entries: LeaderboardEntry[];
		/** Participant to pick out with a highlighted border - the Participant screen's own row. */
		highlightId?: string;
		emptyMessage?: string;
	}

	const { entries, highlightId, emptyMessage = m.leaderboard_empty() }: Props = $props();
</script>

{#if entries.length === 0}
	<p class="text-sm text-muted-foreground">{emptyMessage}</p>
{:else}
	<ol class="flex flex-col gap-2">
		{#each entries as entry, i (entry.participantId)}
			<li
				class="flex items-center justify-between rounded-lg border px-3 py-2"
				class:border-primary={entry.participantId === highlightId}
			>
				<span class="flex items-center gap-3">
					<span class="w-5 text-right font-mono text-muted-foreground">{i + 1}</span>
					<span class="font-medium">{entry.participantId}</span>
				</span>
				<span class="font-mono tabular-nums">{entry.total}</span>
			</li>
		{/each}
	</ol>
{/if}
