// Regenerates docs/feedback-phrases.md — the deliverable 7x7x2 table of per-guess Reveal
// phrases from issue #43, for manual review. Run: `npx tsx scripts/gen-feedback-phrases.mts`.
// The phrases themselves live in Paraglide messages (messages/*.json); this only enumerates
// the lookup (feedbackPhrase) so the full table can be eyeballed without running the app.
import { writeFileSync } from 'node:fs';
import { EVAL_SYMBOLS, feedbackPhrase } from '../src/lib/round/feedback.ts';

const header = `# Feedback phrases (issue #43)

The per-guess Reveal wording, keyed by **(move-played eval symbol, guess eval symbol,
Featured Side colour)** — 7 × 7 × 2 = 98 entries. Generated from \`feedbackPhrase\` in
\`src/lib/round/feedback.ts\`; regenerate with \`npx tsx scripts/gen-feedback-phrases.mts\`.

Symbols map from the engine Evaluation (White's pawns perspective):
\`+-\` ≥ +3.0 · \`±\` +1.5..+3.0 · \`⩲\` +0.5..+1.5 · \`=\` −0.5..+0.5 · \`⩱\` −1.5..−0.5 ·
\`∓\` −3.0..−1.5 · \`-+\` ≤ −3.0. For a Black mover the perspective is mirrored, so the same
symbol pair reads as the opponent's. "Matched the move played" is simply the diagonal
(game symbol = guess symbol); it is never a hard-coded "best move" claim.

`;

let out = header;
for (const color of ['w', 'b'] as const) {
	out += `## Featured Side: ${color === 'w' ? 'White' : 'Black'}\n\n`;
	out += '| Move played ↓ / Guess → | ' + EVAL_SYMBOLS.map((s) => `\`${s}\``).join(' | ') + ' |\n';
	out += '| --- |' + EVAL_SYMBOLS.map(() => ' --- |').join('') + '\n';
	for (const game of EVAL_SYMBOLS) {
		const cells = EVAL_SYMBOLS.map((guess) => feedbackPhrase(game, guess, color));
		out += `| \`${game}\` | ` + cells.join(' | ') + ' |\n';
	}
	out += '\n';
}

writeFileSync(new URL('../docs/feedback-phrases.md', import.meta.url), out);
console.log('Wrote docs/feedback-phrases.md (98 phrases).');
