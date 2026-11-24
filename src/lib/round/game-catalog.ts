import bernsteinCapablanca from '../data/bernstein-capablanca.json';
import capablancaMarshall from '../data/capablanca-marshall.json';
import type { GameData } from './game-data';
import { openingNameFor } from './eco-openings';

// The Game Catalog manifest (#93, ADR 0009): a small, explicit, developer-maintained
// list of Candidate Games the Host can pick from in the Lobby. A built game JSON under
// src/lib/data/ only becomes selectable once it's deliberately added here — dropping a
// new file into that directory does nothing on its own.
interface ManifestEntry {
	id: string;
	data: GameData;
}

const MANIFEST: ManifestEntry[] = [
	{ id: 'bernstein-capablanca', data: bernsteinCapablanca as unknown as GameData },
	{ id: 'capablanca-marshall', data: capablancaMarshall as unknown as GameData }
];

/** One row of the Lobby's Game Catalog table — every display fact read straight off
 *  the cataloged game's own PGN-derived headers, never hand-authored (#93). */
export interface CatalogRow {
	id: string;
	white: string;
	black: string;
	/** Blank (empty string, never null, never a placeholder) on a game whose PGN
	 *  predates Elo ratings. */
	whiteElo: string;
	blackElo: string;
	year: string | null;
	event: string | null;
	/** The bare ECO code, e.g. "D63", or null if the game's PGN carries none. */
	eco: string | null;
	/** "D63 — Queen's Gambit Declined", or just the bare code when the ECO isn't in
	 *  eco-openings.ts's lookup table — never an invented name. Empty when there's no
	 *  ECO code at all. */
	openingDisplay: string;
	/** PlyCount ÷ 2, rounded up — the number of moves a Host should expect to run
	 *  through, not the raw ply count. */
	moveCount: number;
}

/** The GameData for one manifest-listed Candidate Game. Throws on an id outside the
 *  manifest — callers (SessionRoom, the Host/Participant screens) only ever reach this
 *  with an id that was itself validated by `isValidGameId` at selection time. */
export function resolveGameData(gameId: string): GameData {
	const entry = MANIFEST.find((e) => e.id === gameId);
	if (!entry) throw new Error(`Unknown Game Catalog id: ${gameId}`);
	return entry.data;
}

/** Whether `gameId` is one of the manifest's entries — used to reject a `select_game`
 *  for anything outside the Game Catalog (#93), defensively re-checked server-side even
 *  though the Host's own UI only ever offers manifest ids to begin with. */
export function isValidGameId(gameId: string): boolean {
	return MANIFEST.some((e) => e.id === gameId);
}

function yearFromPgnDate(date: string | undefined): string | null {
	const year = date?.split('.')[0];
	return year && year !== '????' ? year : null;
}

function moveCountFromPlyCount(plyCount: string | undefined): number {
	return Math.ceil(Number(plyCount ?? 0) / 2);
}

function openingDisplayFor(eco: string | null): string {
	if (!eco) return '';
	const name = openingNameFor(eco);
	return name ? `${eco} — ${name}` : eco;
}

/** Every Game Catalog row, in manifest order — the Lobby's source for its game-selection
 *  table (#93). */
export function gameCatalog(): CatalogRow[] {
	return MANIFEST.map(({ id, data }) => {
		const headers = data.headers;
		const eco = headers.ECO ?? null;
		return {
			id,
			white: headers.White ?? '',
			black: headers.Black ?? '',
			whiteElo: headers.WhiteElo ?? '',
			blackElo: headers.BlackElo ?? '',
			year: yearFromPgnDate(headers.Date),
			event: headers.Event ?? null,
			eco,
			openingDisplay: openingDisplayFor(eco),
			moveCount: moveCountFromPlyCount(headers.PlyCount)
		};
	});
}
