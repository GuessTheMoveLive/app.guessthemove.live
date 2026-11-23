<script lang="ts">
	import { DotsThreeVertical } from 'phosphor-svelte';
	import { cn } from '#lib/utils.js';
	import type { HeaderMenuItem } from '#lib/round/header-context.svelte.js';

	let { label, items }: { label: string; items: HeaderMenuItem[] } = $props();

	let open = $state(false);
	let rootEl = $state<HTMLDivElement | null>(null);

	function toggle() {
		open = !open;
	}

	function close() {
		open = false;
	}

	function handleItemClick(item: HeaderMenuItem) {
		item.onclick();
		if (item.closeOnClick ?? true) close();
	}

	// Closes on an outside click or Escape - only wired up while the menu is actually
	// open, so idle pages pay nothing for a document-level listener.
	$effect(() => {
		if (!open) return;
		function onDocClick(event: MouseEvent) {
			if (rootEl && !rootEl.contains(event.target as Node)) close();
		}
		function onKeydown(event: KeyboardEvent) {
			if (event.key === 'Escape') close();
		}
		document.addEventListener('click', onDocClick);
		document.addEventListener('keydown', onKeydown);
		return () => {
			document.removeEventListener('click', onDocClick);
			document.removeEventListener('keydown', onKeydown);
		};
	});
</script>

<div class="relative" bind:this={rootEl}>
	<button
		type="button"
		aria-label={label}
		aria-haspopup="menu"
		aria-expanded={open}
		onclick={(e) => {
			e.stopPropagation();
			toggle();
		}}
		class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
	>
		<DotsThreeVertical class="size-4" weight="bold" />
	</button>
	{#if open}
		<div
			role="menu"
			class="absolute top-full right-0 z-50 mt-1 flex min-w-36 flex-col gap-0.5 rounded-md border bg-popover p-1 shadow-md"
		>
			{#each items as item (item.label)}
				<button
					type="button"
					role="menuitem"
					onclick={() => handleItemClick(item)}
					class={cn(
						'rounded px-2 py-1.5 text-left text-sm hover:bg-muted',
						item.variant === 'destructive' && 'text-destructive hover:bg-destructive/10'
					)}
				>
					{item.label}
				</button>
			{/each}
		</div>
	{/if}
</div>
