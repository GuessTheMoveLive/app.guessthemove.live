<script lang="ts">
	import { resolve } from '$app/paths';
	import { getLocale, setLocale, locales, type Locale } from '#lib/paraglide/runtime.js';
	import { m } from '#lib/paraglide/messages.js';
	import { appVersion } from '#lib/app-version.js';
	import { headerContext } from '#lib/round/header-context.svelte.js';
	import { connectionColor, connectionLabel } from '#lib/round/connection-status.js';
	import HeaderMenu from '#lib/components/header-menu.svelte';
	import * as Select from '#lib/components/ui/select/index.js';
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import favicon32 from '#lib/assets/favicon-32.png';
	import appleTouchIcon from '#lib/assets/apple-touch-icon.png';
	import type { LayoutProps } from './$types';

	// Inlined (unlike the homepage's plain <img src="/logo.svg">) because the header needs
	// the logo's second path to pick up `currentColor` from the Host's inverted `.dark`
	// scope - an <img>'s external SVG document has no access to the page's CSS, so
	// `currentColor` there just resolves to the initial black regardless of context.
	import logoMarkup from '../../static/logo.svg?raw';

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
	function switchLocale(value: string) {
		setLocale(value as Locale);
	}

	// The Host's menu is the one piece of per-route data only the Host page ever sets
	// (the Participant screen never reports menuItems), so it doubles as the "is this the
	// Host screen" signal driving the fully inverted header/footer below.
	const isHost = $derived(headerContext.menuItems != null);
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
	     Host screen gets this bar (and the footer below) fully inverted, by scoping the
	     site's own `.dark` token set to just this element - every `bg-background`/
	     `text-muted-foreground`/etc. below already flips consistently, no per-element
	     color overrides needed. `sticky` rather than `fixed` so it occupies real layout
	     space and never overlaps content even on a short/landscape viewport. -->
	<header
		class={[
			'sticky top-0 z-40 grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b bg-background/95 px-4 py-2 text-foreground backdrop-blur',
			isHost && 'dark'
		]}
	>
		<a href={resolve('/')} class="flex min-w-0 items-center gap-2 justify-self-start">
			<span class="h-6 w-6 shrink-0 text-foreground [&>svg]:h-full [&>svg]:w-full">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- static build-time import of our own logo.svg, not user input -->
				{@html logoMarkup}
			</span>
			<span class="truncate font-semibold">{m.app_title()}</span>
		</a>
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

	<!-- Sticky footer (#73): the running build's version on the left and the locale
	     switcher on the right, which used to float fixed over the bottom-right corner
	     and could overlap content on a small screen — now part of the normal page flow
	     instead. Center column (#93): the Participant's own running standing and the
	     points-still-to-be-made nudge, set via headerContext same as the header above —
	     stays empty on the Host screen and before any Round has scored. Inverted on the
	     Host screen alongside the header, same `.dark`-scoping trick - except the
	     Select's own dropdown panel, which bits-ui portals out to <body> and so sits
	     outside this footer's DOM subtree; it gets the `dark` class directly so it still
	     matches. -->
	<footer
		class={[
			'sticky bottom-0 z-40 grid grid-cols-[auto_1fr_auto] items-center gap-2 border-t bg-background/95 px-4 py-2 text-foreground backdrop-blur',
			isHost && 'dark'
		]}
	>
		<span class="shrink-0 justify-self-start text-xs text-muted-foreground">v{appVersion}</span>
		<div class="justify-self-center text-center text-xs leading-tight text-muted-foreground">
			{#if headerContext.footerLine1}
				<p>{headerContext.footerLine1}</p>
			{/if}
			{#if headerContext.footerLine2}
				<p>{headerContext.footerLine2}</p>
			{/if}
		</div>
		<div class="justify-self-end">
			<Select.Root type="single" value={getLocale()} onValueChange={switchLocale}>
				<Select.Trigger size="sm" aria-label={m.locale_label()}>
					{LOCALE_NAMES[getLocale()]}
				</Select.Trigger>
				<Select.Content class={isHost ? 'dark' : undefined}>
					{#each locales as locale (locale)}
						<Select.Item value={locale} label={LOCALE_NAMES[locale]} />
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
	</footer>
</div>
