import type { GameStep } from './game-data';

// Pure move-resolution and glyph-rendering logic for the v1 Participant guess-input
// screen (#33). Per #24 the Participant never sees a board position: they tap an
// origin square then a destination square on an empty coordinate grid, and we
// resolve that against the (hidden) Featured Game position into a glyph-rendered
// confirmation — Unicode piece glyphs only, never SAN letters like "N"/"B"/"Q".
//
// These are pure functions so the move/glyph logic is unit-tested here; the screen
// wiring (tap handling, countdown, WebSocket SUBMIT) is verified by running the app.

export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PieceColor = 'w' | 'b';

export interface Piece {
	type: PieceType;
	color: PieceColor;
}

/** Files left-to-right across the grid. */
export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
/** Ranks top-to-bottom down the grid, White's view (#24: full coordinates on both axes). */
export const DISPLAY_RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

const PIECE_GLYPH: Record<PieceType, string> = {
	k: '♚',
	q: '♛',
	r: '♜',
	b: '♝',
	n: '♞',
	p: '♟'
};

const SAN_LETTER_TO_TYPE: Record<string, PieceType> = {
	K: 'k',
	Q: 'q',
	R: 'r',
	B: 'b',
	N: 'n'
};

const TYPE_TO_SAN_LETTER: Record<Exclude<PieceType, 'p'>, string> = {
	k: 'K',
	q: 'Q',
	r: 'R',
	b: 'B',
	n: 'N'
};

function fileIndex(square: string): number {
	return square.charCodeAt(0) - 'a'.charCodeAt(0);
}

/** The piece standing on a square in a FEN position, or null if the square is empty. */
export function pieceAt(fen: string, square: string): Piece | null {
	const file = fileIndex(square);
	const rank = Number(square[1]);
	const rows = fen.split(' ')[0].split('/');
	const row = rows[8 - rank];
	if (!row) return null;

	let f = 0;
	for (const ch of row) {
		if (ch >= '1' && ch <= '9') {
			f += Number(ch);
			continue;
		}
		if (f === file) {
			const color: PieceColor = ch === ch.toUpperCase() ? 'w' : 'b';
			return { type: ch.toLowerCase() as PieceType, color };
		}
		f += 1;
	}
	return null;
}

/**
 * Render a SAN move in standard PGN notation, except K/Q/R/B/N letters (piece-to-move
 * and promotion piece) become their Unicode glyphs. Pawn moves are left exactly as
 * standard SAN (e.g. "e4", "exd5") — no glyph is prefixed, unlike a figurine-only
 * notation that would mark every move with a piece symbol.
 */
export function sanToGlyph(san: string): string {
	if (san === 'O-O' || san === 'O-O-O') return san;

	const withPromo = san.replace(
		/=([QRBN])/g,
		(_, letter: string) => `=${PIECE_GLYPH[SAN_LETTER_TO_TYPE[letter]]}`
	);
	const leadType = SAN_LETTER_TO_TYPE[withPromo[0]];
	if (leadType) return PIECE_GLYPH[leadType] + withPromo.slice(1);
	return withPromo;
}

/** The destination square a SAN lands on, or null for castling (which names no square). */
function sanDestination(san: string): string | null {
	if (san.startsWith('O-O')) return null;
	const squares = san.match(/[a-h][1-8]/g);
	return squares ? squares[squares.length - 1] : null;
}

/** The moving piece's type implied by a SAN: its leading letter, else a pawn. */
function sanPieceType(san: string): PieceType {
	if (san.startsWith('O-O')) return 'k';
	return SAN_LETTER_TO_TYPE[san[0]] ?? 'p';
}

/** The disambiguation fragment of a SAN — the file, rank, or full square inserted
 *  between the piece letter and the destination when two of the mover's pieces could
 *  reach the same square (e.g. "Nbd2"'s "b", "N1d2"'s "1", or a full "Nb1d2"'s "b1").
 *  Empty when the SAN carries no disambiguation. */
function sanDisambiguation(san: string): string {
	let rest = SAN_LETTER_TO_TYPE[san[0]] ? san.slice(1) : san;
	rest = rest.replace('x', '');
	return rest.slice(0, rest.length - 2);
}

/** Whether a (possibly disambiguated) SAN could have been played from `from` — true
 *  when the SAN carries no disambiguation (nothing to check) or its file/rank/square
 *  fragment matches `from`. */
function sanMatchesOrigin(san: string, from: string): boolean {
	const disambiguation = sanDisambiguation(san);
	if (!disambiguation) return true;
	if (disambiguation.length === 2) return disambiguation === from;
	return disambiguation === from[0] || disambiguation === from[1];
}

function fallbackSan(piece: Piece, from: string, to: string, capture: boolean): string {
	if (piece.type === 'p') {
		return capture ? `${from[0]}x${to}` : to;
	}
	return `${TYPE_TO_SAN_LETTER[piece.type]}${capture ? 'x' : ''}${to}`;
}

export interface ResolvedMove {
	from: string;
	to: string;
	piece: Piece;
	capture: boolean;
	/** SAN for the move — the exact answer-key SAN when the tap matches a scored move. */
	san: string;
	/** The glyph-rendered confirmation shown before the Participant commits (#24). */
	glyph: string;
}

/**
 * Resolve a tapped origin→destination against the (hidden) Featured Game position.
 * Returns null when the tap can't form a move — an empty origin square, or a
 * destination already holding one of the mover's own pieces. When the tap matches
 * a move in the answer key (`candidateSans`), that exact SAN is returned so the
 * Guess scores correctly (#32); otherwise a best-effort SAN is built for the
 * glyph confirmation of a move the engine never graded (it scores 0 anyway).
 */
export function resolveTapMove(
	fen: string,
	from: string,
	to: string,
	candidateSans: string[]
): ResolvedMove | null {
	const piece = pieceAt(fen, from);
	if (!piece) return null;

	const occupant = pieceAt(fen, to);
	if (occupant && occupant.color === piece.color) return null;
	const capture = occupant != null;

	let san: string;
	if (piece.type === 'k' && Math.abs(fileIndex(to) - fileIndex(from)) === 2) {
		san = fileIndex(to) > fileIndex(from) ? 'O-O' : 'O-O-O';
	} else {
		const destMatches = candidateSans.filter(
			(candidate) => sanPieceType(candidate) === piece.type && sanDestination(candidate) === to
		);
		// Two of the mover's pieces can both reach `to` (e.g. knights on b1 and f3 both
		// eyeing d2), so the answer key disambiguates each SAN by file/rank/square — use
		// that to pick the one actually tapped, instead of always falling back to the
		// unscored generic SAN whenever more than one candidate lands on the square.
		const matches =
			destMatches.length > 1
				? destMatches.filter((candidate) => sanMatchesOrigin(candidate, from))
				: destMatches;
		san = matches.length === 1 ? matches[0] : fallbackSan(piece, from, to, capture);
	}

	return { from, to, piece, capture, san, glyph: sanToGlyph(san) };
}

export interface MoveHistoryRow {
	number: number;
	white: string | null;
	black: string | null;
}

/**
 * The glyph-rendered move list shown to the Participant (#24) — moves already
 * played in the Featured Game up to the current Round, paired under their move
 * number. Glyph notation only, never SAN letter abbreviations.
 */
export function buildMoveHistory(steps: GameStep[]): MoveHistoryRow[] {
	const rows: MoveHistoryRow[] = [];
	for (const step of steps) {
		const number = Math.floor((step.ply - 1) / 2) + 1;
		let row = rows[rows.length - 1];
		if (!row || row.number !== number) {
			row = { number, white: null, black: null };
			rows.push(row);
		}
		if (step.color === 'w') row.white = sanToGlyph(step.san);
		else row.black = sanToGlyph(step.san);
	}
	return rows;
}
