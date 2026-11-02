import type { RoundStateValue } from './snapshot';

// A tiny shared rune-backed singleton (#73) letting the Host/Participant pages hand
// their own Room Code and phase up to the layout-level sticky header, since
// +layout.svelte has no page-derived content of its own to follow as precedent for
// page-to-layout data flow. Same "exported singleton with $state fields" shape as
// SessionClient (session-client.svelte.ts) — the one reactivity pattern this codebase
// already uses for cross-component state outside a single component's own `$props`.
class HeaderContext {
	roomCode = $state<string | null>(null);
	phase = $state<RoundStateValue | null>(null);
}

export const headerContext = new HeaderContext();
