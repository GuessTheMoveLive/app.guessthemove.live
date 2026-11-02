import type { RoundStateValue } from './snapshot';
import { m } from '#lib/paraglide/messages.js';

/**
 * A short, human phase label for the sticky header (#73) — reuses each phase's own
 * existing Host-facing title copy rather than introducing a parallel set of messages
 * to keep translated (both routes already show one of these as a Card title).
 */
export function phaseLabel(phase: RoundStateValue): string {
	switch (phase) {
		case 'lobby':
			return m.host_lobby_title();
		case 'active':
			return m.host_active_title();
		case 'closed':
			return m.host_closed_title();
		case 'reveal':
			return m.host_reveal_title();
		case 'opponentResponse':
			return m.opponent_response_title();
		case 'finished':
			return m.final_results_title();
	}
}
