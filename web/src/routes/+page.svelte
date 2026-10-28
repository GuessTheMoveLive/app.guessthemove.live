<script lang="ts">
	import { goto } from '$app/navigation';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';

	let code = $state('');

	const normalized = $derived(code.trim().toUpperCase().replace(/\s+/g, ''));

	function enter(event: SubmitEvent) {
		event.preventDefault();
		if (!normalized) return;
		goto(`/play/${encodeURIComponent(normalized)}`);
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
				<Button type="submit" size="lg" disabled={!normalized}>Join</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<!-- No typed code for hosting (#37) - the server generates the Room Code and Host
	     Token together and redirects straight to the Host's own control URL. -->
	<form method="POST" action="/create-session" class="text-center">
		<button type="submit" class="text-sm underline underline-offset-4 hover:text-foreground">
			Hosting this session?
		</button>
	</form>
</main>
