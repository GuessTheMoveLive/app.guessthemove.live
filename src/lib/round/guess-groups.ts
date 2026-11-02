import type { ParticipantState } from './round-machine';
import { m } from '#lib/paraglide/messages.js';

// Guess Group breakdown at Reveal (#42). A Guess Group is every Participant who
// submitted the exact same move as their Guess in a Round (GLOSSARY: Guess Group);
// Participants who never submitted (timed out) share a single null-SAN group, so
// every Participant belongs to exactly one group. The bounded chart is a separate,
// coarser view — one bucket per distinct Round Score from -3 to +3 — deliberately
// decoupled from the exact-move grouping: the chart stays readable while the Guess
// Groups themselves are never collapsed into the chart's coarser tiers.

export interface GuessGroup {
	/** The exact SAN every member submitted, or null for those who never submitted. */
	san: string | null;
	/** The Round Score shared by every member — v1 Round Score == Guess Score, so a
	 *  Guess Group's members always score identically. */
	score: number;
	/** Every member's participant id. */
	participantIds: string[];
}

/** One bar of the bounded chart: a Round Score and how many Participants got it. */
export interface ScoreBucket {
	score: number;
	count: number;
}

export interface GuessGroupBreakdown {
	/** Every Guess Group with every member's name — the Host Display's full view. */
	groups: GuessGroup[];
	/** At most 7 buckets, one per Round Score present in -3..+3, ascending left to right;
	 *  a score nobody got is omitted entirely rather than shown empty. */
	buckets: ScoreBucket[];
}

/** The viewer's own Guess, named back to them, plus anyone else (excluding themselves)
 *  who submitted that exact same move — the one place a Participant's bucketed view is
 *  allowed to show a move's notation, since it's always their own (#53). */
export interface GuessGroupSentence {
	/** The exact SAN the viewer submitted, or null if they never submitted (timed out). */
	san: string | null;
	/** Other participants (excluding the viewer) in the same exact Guess Group — empty
	 *  when the viewer was alone. */
	others: string[];
}

/** A Participant's redacted, bucketed view of a closed Round's breakdown (#53): the same
 *  <=7 score buckets as the Host's chart, with no bucket showing a move's notation except
 *  via `sentence`, which belongs to whichever bucket's score equals `ownScore`. */
export interface ParticipantScoreBreakdown {
	buckets: ScoreBucket[];
	/** The Round Score of the viewer's own Guess Group — picks out which bucket carries
	 *  `sentence` (v1 Round Score == Guess Score, so this is unambiguous). */
	ownScore: number;
	sentence: GuessGroupSentence;
}

/** The SAN a Participant submitted, or null when they never locked in a Guess. */
function guessSan(state: ParticipantState): string | null {
	return state.status === 'submitted' || state.status === 'late' ? state.guess : null;
}

/**
 * Group a closed Round's Participants by exact-match Guess (SAN) into Guess Groups,
 * and tally the bounded per-Round-Score chart. Both read off the already-computed
 * `scores` map (see round-machine's closeRoundScores), so this is called only once a
 * Round has closed. Groups are ordered largest first (Kahoot-style); the chart buckets
 * ascend from the weakest Round Score (-3) to the strongest (+3), a fixed left-to-right
 * order independent of how the room happened to split (#73).
 */
export function computeGuessGroupBreakdown(
	participants: Record<string, ParticipantState>,
	scores: Record<string, number>
): GuessGroupBreakdown {
	const bySan = new Map<string | null, string[]>();
	for (const [id, state] of Object.entries(participants)) {
		const san = guessSan(state);
		const members = bySan.get(san);
		if (members) members.push(id);
		else bySan.set(san, [id]);
	}

	const groups: GuessGroup[] = [...bySan.entries()].map(([san, participantIds]) => ({
		san,
		score: scores[participantIds[0]] ?? 0,
		participantIds
	}));
	groups.sort(
		(a, b) =>
			b.participantIds.length - a.participantIds.length ||
			b.score - a.score ||
			(a.san ?? '').localeCompare(b.san ?? '')
	);

	const counts = new Map<number, number>();
	for (const id of Object.keys(participants)) {
		const score = scores[id] ?? 0;
		counts.set(score, (counts.get(score) ?? 0) + 1);
	}
	const buckets: ScoreBucket[] = [];
	for (let score = -3; score <= 3; score++) {
		const count = counts.get(score);
		if (count) buckets.push({ score, count });
	}

	return { groups, buckets };
}

/**
 * The label above a chart bar (#46): how many Participants landed on that Round Score,
 * pluralised through paraglide so "1 participant" / "2 participants" (and every locale's
 * own rule) stay out of the Svelte template. Participant terminology per the GLOSSARY,
 * not the "player" wording of the Guess Group list copy.
 */
export function chartParticipantLabel(count: number): string {
	return count === 1 ? m.chart_participants_one({ count }) : m.chart_participants_other({ count });
}

/**
 * The label below a chart bar (#46): the signed Round Score in points, pluralised so
 * "+1 point" / "-1 point" stay singular while "+2 points", "-3 points" and "0 points"
 * read plural. The sign is baked into the interpolated value, so every locale keeps the
 * leading "+"/"-" ahead of its own "point(s)" word.
 */
export function chartPointsLabel(score: number): string {
	const signed = `${score > 0 ? '+' : ''}${score}`;
	return Math.abs(score) === 1
		? m.chart_points_one({ score: signed })
		: m.chart_points_other({ score: signed });
}

/**
 * Build one Participant's redacted, bucketed view of a closed Round's breakdown (#53,
 * replacing #45's exact-move redaction, which leaked every group's SAN even with names
 * stripped). No bucket here ever carries a move's notation except through `sentence`,
 * built from the viewer's own exact-match Guess Group (minus themselves) — the one
 * group whose move is always safe to name back to its own members.
 */
export function bucketedBreakdownFor(
	breakdown: GuessGroupBreakdown,
	participantId: string
): ParticipantScoreBreakdown | null {
	const ownGroup = breakdown.groups.find((group) => group.participantIds.includes(participantId));
	if (!ownGroup) return null;

	return {
		buckets: breakdown.buckets,
		ownScore: ownGroup.score,
		sentence: {
			san: ownGroup.san,
			others: ownGroup.participantIds.filter((id) => id !== participantId)
		}
	};
}
