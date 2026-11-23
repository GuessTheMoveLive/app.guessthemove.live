import type { ConnectionStatus } from './connection-status.js';

export interface HeaderMenuItem {
	label: string;
	onclick: () => void;
	variant?: 'default' | 'destructive';
	// Confirm-armed actions (Reset/End Game/Delete all arm on a first click and only act
	// on a second) need the menu to stay open between the two clicks, or the second click
	// never lands - set false for those and let an outside click/Escape close it instead.
	closeOnClick?: boolean;
}

// A tiny shared rune-backed singleton letting the Host/Participant pages hand their own
// Room Code, connection status and round progress up to the layout-level sticky header,
// since +layout.svelte has no page-derived content of its own to follow as precedent for
// page-to-layout data flow. Same "exported singleton with $state fields" shape as
// SessionClient (session-client.svelte.ts) - the one reactivity pattern this codebase
// already uses for cross-component state outside a single component's own `$props`.
class HeaderContext {
	roomCode = $state<string | null>(null);
	status = $state<ConnectionStatus | null>(null);
	roundCurrent = $state<number | null>(null);
	roundTotal = $state<number | null>(null);
	// Host-only: the three-dot menu's items. Stays null on the Participant screen, which
	// has no session-management actions of its own.
	menuItems = $state<HeaderMenuItem[] | null>(null);
}

export const headerContext = new HeaderContext();
