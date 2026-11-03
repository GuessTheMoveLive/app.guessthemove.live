import { describe, it, expect } from 'vitest';
import { scoreColor, chartScoreColor } from './score-color';

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

describe('chartScoreColor', () => {
	it('resolves through the theme chart-N tokens, keyed by magnitude', () => {
		expect(chartScoreColor(0)).toBe('var(--chart-1)');
		expect(chartScoreColor(1)).toBe('var(--chart-2)');
		expect(chartScoreColor(2)).toBe('var(--chart-3)');
		expect(chartScoreColor(3)).toBe('var(--chart-4)');
	});

	it('is symmetric: a negative score and its positive mirror share the same token', () => {
		expect(chartScoreColor(-1)).toBe(chartScoreColor(1));
		expect(chartScoreColor(-2)).toBe(chartScoreColor(2));
		expect(chartScoreColor(-3)).toBe(chartScoreColor(3));
	});

	it('is pure: the same score always returns the same token', () => {
		expect(chartScoreColor(-2)).toBe(chartScoreColor(-2));
	});
});
