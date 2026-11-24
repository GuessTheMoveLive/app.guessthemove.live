import { describe, it, expect } from 'vitest';
import { gameCatalog, resolveGameData, isValidGameId } from './game-catalog';
import { openingNameFor } from './eco-openings';

describe('Game Catalog (#93)', () => {
	it('derives a catalog row with the White/Black/Year/Tournament/ECO/Move Count read off the game’s own headers', () => {
		const row = gameCatalog().find((r) => r.id === 'bernstein-capablanca')!;

		expect(row.white).toBe('Bernstein, Ossip Samuel');
		expect(row.black).toBe('Capablanca, Jose Raul');
		expect(row.year).toBe('1914');
		expect(row.event).toBe('Moscow Casual Games');
		expect(row.eco).toBe('D63');
		expect(row.moveCount).toBe(29); // PlyCount 58 ÷ 2
	});

	it('leaves WhiteElo/BlackElo blank (empty string, not null, not a placeholder) when the source PGN predates ratings', () => {
		const row = gameCatalog().find((r) => r.id === 'bernstein-capablanca')!;

		expect(row.whiteElo).toBe('');
		expect(row.blackElo).toBe('');
	});

	it('leaves WhiteElo/BlackElo blank on capablanca-marshall too — both cataloged games predate rated chess', () => {
		const row = gameCatalog().find((r) => r.id === 'capablanca-marshall')!;

		expect(row.whiteElo).toBe('');
		expect(row.blackElo).toBe('');
	});

	it('rounds Move Count up on an odd PlyCount', () => {
		const row = gameCatalog().find((r) => r.id === 'capablanca-marshall')!;

		expect(row.moveCount).toBe(39); // PlyCount 77 ÷ 2, rounded up
	});

	it('resolves a known ECO code to its opening name, and degrades to the bare code for an unknown one', () => {
		expect(openingNameFor('D63')).toBe("Queen's Gambit Declined");
		expect(openingNameFor('Z99')).toBeNull();

		const row = gameCatalog().find((r) => r.id === 'bernstein-capablanca')!;
		expect(row.openingDisplay).toBe("D63 — Queen's Gambit Declined");
	});

	it('never surfaces a game present under src/lib/data/ but absent from the manifest', () => {
		expect(isValidGameId('some-game-not-in-the-manifest')).toBe(false);
		expect(gameCatalog().some((r) => r.id === 'some-game-not-in-the-manifest')).toBe(false);
	});

	it('resolveGameData throws on an id outside the manifest', () => {
		expect(() => resolveGameData('not-cataloged')).toThrow();
	});

	it('isValidGameId is true for every manifest entry', () => {
		for (const row of gameCatalog()) {
			expect(isValidGameId(row.id)).toBe(true);
		}
	});
});
