<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/env';
	import { page } from '$app/state';
	import { SessionClient } from '#lib/round/session-client.svelte.js';
	import {
		remainingMs,
		formatCountdown,
		topLeaderboard,
		finishedMessageFor
	} from '#lib/host/host-view.js';
	import { getGameData, quizSteps, opponentResponseSteps } from '#lib/round/game-data.js';
	import {
		FILES,
		DISPLAY_RANKS,
		resolveTapMove,
		formatNumberedMove,
		formatContinuation,
		type ResolvedMove
	} from '#lib/round/participant-input.js';
	import { buildParticipantFeedback, explanationText } from '#lib/round/feedback.js';
	import { buildGameSheet } from '#lib/round/game-sheet.js';
	import { buildParticipantPgn, roundsActuallyPlayed } from '#lib/round/pgn.js';
	import {
		computeGuessGroupBreakdown,
		bucketedBreakdownFor,
		chartParticipantLabel
	} from '#lib/round/guess-groups.js';
	import { scoreColor } from '#lib/round/score-color.js';
	import { m } from '#lib/paraglide/messages.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import Leaderboard from '#lib/components/leaderboard.svelte';
	import Podium from '#lib/components/podium.svelte';
	import GameSheet from '#lib/components/game-sheet.svelte';
	import GuessGroupChart from '#lib/components/guess-group-chart.svelte';

	const code = page.params.code ?? '';
	const client = new SessionClient();
	const game = getGameData();

	// A rejoin (dropped connection, refresh, closed tab) must land back on the same
	// identity, or the Participant's whole running total appears to vanish - it's
	// actually still sitting in SessionRoom under their old name, just unreachable
	// because nothing remembered what that name was. Persisting it per room code and
	// auto-rejoining on mount is the fix; the manual join form stays as the fallback
	// for a first-time join or a different device.
	const storageKey = `guess-the-move:name:${code}`;

	let name = $state(page.url.searchParams.get('name') ?? '');
	let joined = $state(false);
	let now = $state(Date.now());
	let tick: ReturnType<typeof setInterval>;

	let origin = $state<string | null>(null);
	let pending = $state<ResolvedMove | null>(null);

	function join() {
		const id = name.trim();
		if (!id) return;
		joined = true;
		if (browser) localStorage.setItem(storageKey, id);
		name = id;
		client.connect({ code, participantId: id });
		tick = setInterval(() => (now = Date.now()), 250);
	}

	onMount(() => {
		const saved = localStorage.getItem(storageKey);
		if (saved) {
			name = saved;
			join();
		}
	});

	onDestroy(() => {
		clearInterval(tick);
		client.disconnect();
	});

	const snapshot = $derived(client.snapshot);
	const phase = $derived(snapshot?.value ?? 'lobby');
	const countdown = $derived(formatCountdown(remainingMs(snapshot?.deadline ?? null, now)));
	const me = $derived(name.trim());
	const myState = $derived(snapshot?.context.participants[me]);
	// The Round Score, broadcast on every snapshot once the Round closes - shown as
	// the headline number instead of the running total (#37), and reused as the
	// `score` fed into this Participant's automatic Reveal explanation (#42).
	const myRoundScore = $derived(snapshot?.context.scores[me] ?? 0);
	const locked = $derived(myState?.status === 'submitted' || myState?.status === 'late');
	const leaders = $derived(topLeaderboard(snapshot?.context.totals ?? {}));
	const top3 = $derived(topLeaderboard(snapshot?.context.totals ?? {}, 3));
	// The Leaderboard only shows once the Host has toggled it open (#51) — gated on the
	// broadcast snapshot flag rather than shown unconditionally at every Reveal.
	const showLeaderboard = $derived(snapshot?.showLeaderboard ?? false);
	// The redacted, bucketed Guess Group breakdown (#53): derived locally off this
	// Participant's own closed-Round `participants`/`scores`, already part of every
	// broadcast snapshot (and replayed on reconnect, unlike #45's one-shot push), rather
	// than a separate server message. Only shown once Reveal lands — same gating as the
	// personal `feedback` below.
	const groupBreakdown = $derived(
		phase === 'reveal' && snapshot
			? bucketedBreakdownFor(
					computeGuessGroupBreakdown(snapshot.context.participants, snapshot.context.scores),
					me
				)
			: null
	);
	// The Finished phase's personal message (#50): tells this Participant where they
	// stand — (tied for) the lead, or the point gap to whoever's immediately above them.
	const finishedMessage = $derived(
		snapshot ? finishedMessageFor(me, snapshot.context.totals) : null
	);

	// Once kicked, forget the saved name - a refresh must land back on the Join screen,
	// not silently retry into a connection the Host has already blocked server-side.
	$effect(() => {
		if (client.kicked && browser) localStorage.removeItem(storageKey);
	});

	// The Host advances Rounds through the Featured Game (#34's Next Round); this screen
	// follows whichever Round SessionRoom says is current rather than always showing the
	// first one (#27's pre-analysed answer-key table is the position/candidate-move source).
	const roundIndex = $derived(snapshot?.roundIndex ?? 0);
	const totalRounds = $derived(snapshot?.totalRounds ?? 0);
	// Round-index only, independent of phase — the Opponent Response screen (#48/#49) needs to
	// know this while in its own `opponentResponse` phase, not just during `reveal`.
	const isLastRound = $derived(roundIndex + 1 >= totalRounds);
	const isFinalRound = $derived(phase === 'reveal' && isLastRound);
	const quizStep = $derived(quizSteps()[roundIndex]);
	// The Opponent Response (#48): the single next move played in the game after this Round's
	// Featured move, shown large in numbered notation — or, on the Featured Game's final Round
	// (#49), the entire remaining real mainline to the game's actual end. Participants see the
	// same move(s) the Host does, with no live controls. Reuses #43's formatContinuation (it
	// also covers the single-move case).
	const opponentSteps = $derived(quizStep ? opponentResponseSteps(quizStep.ply, isLastRound) : []);
	const opponentMove = $derived(
		opponentSteps.length
			? formatContinuation(
					opponentSteps.map((s) => s.san),
					opponentSteps[0].ply
				)
			: null
	);
	const fen = $derived(quizStep?.fenBefore ?? game.startFen);
	const candidateSans = $derived(
		quizStep ? [quizStep.san, ...quizStep.alternatives.map((a) => a.san)] : []
	);
	// Each Participant's Round Score explanation — whether their Guess matched, which
	// tier, and the Variant — is automatic at Reveal now (#42, retiring #36's separate
	// Host-triggered Feedback). Derived locally from the snapshot and the client's
	// bundled answer key, so it's correct the instant Reveal lands, with no Host action.
	const feedback = $derived(
		phase === 'reveal' && myState
			? buildParticipantFeedback(quizStep ?? null, myState, myRoundScore, quizStep?.ply ?? 1)
			: null
	);
	// The Game Sheet (#58): the full move list up to the current Round, each graded
	// (Featured Side) move decorated with this Participant's own Guess and points from
	// the Session-lifetime history SessionRoom persists and broadcasts (#52) — not just
	// the current Round's in-memory state, so it stays correct across a reconnect too.
	const history = $derived(
		buildGameSheet(
			game.steps.filter((s) => s.ply < (quizStep?.ply ?? 1)),
			snapshot?.guessHistory ?? {},
			me
		)
	);

	// Participant PGN export (#59): only available once the Session reaches Final
	// Results (natural or early end, #57) — both land on this same `finished` phase.
	// The mainline is always the full original Featured Game, decorated with this
	// Participant's own Guesses from the Session-lifetime history (#52) and a
	// performance summary on the final move.
	const participantPgn = $derived(
		phase === 'finished' && snapshot
			? buildParticipantPgn(
					game,
					snapshot.guessHistory,
					me,
					snapshot.context.totals,
					roundsActuallyPlayed(roundIndex, snapshot.context.scores),
					snapshot.endedEarly
				)
			: null
	);

	function downloadPgn() {
		if (!participantPgn) return;
		const blob = new Blob([participantPgn], { type: 'application/x-chess-pgn' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `guess-the-move-${code}-${me}.pgn`;
		a.click();
		URL.revokeObjectURL(url);
	}

	// A new Round means a fresh tap — drop any half-made selection. (The Reveal
	// explanation and Guess Group breakdown are derived from the current snapshot, so
	// they clear themselves once the Round moves on.)
	$effect(() => {
		roundIndex;
		origin = null;
		pending = null;
	});

	function tapSquare(square: string) {
		if (pending || locked || phase !== 'active') return;
		if (origin === null) {
			origin = square;
			return;
		}
		if (origin === square) {
			origin = null;
			return;
		}
		const move = resolveTapMove(fen, origin, square, candidateSans);
		origin = null;
		// A null move (empty origin, or own piece on the destination) is dropped
		// silently — surfacing it would leak the hidden position (#24).
		if (move) pending = move;
	}

	function clearPending() {
		pending = null;
		origin = null;
	}

	function commit() {
		if (!pending) return;
		client.submit(pending.san);
		pending = null;
	}
</script>

<main class="mx-auto flex max-w-md flex-col gap-6 p-4">
	<header class="flex items-baseline justify-between">
		<h1 class="text-xl font-semibold">{m.app_title()}</h1>
		<p class="text-xs text-muted-foreground">
			{m.room_label()} <span class="font-mono tracking-widest">{code}</span>
			{#if totalRounds > 0}
				· {m.round_x_of_y({ current: roundIndex + 1, total: totalRounds })}
			{/if}
		</p>
	</header>

	{#if client.ended}
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.session_ended_title()}</Card.Title>
				<Card.Description>{m.play_session_ended_desc()}</Card.Description>
			</Card.Header>
		</Card.Root>
	{:else if client.kicked}
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.play_kicked_title()}</Card.Title>
				<Card.Description>{m.play_kicked_desc()}</Card.Description>
			</Card.Header>
		</Card.Root>
	{:else if !joined}
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.play_join_title()}</Card.Title>
				<Card.Description>{m.play_join_desc()}</Card.Description>
			</Card.Header>
			<Card.Content>
				<form class="flex gap-2" onsubmit={(e) => (e.preventDefault(), join())}>
					<input
						class="flex-1 rounded-md border px-3 py-2 text-sm"
						placeholder={m.play_name_placeholder()}
						bind:value={name}
						maxlength="24"
					/>
					<Button type="submit" disabled={!name.trim()}>{m.join_button()}</Button>
				</form>
			</Card.Content>
		</Card.Root>
	{:else if phase === 'lobby'}
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.play_lobby_title()}</Card.Title>
				<Card.Description>
					{m.play_lobby_waiting()}{client.connected ? '' : ` · ${m.status_connecting()}`}
				</Card.Description>
			</Card.Header>
		</Card.Root>
	{:else if phase === 'active'}
		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center justify-between">
					<span>{m.play_guess_title()}</span>
					<span class="font-mono text-2xl tabular-nums">{countdown}</span>
				</Card.Title>
				<Card.Description>
					{m.play_guess_desc()}
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-4">
				<div class="flex flex-col">
					{#each DISPLAY_RANKS as rank (rank)}
						<div class="flex">
							<div
								class="flex w-5 items-center justify-center font-mono text-xs text-muted-foreground"
							>
								{rank}
							</div>
							{#each FILES as file (file)}
								{@const sq = `${file}${rank}`}
								{@const isDark = (FILES.indexOf(file) + rank) % 2 === 0}
								<button
									type="button"
									disabled={locked}
									onclick={() => tapSquare(sq)}
									aria-label={sq}
									class="aspect-square flex-1 border border-border/40 text-[10px] disabled:cursor-not-allowed"
									class:bg-muted={isDark}
									class:ring-2={origin === sq}
									class:ring-primary={origin === sq}
									class:ring-inset={origin === sq}
								></button>
							{/each}
						</div>
					{/each}
					<div class="flex">
						<div class="w-5"></div>
						{#each FILES as file (file)}
							<div class="flex-1 text-center font-mono text-xs text-muted-foreground">
								{file}
							</div>
						{/each}
					</div>
				</div>

				{#if locked}
					<p class="text-center text-sm font-medium text-primary">
						{m.play_locked()}
					</p>
				{:else if pending}
					<div class="flex items-center justify-between rounded-lg border px-3 py-2">
						<span>
							{m.play_confirm()} <span class="text-2xl">{pending.glyph}</span>
						</span>
						<span class="flex gap-2">
							<Button variant="outline" size="sm" onclick={clearPending}>{m.play_clear()}</Button>
							<Button size="sm" onclick={commit}>{m.play_submit()}</Button>
						</span>
					</div>
				{:else}
					<p class="text-center text-sm text-muted-foreground">
						{origin ? m.play_tap_from({ square: origin }) : m.play_tap_start()}
					</p>
				{/if}
			</Card.Content>
		</Card.Root>

		{#if history.length}
			<Card.Root>
				<Card.Header>
					<Card.Title class="text-sm">{m.play_game_sheet()}</Card.Title>
				</Card.Header>
				<Card.Content>
					<GameSheet
						rows={history}
						event={game.headers.Event}
						date={game.headers.Date}
						white={game.headers.White}
						black={game.headers.Black}
					/>
				</Card.Content>
			</Card.Root>
		{/if}
	{:else if phase === 'opponentResponse'}
		<!-- Opponent Response (#48): the same single next move the Host shows, large, with no
		     live controls (consistent with the host-only "Next Round" pattern). -->
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.opponent_response_title()}</Card.Title>
				<Card.Description>{m.opponent_response_desc()}</Card.Description>
			</Card.Header>
			<Card.Content>
				<div class="text-center font-mono text-5xl tracking-tight tabular-nums">
					{opponentMove ?? '—'}
				</div>
			</Card.Content>
		</Card.Root>
	{:else if phase === 'finished'}
		<!-- Finished (#50): the terminal, full-screen Podium reached from the final Round's
		     Opponent Response once the Host clicks "Finish". A Participant's personal
		     message underneath states where they stand — (tied for) the lead, or the gap
		     to whoever's immediately above them. -->
		<Card.Root>
			<Card.Header>
				<Card.Title>{m.final_results_title()}</Card.Title>
			</Card.Header>
			<Card.Content class="flex flex-col items-center gap-4">
				<Podium entries={top3} highlightId={me} />
				{#if finishedMessage}
					<p class="text-center text-base font-medium">
						{#if finishedMessage.kind === 'lead'}
							{m.finished_lead()}
						{:else if finishedMessage.kind === 'tiedLead'}
							{m.finished_tied_lead()}
						{:else}
							{m.finished_behind({ points: finishedMessage.points, name: finishedMessage.name })}
						{/if}
					</p>
				{/if}
				{#if participantPgn}
					<Button variant="outline" onclick={downloadPgn}>{m.play_download_pgn()}</Button>
				{/if}
			</Card.Content>
		</Card.Root>
	{:else}
		<!-- Three-card Reveal (#46): personal feedback, then the Leaderboard (gated on the
		     Host's toggle, #51), then how the whole room guessed — each its own Card. -->
		<Card.Root>
			<Card.Header>
				<Card.Title>{phase === 'reveal' ? m.play_reveal_title() : m.play_closed_title()}</Card.Title
				>
				<Card.Description>{m.play_round_score()}</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-4">
				<div class="text-center">
					<div class="font-mono text-5xl tabular-nums">
						{myRoundScore > 0 ? '+' : ''}{myRoundScore}
					</div>
					<p class="mt-2 text-sm text-muted-foreground">{me}</p>
				</div>
				{#if feedback}
					<div class="flex flex-col gap-2 rounded-lg border px-3 py-3">
						<p class="text-sm font-medium">{feedback.phrase ?? explanationText(feedback.tier)}</p>
						<div class="flex flex-col gap-1 text-sm">
							{#if feedback.guessSan}
								<div class="flex items-baseline justify-between gap-2">
									<span class="text-muted-foreground">{m.play_feedback_your_move()}</span>
									<span class="font-mono text-base"
										>{formatNumberedMove(feedback.guessSan, feedback.ply)}</span
									>
								</div>
							{/if}
							<div class="flex items-baseline justify-between gap-2">
								<span class="text-muted-foreground">{m.play_feedback_played()}</span>
								<span class="font-mono text-base"
									>{formatNumberedMove(feedback.playedSan, feedback.ply)}</span
								>
							</div>
						</div>
						{#if feedback.variant && feedback.variant.continuation.length}
							<div class="flex flex-col gap-0.5">
								<span class="text-xs tracking-wide text-muted-foreground uppercase"
									>{m.play_feedback_continuation()}</span
								>
								<span class="font-mono text-sm">
									{formatContinuation(feedback.variant.continuation, feedback.ply + 1)}
									{#if feedback.variant.endEval != null}
										<span class="text-muted-foreground">
											({feedback.variant.endEval > 0 ? '+' : ''}{feedback.variant.endEval})
										</span>
									{/if}
								</span>
							</div>
						{/if}
					</div>
				{/if}
			</Card.Content>
		</Card.Root>

		<!-- Leaderboard (#51): only shown once the Host has toggled it open on the shared
		     Reveal screen, except on the Final Round where it's always shown alongside the
		     Podium. The viewer's own row is highlighted. -->
		{#if isFinalRound || showLeaderboard}
			<Card.Root>
				<Card.Header>
					<Card.Title>{isFinalRound ? m.final_results_title() : m.leaderboard_title()}</Card.Title>
				</Card.Header>
				<Card.Content class="flex flex-col gap-4">
					{#if isFinalRound}
						<Podium entries={top3} highlightId={me} />
					{/if}
					<Leaderboard
						entries={leaders}
						highlightId={me}
						priorTotals={snapshot?.context.priorTotals ?? {}}
					/>
				</Card.Content>
			</Card.Root>
		{/if}

		{#if groupBreakdown}
			<Card.Root>
				<Card.Header>
					<Card.Title>{m.play_guess_groups_title()}</Card.Title>
				</Card.Header>
				<Card.Content class="flex flex-col gap-3">
					<GuessGroupChart
						buckets={groupBreakdown.buckets}
						highlightScore={groupBreakdown.ownScore}
					/>
					<ul class="flex flex-col gap-1.5 text-sm">
						{#each groupBreakdown.buckets as bucket (bucket.score)}
							{@const isOwnBucket = bucket.score === groupBreakdown.ownScore}
							{@const ownMove = groupBreakdown.sentence.san
								? formatNumberedMove(groupBreakdown.sentence.san, quizStep?.ply ?? 1)
								: m.guess_groups_no_move()}
							<li
								class="flex flex-col gap-0.5 rounded-lg border px-3 py-1.5"
								class:ring-2={isOwnBucket}
								class:ring-primary={isOwnBucket}
								class:ring-offset-1={isOwnBucket}
								style="border-left: 4px solid {scoreColor(bucket.score)};"
							>
								<div class="flex items-baseline justify-between gap-2">
									<span class="font-mono text-xs text-muted-foreground tabular-nums">
										{bucket.score > 0 ? '+' : ''}{bucket.score}
									</span>
									<span class="text-xs text-muted-foreground tabular-nums">
										{chartParticipantLabel(bucket.count)}
									</span>
								</div>
								{#if isOwnBucket}
									<span class="text-xs text-muted-foreground">
										{#if groupBreakdown.sentence.others.length}
											{m.play_guess_group_sentence_others({
												names: groupBreakdown.sentence.others.join(', '),
												move: ownMove
											})}
										{:else}
											{m.play_guess_group_sentence_alone({ move: ownMove })}
										{/if}
									</span>
								{/if}
							</li>
						{/each}
					</ul>
				</Card.Content>
			</Card.Root>
		{/if}
	{/if}
</main>
