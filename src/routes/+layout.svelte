<script lang="ts">
	import { getLocale, setLocale, locales, type Locale } from '#lib/paraglide/runtime.js';
	import { m } from '#lib/paraglide/messages.js';
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

{@render children()}

<div class="pointer-events-none fixed right-2 bottom-2 z-50">
	<label
		class="pointer-events-auto flex items-center gap-1 rounded-md border bg-background/90 px-2 py-1 text-xs shadow-sm backdrop-blur"
	>
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
</div>
