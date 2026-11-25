import { m } from '#lib/paraglide/messages.js';

// The Room Code line's connection chip (#92): a small color cue for SessionClient's three
// `status` values, same fixed-hex/mode-invariant approach as score-color.ts so no separate
// dark-theme table is needed.

const CONNECTION_COLORS = {
	live: '#0ca30c', // green
	connecting: '#c8960c', // amber
	broken: '#d03b3b' // red
} as const;

export type ConnectionStatus = keyof typeof CONNECTION_COLORS;

export function connectionColor(status: ConnectionStatus): string {
	return CONNECTION_COLORS[status];
}

export function connectionLabel(status: ConnectionStatus): string {
	switch (status) {
		case 'live':
			return m.status_live();
		case 'connecting':
			return m.status_connecting();
		case 'broken':
			return m.status_broken();
	}
}
