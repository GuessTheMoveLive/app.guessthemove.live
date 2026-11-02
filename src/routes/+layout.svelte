<script lang="ts">
	import { getLocale, setLocale, locales, type Locale } from '#lib/paraglide/runtime.js';
	import { m } from '#lib/paraglide/messages.js';
	import { headerContext } from '#lib/round/header-context.svelte.js';
	import { phaseLabel } from '#lib/round/phase-label.js';
	import { appVersion } from '#lib/app-version.js';
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import favicon32 from '#lib/assets/favicon-32.png';
	import appleTouchIcon from '#lib/assets/apple-touch-icon.png';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// Human-readable labels for the manual switcher; chess move notation is never
	// translated, but the language names themselves are shown in their own language.
	const LOCALE_NAMES: Record<Locale, string> = {
		en: 'English',
		de: 'Deutsch',
		fr: 'Français',
		es: 'Español'
	};

	// Browser-language auto-detect happens via the `preferredLanguage` strategy; this
	// manual override (#41) writes the `cookie` strategy's value (which takes precedence)
	// and reloads so the whole tree re-renders in the chosen locale.
	function switchLocale(event: Event) {
		setLocale((event.currentTarget as HTMLSelectElement).value as Locale);
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} type="image/svg+xml" />
	<link rel="icon" href={favicon32} sizes="32x32" type="image/png" />
	<link rel="apple-touch-icon" href={appleTouchIcon} />
</svelte:head>

<div class="flex min-h-screen flex-col">
	<!-- Sticky header (#73): app name, plus the current Room Code/phase once a Host or
	     Participant page has one to report (headerContext is null on routes with no
	     Session, e.g. the home page) — `sticky` rather than `fixed` so it occupies real
	     layout space and never overlaps content even on a short/landscape viewport. -->
	<header
		class="sticky top-0 z-40 flex items-center justify-between gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur"
	>
		<span class="truncate font-semibold">{m.app_title()}</span>
		{#if headerContext.roomCode}
			<span class="shrink-0 text-xs text-muted-foreground">
				{m.room_label()}
				<span class="font-mono tracking-widest">{headerContext.roomCode}</span>
				{#if headerContext.phase}
					· {phaseLabel(headerContext.phase)}
				{/if}
			</span>
		{/if}
	</header>

	<div class="flex-1">
		{@render children()}
	</div>

	<!-- Sticky footer (#73): the running build's version plus the locale switcher, which
	     used to float fixed over the bottom-right corner and could overlap content on a
	     small screen — now part of the normal page flow instead. -->
	<footer
		class="sticky bottom-0 z-40 flex items-center justify-between gap-2 border-t bg-background/95 px-4 py-2 backdrop-blur"
	>
		<span class="text-xs text-muted-foreground">v{appVersion}</span>
		<label class="flex items-center gap-1 rounded-md border bg-background/90 px-2 py-1 text-xs">
			<span class="sr-only">{m.locale_label()}</span>
			<select
				class="bg-transparent text-foreground focus:outline-none"
				aria-label={m.locale_label()}
				value={getLocale()}
				onchange={switchLocale}
			>
				{#each locales as locale (locale)}
					<option value={locale}>{LOCALE_NAMES[locale]}</option>
				{/each}
			</select>
		</label>
	</footer>
</div>
