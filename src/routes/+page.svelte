<script lang="ts">
	import { goto } from '$app/navigation';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { m } from '#lib/paraglide/messages.js';

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
		<h1 class="text-3xl font-semibold tracking-tight">{m.app_title()}</h1>
		<p class="mt-1 text-sm text-muted-foreground">{m.home_subtitle()}</p>
	</header>

	<Card.Root>
		<Card.Content class="pt-6">
			<form class="flex flex-col gap-4" onsubmit={enter}>
				<input
					bind:value={code}
					placeholder={m.room_code_placeholder()}
					autocapitalize="characters"
					autocomplete="off"
					autocorrect="off"
					spellcheck="false"
					maxlength="12"
					aria-label={m.room_code_label()}
					class="w-full rounded-md border bg-background px-3 py-4 text-center font-mono text-2xl uppercase tracking-[0.3em] placeholder:tracking-normal placeholder:text-muted-foreground/50"
				/>
				<Button type="submit" size="lg" disabled={!normalized}>{m.join_button()}</Button>
			</form>
		</Card.Content>
	</Card.Root>

	<!-- No typed code for hosting (#37) - the server generates the Room Code and Host
	     Token together and redirects straight to the Host's own control URL. -->
	<form method="POST" action="/create-session" class="text-center">
		<button type="submit" class="text-sm underline underline-offset-4 hover:text-foreground">
			{m.home_host_link()}
		</button>
	</form>
</main>
