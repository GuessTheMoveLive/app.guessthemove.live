import { describe, it, expect } from 'vitest';
import { phaseLabel } from './phase-label';
import { m } from '#lib/paraglide/messages.js';
import type { RoundStateValue } from './snapshot';

describe('phaseLabel (#73: sticky header phase indicator)', () => {
	it('maps every round phase to its own existing title copy', () => {
		const cases: Array<[RoundStateValue, string]> = [
			['lobby', m.host_lobby_title()],
			['active', m.host_active_title()],
			['closed', m.host_closed_title()],
			['reveal', m.host_reveal_title()],
			['opponentResponse', m.opponent_response_title()],
			['finished', m.final_results_title()]
		];
		for (const [phase, expected] of cases) {
			expect(phaseLabel(phase)).toBe(expected);
		}
	});
});
