import { describe, it, expect } from 'vitest';
import { recordedGuesses } from './guess-history';

describe('recordedGuesses', () => {
	it('includes a submitted Guess', () => {
		const guesses = recordedGuesses({ alice: { status: 'submitted', guess: 'e4' } });
		expect(guesses).toEqual({ alice: 'e4' });
	});

	it('includes a late Guess', () => {
		const guesses = recordedGuesses({ alice: { status: 'late', guess: 'e4' } });
		expect(guesses).toEqual({ alice: 'e4' });
	});

	it('omits a pending participant entirely, rather than recording an empty Guess', () => {
		const guesses = recordedGuesses({ alice: { status: 'pending' } });
		expect(guesses).toEqual({});
		expect('alice' in guesses).toBe(false);
	});

	it('omits a timed-out participant entirely, distinct from an empty-string Guess', () => {
		const guesses = recordedGuesses({ alice: { status: 'timedOut' } });
		expect(guesses).toEqual({});
		expect('alice' in guesses).toBe(false);
	});

	it('handles a mix of statuses across participants', () => {
		const guesses = recordedGuesses({
			alice: { status: 'submitted', guess: 'e4' },
			bob: { status: 'timedOut' },
			carol: { status: 'late', guess: 'd4' },
			dave: { status: 'pending' }
		});
		expect(guesses).toEqual({ alice: 'e4', carol: 'd4' });
	});
});
