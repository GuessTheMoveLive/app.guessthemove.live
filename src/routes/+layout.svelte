<script lang="ts">
	import { getLocale, setLocale, locales, type Locale } from '#lib/paraglide/runtime.js';
	import { m } from '#lib/paraglide/messages.js';
	import { appVersion } from '#lib/app-version.js';
	import { headerContext } from '#lib/round/header-context.svelte.js';
	import { connectionColor, connectionLabel } from '#lib/round/connection-status.js';
	import HeaderMenu from '#lib/components/header-menu.svelte';
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import favicon32 from '#lib/assets/favicon-32.png';
	import appleTouchIcon from '#lib/assets/apple-touch-icon.png';
	import type { LayoutProps } from './$types';

	// Served straight out of /static (#92) - no bundler import needed for a file already
	// at a fixed, known URL.
	const logo = '/logo.svg';

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
	<!-- Sticky header: logo/app name on the left always, plus the current Room Code,
	     connection status, round progress and (Host only) a session-actions menu once a
	     Host/Participant page has reported them via headerContext — null on routes with
	     no Session (e.g. the home page), where the center/right columns stay empty. The
	     Host's own menu (headerContext.menuItems) is the signal for the slightly gray
	     background, since that's the one case this bar carries destructive actions.
	     `sticky` rather than `fixed` so it occupies real layout space and never overlaps
	     content even on a short/landscape viewport. -->
	<header
		class={[
			'sticky top-0 z-40 grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b px-4 py-2 backdrop-blur',
			headerContext.menuItems ? 'bg-muted/60' : 'bg-background/95'
		]}
	>
		<div class="flex min-w-0 items-center gap-2 justify-self-start">
			<img src={logo} alt="" class="h-6 w-6 shrink-0" />
			<span class="truncate font-semibold">{m.app_title()}</span>
		</div>
		<div class="shrink-0 justify-self-center text-sm font-medium text-muted-foreground">
			{#if headerContext.roundTotal != null && headerContext.roundCurrent != null}
				{m.round_x_of_y({ current: headerContext.roundCurrent, total: headerContext.roundTotal })}
			{/if}
		</div>
		<div class="flex items-center gap-2 justify-self-end">
			{#if headerContext.roomCode}
				<span class="flex items-center gap-1.5 text-xs text-muted-foreground">
					{m.room_label()}
					<span class="font-mono tracking-widest">{headerContext.roomCode}</span>
					{#if headerContext.status}
						<span class="inline-flex items-center gap-1 text-xs font-medium">
							<span
								class="size-2 shrink-0 rounded-full"
								style="background-color: {connectionColor(headerContext.status)};"
							></span>
							{connectionLabel(headerContext.status)}
						</span>
					{/if}
				</span>
			{/if}
			{#if headerContext.menuItems}
				<HeaderMenu label={m.host_menu_label()} items={headerContext.menuItems} />
			{/if}
		</div>
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
