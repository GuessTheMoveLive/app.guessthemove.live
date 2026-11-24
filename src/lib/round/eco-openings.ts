// English-only ECO-code → opening-name lookup (#93), shipped as a static table rather
// than hand-authored per cataloged game — see ADR 0009. Deliberately not exhaustive (the
// full ECO volume runs to hundreds of codes); callers must degrade gracefully (bare code,
// no name) for anything missing here rather than treat an absent entry as an error.
// Names are family-level (e.g. "Ruy Lopez", not "Ruy Lopez, Old Steinitz Defense") to
// match the catalog's one-line-per-game display.
export const ECO_OPENINGS: Record<string, string> = {
	A00: 'Irregular Opening',
	A04: 'Reti Opening',
	A10: 'English Opening',
	A40: "Queen's Pawn Game",
	A45: "Queen's Pawn Game",
	A80: 'Dutch Defense',
	B00: "King's Pawn Opening",
	B01: 'Scandinavian Defense',
	B06: 'Modern Defense',
	B07: 'Pirc Defense',
	B10: 'Caro-Kann Defense',
	B20: 'Sicilian Defense',
	C00: 'French Defense',
	C20: "King's Pawn Game",
	C25: 'Vienna Game',
	C30: "King's Gambit",
	C41: 'Philidor Defense',
	C42: "Petrov's Defense",
	C44: 'Scotch Game',
	C45: 'Scotch Game',
	C50: 'Italian Game',
	C53: 'Giuoco Piano',
	C60: 'Ruy Lopez',
	C62: 'Ruy Lopez',
	C65: 'Ruy Lopez',
	D00: "Queen's Pawn Game",
	D06: "Queen's Gambit",
	D10: "Queen's Gambit Declined, Slav Defense",
	D20: "Queen's Gambit Accepted",
	D30: "Queen's Gambit Declined",
	D63: "Queen's Gambit Declined",
	D70: 'Neo-Grünfeld Defense',
	D80: 'Grünfeld Defense',
	E00: 'Catalan Opening',
	E20: 'Nimzo-Indian Defense',
	E60: "King's Indian Defense"
};

/** The looked-up opening name for an ECO code, or null if it isn't in the table —
 *  callers show the bare ECO code in that case rather than inventing a name. */
export function openingNameFor(eco: string): string | null {
	return ECO_OPENINGS[eco] ?? null;
}
