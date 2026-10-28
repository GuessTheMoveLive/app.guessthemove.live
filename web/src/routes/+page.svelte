<script lang="ts">
	import { goto } from '$app/navigation';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';

	let code = $state('');
	let hosting = $state(false);

	const normalized = $derived(code.trim().toUpperCase().replace(/\s+/g, ''));

	function enter(event: SubmitEvent) {
		event.preventDefault();
		if (!normalized) return;
		goto(`${hosting ? '/host' : '/play'}/${encodeURIComponent(normalized)}`);
	}
</script>

<main class="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-4">
	<header class="text-center">
		<h1 class="text-3xl font-semibold tracking-tight">Guess the Move</h1>
		<p class="mt-1 text-sm text-muted-foreground">Enter the Room Code shown on screen.</p>
	</header>

	<Card.Root>
		<Card.Content class="pt-6">
			<form class="flex flex-col gap-4" onsubmit={enter}>
				<input
					bind:value={code}
					placeholder="ROOM CODE"
					autocapitalize="characters"
					autocomplete="off"
					autocorrect="off"
					spellcheck="false"
					maxlength="12"
					aria-label="Room Code"
					class="w-full rounded-md border bg-background px-3 py-4 text-center font-mono text-2xl uppercase tracking-[0.3em] placeholder:tracking-normal placeholder:text-muted-foreground/50"
				/>
				<Button type="submit" size="lg" disabled={!normalized}>
					{hosting ? 'Open Host Display' : 'Join'}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<p class="text-center text-sm text-muted-foreground">
		<button
			type="button"
			class="underline underline-offset-4 hover:text-foreground"
			onclick={() => (hosting = !hosting)}
		>
			{hosting ? 'Joining as a player instead' : 'Hosting this session?'}
		</button>
	</p>
</main>
