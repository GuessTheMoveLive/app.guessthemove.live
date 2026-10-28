import { describe, it, expect } from 'vitest';
import {
	FILES,
	DISPLAY_RANKS,
	pieceAt,
	sanToGlyph,
	resolveTapMove,
	buildMoveHistory
} from './participant-input';
import type { GameStep } from './game-data';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// Capablanca–Marshall after 4...Bg4, White to move its 5th move (#27 answer-key position).
const QUIZ_FEN = 'r2qkbnr/ppp2ppp/2np4/1B2p3/4P1b1/2P2N2/PP1P1PPP/RNBQK2R w KQkq - 1 5';

describe('coordinate axes (#24: full a–h / 1–8 on both axes)', () => {
	it('labels files a through h left to right', () => {
		expect(FILES).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
	});

	it('labels ranks 8 down to 1 top to bottom (White view)', () => {
		expect(DISPLAY_RANKS).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
	});
});

describe('pieceAt', () => {
	it('reads a white piece off the back rank', () => {
		expect(pieceAt(START_FEN, 'e1')).toEqual({ type: 'k', color: 'w' });
		expect(pieceAt(START_FEN, 'g1')).toEqual({ type: 'n', color: 'w' });
	});

	it('reads a black piece and a pawn', () => {
		expect(pieceAt(START_FEN, 'd8')).toEqual({ type: 'q', color: 'b' });
		expect(pieceAt(START_FEN, 'a7')).toEqual({ type: 'p', color: 'b' });
	});

	it('returns null for an empty square', () => {
		expect(pieceAt(START_FEN, 'e4')).toBeNull();
	});

	it('walks past empty runs encoded as digits', () => {
		expect(pieceAt(QUIZ_FEN, 'f3')).toEqual({ type: 'n', color: 'w' });
		expect(pieceAt(QUIZ_FEN, 'g4')).toEqual({ type: 'b', color: 'b' });
		expect(pieceAt(QUIZ_FEN, 'd4')).toBeNull();
	});
});

describe('sanToGlyph (standard PGN notation; only K/Q/R/B/N become glyphs)', () => {
	it('swaps a piece letter for its glyph', () => {
		expect(sanToGlyph('Nf3')).toBe('♞f3');
		expect(sanToGlyph('Qxe7')).toBe('♛xe7');
		expect(sanToGlyph('Rd1')).toBe('♜d1');
	});

	it('leaves a pawn move as plain SAN — no glyph prefix', () => {
		expect(sanToGlyph('e4')).toBe('e4');
		expect(sanToGlyph('exd5')).toBe('exd5');
	});

	it('keeps castling as written', () => {
		expect(sanToGlyph('O-O')).toBe('O-O');
		expect(sanToGlyph('O-O-O')).toBe('O-O-O');
	});

	it('keeps check and mate suffixes', () => {
		expect(sanToGlyph('Qh5+')).toBe('♛h5+');
		expect(sanToGlyph('Qf7#')).toBe('♛f7#');
	});

	it('converts a promotion piece letter to its glyph, pawn move itself stays plain', () => {
		expect(sanToGlyph('e8=Q')).toBe('e8=♛');
		expect(sanToGlyph('bxa1=N+')).toBe('bxa1=♞+');
	});
});

describe('resolveTapMove', () => {
	const candidates = ['d3', 'd4', 'h3', 'Ba4', 'Nbd2'];

	it('returns null when the origin square is empty (no piece to move)', () => {
		expect(resolveTapMove(QUIZ_FEN, 'd4', 'd5', candidates)).toBeNull();
	});

	it('returns null when the destination holds one of your own pieces', () => {
		// f1 bishop is gone (on b5); try the a1 rook onto its own b1 knight.
		expect(resolveTapMove(QUIZ_FEN, 'a1', 'b1', candidates)).toBeNull();
	});

	it('resolves a quiet pawn push to its exact answer-key SAN and glyph', () => {
		const move = resolveTapMove(QUIZ_FEN, 'd2', 'd4', candidates);
		expect(move).toMatchObject({ from: 'd2', to: 'd4', san: 'd4', glyph: 'd4', capture: false });
	});

	it('resolves to the listed SAN even when it carries a disambiguator', () => {
		// b1 knight, d2 empty; only one candidate (the disambiguated Nbd2) lands on d2.
		const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPP1PPPP/RNBQKBNR w KQkq - 0 1';
		const move = resolveTapMove(fen, 'b1', 'd2', ['Nbd2', 'Nd3']);
		expect(move?.san).toBe('Nbd2');
		expect(move?.glyph).toBe('♞bd2');
	});

	it('resolves the tapped knight when two candidates land on the same square', () => {
		// Both the b1 and f3 knights can reach d2 — the tap on b1 must resolve to
		// Nbd2, not fall through to the generic (unscored) "Nd2".
		const fen = 'rnbqkb1r/pppppppp/5n2/8/8/5N2/PPP1PPPP/RNBQKB1R w KQkq - 0 1';
		const candidates = ['Nbd2', 'Nfd2'];
		expect(resolveTapMove(fen, 'b1', 'd2', candidates)?.san).toBe('Nbd2');
		expect(resolveTapMove(fen, 'f3', 'd2', candidates)?.san).toBe('Nfd2');
	});

	it('flags a capture when the destination is occupied by the opponent', () => {
		const move = resolveTapMove(QUIZ_FEN, 'b5', 'c6', candidates);
		expect(move).toMatchObject({ capture: true, san: 'Bxc6', glyph: '♝xc6' });
	});

	it('names kingside castling when the king steps two files', () => {
		const move = resolveTapMove(QUIZ_FEN, 'e1', 'g1', candidates);
		expect(move?.san).toBe('O-O');
		expect(move?.glyph).toBe('O-O');
	});

	it('falls back to a best-effort SAN for a legal-looking move off the answer key', () => {
		const move = resolveTapMove(QUIZ_FEN, 'f3', 'g5', candidates);
		expect(move).toMatchObject({ san: 'Ng5', glyph: '♞g5', capture: false });
	});
});

function step(partial: Partial<GameStep> & { ply: number; san: string }): GameStep {
	return {
		color: partial.ply % 2 === 1 ? 'w' : 'b',
		fenBefore: '',
		fenAfter: '',
		moveNumber: null,
		playedComment: null,
		alternatives: [],
		...partial
	};
}

describe('buildMoveHistory (#24: glyph move list, paired by move number)', () => {
	it('pairs White and Black plies under their move number, in glyphs', () => {
		const history = buildMoveHistory([
			step({ ply: 1, san: 'e4' }),
			step({ ply: 2, san: 'e5' }),
			step({ ply: 3, san: 'Nf3' }),
			step({ ply: 4, san: 'Nc6' })
		]);

		expect(history).toEqual([
			{ number: 1, white: 'e4', black: 'e5' },
			{ number: 2, white: '♞f3', black: '♞c6' }
		]);
	});

	it('leaves Black blank on a trailing White move', () => {
		const history = buildMoveHistory([step({ ply: 1, san: 'e4' })]);
		expect(history).toEqual([{ number: 1, white: 'e4', black: null }]);
	});

	it('is empty with no moves played yet', () => {
		expect(buildMoveHistory([])).toEqual([]);
	});
});
