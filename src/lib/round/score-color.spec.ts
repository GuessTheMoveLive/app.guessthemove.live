import { describe, it, expect } from 'vitest';
import { scoreColor } from './score-color';

describe('scoreColor', () => {
	it('maps every integer in -3..+3 to a distinct color', () => {
		const colors = [-3, -2, -1, 0, 1, 2, 3].map(scoreColor);
		expect(new Set(colors).size).toBe(7);
	});

	it('is symmetric: a negative score and its positive mirror never share a color', () => {
		expect(scoreColor(-1)).not.toBe(scoreColor(1));
		expect(scoreColor(-2)).not.toBe(scoreColor(2));
		expect(scoreColor(-3)).not.toBe(scoreColor(3));
	});

	it('is pure: the same score always returns the same color', () => {
		expect(scoreColor(2)).toBe(scoreColor(2));
	});
});
