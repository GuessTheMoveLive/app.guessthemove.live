<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import QRCode from 'qrcode';
	import { SessionClient } from '#lib/round/session-client.svelte.js';
	import {
		topLeaderboard,
		fullRanking,
		scoreboardRows,
		submissionProgress,
		everyoneAnswered,
		remainingMs,
		formatCountdown,
		answerKeyBreakdown
	} from '#lib/host/host-view.js';
	import {
		getGameData,
		quizSteps,
		opponentResponseSteps,
		EMPTY_GAME_DATA
	} from '#lib/round/game-data.js';
	import { gameCatalog } from '#lib/round/game-catalog.js';
	import {
		buildMoveHistory,
		formatNumberedMove,
		formatContinuation
	} from '#lib/round/participant-input.js';
	import { computeGuessGroupBreakdown } from '#lib/round/guess-groups.js';
	import { buildHostPgn, roundsActuallyPlayed } from '#lib/round/pgn.js';
	import { headerContext } from '#lib/round/header-context.svelte.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Tooltip from '#lib/components/ui/tooltip/index.js';
	import ArrowCounterClockwise from 'phosphor-svelte/lib/ArrowCounterClockwise';
	import UserMinus from 'phosphor-svelte/lib/UserMinus';
	import Check from 'phosphor-svelte/lib/Check';
	import Leaderboard from '#lib/components/leaderboard.svelte';
	import Podium from '#lib/components/podium.svelte';
	import ScoreSheet from '#lib/components/score-sheet.svelte';
	import GuessGroupChart from '#lib/components/guess-group-chart.svelte';
	import { m } from '#lib/paraglide/messages.js';

	const code = page.params.code ?? '';
	const token = page.url.searchParams.get('token') ?? '';
	const client = new SessionClient();
	const catalog = gameCatalog();

	let now = $state(Date.now());
	let tick: ReturnType<typeof setInterval>;
	let qrDataUrl = $state<string | null>(null);
	let confirmingDelete = $state(false);
	let confirmingEndSession = $state(false);
	let linkCopied = $state(false);
	let copiedResetTimer: ReturnType<typeof setTimeout>;

	// Absolute join URL (not just the /play/{code} path) so it can be pasted as-is
	// into WhatsApp or any other share target, as a fallback for the QR code.
	const joinPath = $derived(resolve('/play/[code]', { code }));
	const joinUrl = $derived(`${page.url.origin}${joinPath}`);

	async function copyJoinLink() {
		try {
			await navigator.clipboard.writeText(joinUrl);
			linkCopied = true;
			clearTimeout(copiedResetTimer);
			copiedResetTimer = setTimeout(() => (linkCopied = false), 2000);
		} catch {
			// Clipboard permission denied or unavailable — the link is still shown and
			// selectable by hand, so there's nothing more to do here.
		}
	}

	onMount(() => {
		client.connect({ code, role: 'host', token });
		tick = setInterval(() => (now = Date.now()), 250);
		QRCode.toDataURL(`${location.origin}/play/${code}`, { margin: 1, width: 240 }).then(
			(url) => (qrDataUrl = url)
		);
	});
	onDestroy(() => {
		clearInterval(tick);
		clearTimeout(copiedResetTimer);
		client.disconnect();
	});

	function reset() {
		client.reset();
	}

	function deleteSession() {
		if (!confirmingDelete) {
			confirmingDelete = true;
			return;
		}
		client.deleteSession();
		confirmingDelete = false;
	}

	function endSessionEarly() {
		if (!confirmingEndSession) {
			confirmingEndSession = true;
			return;
		}
		client.endSessionEarly();
		confirmingEndSession = false;
	}

	const snapshot = $derived(client.snapshot);
	const phase = $derived(snapshot?.value ?? 'lobby');
	// The Featured Game the Host has selected from the Game Catalog (#93), broadcast on
	// the snapshot so a Host reconnect/refresh still shows the current pick. Falls back
	// to an empty placeholder before any selection — real game data only loads once one
	// has actually been made.
	const selectedGameId = $derived(snapshot?.selectedGameId ?? null);
	const game = $derived(selectedGameId ? getGameData(selectedGameId) : EMPTY_GAME_DATA);

	const participants = $derived(snapshot?.context.participants ?? {});
	const progress = $derived(submissionProgress(participants));
	const answered = $derived(everyoneAnswered(participants));
	const leaders = $derived(topLeaderboard(snapshot?.context.totals ?? {}));
	const top3 = $derived(topLeaderboard(snapshot?.context.totals ?? {}, 3));
	// The Finished phase's full ranking (#50): every Participant, not just the top 5.
	const everyone = $derived(fullRanking(snapshot?.context.totals ?? {}));
	const countdown = $derived(
		formatCountdown(remainingMs(snapshot?.deadline ?? null, now + client.clockOffsetMs))
	);
	// Broadcast rather than local (#51): synced through the snapshot so a Participant's
	// phone can gate its own Leaderboard card on the same toggle (see play/[code]).
	const showLeaderboard = $derived(snapshot?.showLeaderboard ?? false);
	// Sibling toggle (#73): gates the Guess Group breakdown card on a Participant's phone,
	// same broadcast shape as showLeaderboard, and mutually exclusive with it server-side
	// (#96) — the Host Display's own breakdown below is never gated by it.
	const showRoomStatistics = $derived(snapshot?.showRoomStatistics ?? false);
	const roundIndex = $derived(snapshot?.roundIndex ?? 0);
	const totalRounds = $derived(snapshot?.totalRounds ?? 0);
	const hasNextRound = $derived(roundIndex + 1 < totalRounds);
	// Round-index only, independent of phase — the Opponent Response screen (#48/#49) needs to
	// know this while in its own `opponentResponse` phase, not just during `reveal`.
	const isLastRound = $derived(!hasNextRound);
	const isFinalRound = $derived(phase === 'reveal' && isLastRound);
	// Reveal/Statistics/Ranking are exclusive focuses of the Reveal phase (#96): whichever
	// is current gets the room's full attention, so every other card on this screen - the
	// Reveal card itself, the Score Sheet, the Scoreboard roster and the Answer Key - steps
	// aside while it's up. The Final Round defaults to 'ranking' when neither toggle is open,
	// matching its existing always-on Podium/Leaderboard. `null` outside the Reveal phase,
	// where none of this gating applies.
	const revealFocus = $derived(
		phase === 'reveal'
			? showRoomStatistics
				? 'statistics'
				: showLeaderboard || isFinalRound
					? 'ranking'
					: 'reveal'
			: null
	);
	const quizStep = $derived(quizSteps(selectedGameId)[roundIndex]);
	const scoreboard = $derived(
		scoreboardRows(
			participants,
			snapshot?.context.totals ?? {},
			snapshot?.context.priorTotals ?? {},
			quizStep?.color ?? 'w'
		)
	);
	const rosterSize = $derived(scoreboard.length);
	// The Opponent Response (#48): the single next move actually played in the game after this
	// Round's Featured move, shown large in numbered notation (e.g. "5...Be7") — or, on the
	// Featured Game's final Round (#49), the entire remaining real mainline to the game's
	// actual end. Reuses #43's formatContinuation rather than reimplementing move-number
	// formatting (it also covers the single-move case).
	const opponentSteps = $derived(
		quizStep ? opponentResponseSteps(selectedGameId, quizStep.ply, isLastRound) : []
	);
	const opponentMove = $derived(
		opponentSteps.length
			? formatContinuation(
					opponentSteps.map((s) => s.san),
					opponentSteps[0].ply
				)
			: null
	);
	const breakdown = $derived(
		answerKeyBreakdown(
			quizStep ?? null,
			quizStep?.ply ?? 1,
			game.headers.White ?? null,
			game.headers.Black ?? null
		)
	);
	// The full Guess Group breakdown (#42): the Host Display shows every Guess Group and
	// every name automatically at Reveal — no action needed. Reads off the broadcast
	// snapshot's scores, populated once the Round closes.
	const guessGroups = $derived(
		computeGuessGroupBreakdown(participants, snapshot?.context.scores ?? {})
	);
	const history = $derived(
		buildMoveHistory(game.steps.filter((s) => s.ply < (quizStep?.ply ?? 1)))
	);

	// Host PGN export (#60): only available once the Session reaches Final Results
	// (natural or early end, #57) — same gating and PGN writer (#59) as the
	// Participant export, but room-level: every Round's distinct Guess Groups (not
	// one participant's Guess) and a Host-facing summary (full Leaderboard,
	// early-end state, total elapsed time) on the final move.
	const elapsedMs = $derived(
		snapshot?.sessionStartTime != null && snapshot?.finishedAt != null
			? snapshot.finishedAt - snapshot.sessionStartTime
			: null
	);
	const hostPgn = $derived(
		phase === 'finished' && snapshot
			? buildHostPgn(
					game,
					snapshot.guessHistory,
					snapshot.context.totals,
					roundsActuallyPlayed(roundIndex, snapshot.context.scores),
					snapshot.endedEarly,
					elapsedMs
				)
			: null
	);

	function downloadHostPgn() {
		if (!hostPgn) return;
		const blob = new Blob([hostPgn], { type: 'application/x-chess-pgn' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `guess-the-move-${code}-host.pgn`;
		a.click();
		URL.revokeObjectURL(url);
	}

	// Hands this Session's Room Code, connection status, round progress and the
	// session-actions menu (Reset/End Game/Delete) up to the layout-level sticky header
	// (#92's decision to keep that bar light, reversed) instead of this page rendering its
	// own title/header row — leaving the main area to just the phase cards below.
	$effect(() => {
		headerContext.roomCode = code;
		headerContext.status = client.status;
		// Gated on phase, not just totalRounds > 0 (#93): a Featured Game selection alone
		// makes totalRounds available well before Start, but the Round counter shouldn't
		// claim "Guess 1 of N" while still in the Lobby with no Round actually running.
		headerContext.roundCurrent = totalRounds > 0 && phase !== 'lobby' ? roundIndex + 1 : null;
		headerContext.roundTotal = totalRounds > 0 && phase !== 'lobby' ? totalRounds : null;
		headerContext.menuItems = [
			{ label: m.reset_button(), onclick: reset },
			...(phase !== 'finished'
				? [
						{
							label: confirmingEndSession ? m.end_session_confirm() : m.end_session_button(),
							onclick: endSessionEarly,
							variant: 'destructive' as const,
							closeOnClick: false
						}
					]
				: []),
			{
				label: confirmingDelete ? m.delete_confirm() : m.delete_button(),
				onclick: deleteSession,
				variant: 'destructive' as const,
				closeOnClick: false
			}
		];
	});
	onDestroy(() => {
		headerContext.roomCode = null;
		headerContext.status = null;
		headerContext.roundCurrent = null;
		headerContext.roundTotal = null;
		headerContext.menuItems = null;
	});
</script>

<main class="mx-auto flex max-w-6xl flex-col gap-6 p-6">
	<!-- Three-lane desktop layout (#89, ≥768px): left = Participants, Guess Group
	     breakdown, and Ranking, center = the phase/Reveal card plus Score Sheet,
	     right = Answer Key, full-height since it's the longest card. Below 768px
	     the grid collapses to one column (`grid-cols-1`), and since the three lane
	     wrappers below carry no `md:col-start-N` effect at that width, they simply
	     stack in DOM order. `md:row-start-1` on every lane is required alongside
	     `md:col-start-N`: the center lane comes first in DOM order, and CSS grid's
	     auto-placement cursor only moves forward, so without a pinned row the
	     left lane (col-start-1, "behind" the cursor after the center lane claims
	     column 2) gets auto-placed into a second row instead of sitting beside it. -->
	<div class="grid grid-cols-1 gap-6 md:grid-cols-3 md:items-start">
		<div class="flex flex-col gap-6 md:col-start-2 md:row-start-1">
			{#if client.ended}
				<Card.Root>
					<Card.Header>
						<Card.Title>{m.session_ended_title()}</Card.Title>
						<Card.Description>{m.host_session_ended_desc()}</Card.Description>
					</Card.Header>
				</Card.Root>
			{:else if phase === 'lobby'}
				<Card.Root>
					<Card.Header>
						<Card.Title>{m.host_lobby_title()}</Card.Title>
						<Card.Description>
							{rosterSize === 1
								? m.host_lobby_players_one({ count: rosterSize })
								: m.host_lobby_players_other({ count: rosterSize })}
						</Card.Description>
					</Card.Header>
					<Card.Content class="flex flex-col items-center gap-3">
						<!-- Prominent Room Code (#99): a Participant who lands on the bare base
						     URL instead of scanning/following the link has nothing to type into
						     the home page's Room Code field unless it's shown big and legible
						     here too, not just in the small header chip. -->
						<div class="flex flex-col items-center gap-1">
							<span class="text-xs font-medium tracking-wide text-muted-foreground uppercase">
								{m.host_room_code_label()}
							</span>
							<span class="font-mono text-4xl font-bold tracking-[0.2em] tabular-nums">
								{code}
							</span>
						</div>
						{#if qrDataUrl}
							<img src={qrDataUrl} alt={m.host_qr_alt({ code })} class="h-60 w-60" />
						{/if}
						<p class="text-center text-sm text-muted-foreground">
							{m.host_scan_hint()}
						</p>
						<div class="flex w-full max-w-sm items-center gap-2">
							<a
								href={joinPath}
								target="_blank"
								rel="noopener"
								class="flex-1 truncate rounded-md border px-3 py-2 font-mono text-sm text-primary underline-offset-2 hover:underline"
							>
								{joinUrl}
							</a>
							<Button variant="outline" size="sm" onclick={copyJoinLink}>
								{linkCopied ? m.host_link_copied() : m.host_copy_link()}
							</Button>
						</div>
					</Card.Content>
					<Card.Footer>
						<Button onclick={() => client.startRound()} disabled={!selectedGameId}>
							{m.host_start_round()}
						</Button>
					</Card.Footer>
				</Card.Root>
				<Card.Root>
					<Card.Header>
						<Card.Title>{m.host_catalog_title()}</Card.Title>
						<Card.Description>{m.host_catalog_desc()}</Card.Description>
					</Card.Header>
					<Card.Content>
						<!-- Host-only Game Catalog table (#93): one row per cataloged Candidate
						     Game, clicking anywhere on a row selects it as the Featured Game —
						     no separate "confirm" step, and re-selectable any number of times
						     before Start. Never shown to Participants. -->
						<div
							class="w-full overflow-x-auto rounded-md border"
							role="radiogroup"
							aria-label={m.host_catalog_title()}
						>
							<table class="w-full text-sm">
								<thead class="border-b bg-muted/50 text-left text-muted-foreground">
									<tr>
										<th class="w-8 px-2 py-2">
											<span class="sr-only">{m.host_catalog_selected_label()}</span>
										</th>
										<th class="px-2 py-2 font-medium">{m.host_catalog_col_white()}</th>
										<th class="px-2 py-2 font-medium">{m.host_catalog_col_black()}</th>
										<th class="px-2 py-2 font-medium">{m.host_catalog_col_year()}</th>
										<th class="px-2 py-2 font-medium">{m.host_catalog_col_event()}</th>
										<th class="px-2 py-2 font-medium">{m.host_catalog_col_opening()}</th>
										<th class="px-2 py-2 text-right font-medium">{m.host_catalog_col_moves()}</th>
									</tr>
								</thead>
								<tbody>
									{#each catalog as row (row.id)}
										<tr
											role="radio"
											aria-checked={selectedGameId === row.id}
											tabindex={0}
											onclick={() => client.selectGame(row.id)}
											onkeydown={(e) => {
												if (e.key === 'Enter' || e.key === ' ') {
													e.preventDefault();
													client.selectGame(row.id);
												}
											}}
											class="cursor-pointer border-b last:border-0 hover:bg-muted/50 {selectedGameId ===
											row.id
												? 'bg-muted'
												: ''}"
										>
											<td class="px-2 py-2">
												{#if selectedGameId === row.id}
													<Check class="size-4 text-primary" />
												{/if}
											</td>
											<td class="px-2 py-2"
												>{row.white}{row.whiteElo ? ` (${row.whiteElo})` : ''}</td
											>
											<td class="px-2 py-2"
												>{row.black}{row.blackElo ? ` (${row.blackElo})` : ''}</td
											>
											<td class="px-2 py-2">{row.year ?? ''}</td>
											<td class="px-2 py-2">{row.event ?? ''}</td>
											<td class="px-2 py-2">{row.openingDisplay}</td>
											<td class="px-2 py-2 text-right">{row.moveCount}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</Card.Content>
				</Card.Root>
			{:else if phase === 'active'}
				<Card.Root>
					<Card.Header>
						<Card.Title>{m.host_active_title()}</Card.Title>
						<Card.Description>
							{m.host_active_desc()}
						</Card.Description>
					</Card.Header>
					<Card.Content class="flex flex-col gap-4">
						<div class="text-center">
							<div class="font-mono text-5xl tabular-nums">{countdown}</div>
							<div class="mt-2 text-sm text-muted-foreground">
								{m.host_answered({ submitted: progress.submitted, total: progress.total })}
							</div>
							{#if answered}
								<p class="mt-2 text-sm font-medium text-primary">
									{m.host_everyone_answered()}
								</p>
							{/if}
						</div>
						<div class="flex justify-center gap-2">
							<Button variant="outline" size="sm" onclick={() => client.adjustRound(-30_000)}>
								−30s
							</Button>
							<Button variant="outline" size="sm" onclick={() => client.adjustRound(30_000)}>
								+30s
							</Button>
						</div>
					</Card.Content>
					<Card.Footer>
						<Button onclick={() => client.reveal()}>{m.host_reveal_button()}</Button>
					</Card.Footer>
				</Card.Root>
			{:else if phase === 'closed'}
				<Card.Root>
					<Card.Header>
						<Card.Title>{m.host_closed_title()}</Card.Title>
					</Card.Header>
					<Card.Footer class="flex gap-2">
						<Button onclick={() => client.reveal()}>{m.host_reveal_button()}</Button>
						<!-- Reopens the Round rather than extending a clock that's already run out
						     (#92) — gives anyone who missed the deadline a fresh chance to submit,
						     at the Host's discretion, before moving on to the Reveal. -->
						<Button variant="outline" onclick={() => client.adjustRound(30_000)}>
							{m.host_reopen_round_button()}
						</Button>
					</Card.Footer>
				</Card.Root>
			{:else if phase === 'opponentResponse'}
				<!-- Opponent Response (#48): the next move(s) played in the game, large, with the
		     Host's live Back / Next Round controls. Participants render the same card inert.
		     On the Featured Game's final Round (#49) this shows the entire remaining real
		     mainline, and the forward control reads "Finish" — there's no next Round to
		     advance to, so it returns to the final Reveal/Leaderboard instead. -->
				<Card.Root>
					<Card.Header>
						<Card.Title>{m.opponent_response_title()}</Card.Title>
						<Card.Description>{m.opponent_response_desc()}</Card.Description>
					</Card.Header>
					<Card.Content>
						<div class="text-center font-mono text-6xl tracking-tight tabular-nums">
							{opponentMove ?? '—'}
						</div>
					</Card.Content>
					<Card.Footer class="flex gap-2">
						{#if isLastRound}
							<Button onclick={() => client.finish()}>{m.host_finish_button()}</Button>
						{:else}
							<Button variant="outline" onclick={() => client.back()}>{m.back_button()}</Button>
							<Button onclick={() => client.nextRound()}>{m.host_next_round()}</Button>
						{/if}
					</Card.Footer>
				</Card.Root>
			{:else if phase === 'finished'}
				<!-- Finished (#50): the terminal, full-screen phase reached from the final Round's
		     Opponent Response via "Finish". The Podium and full ranking live in the
		     Ranking card (left column) instead of here. -->
				<Card.Root>
					<Card.Header>
						<Card.Title>{m.final_results_title()}</Card.Title>
					</Card.Header>
					{#if hostPgn}
						<Card.Footer>
							<Button variant="outline" onclick={downloadHostPgn}>{m.host_download_pgn()}</Button>
						</Card.Footer>
					{/if}
				</Card.Root>
			{:else}
				<!-- The Podium/Ranking for this Reveal lives in the Ranking card (left column)
		     instead of inline here — see the #89 three-lane layout. Reveal/Statistics/Ranking
		     are exclusive focuses (#96, see revealFocus): whichever is open gets the room's
		     full attention, so this card's own title steps aside while it's up — the toggle
		     buttons in the footer stay put so the Host can switch back. -->
				<Card.Root>
					{#if revealFocus === 'reveal'}
						<Card.Header>
							<Card.Title
								>{isFinalRound ? m.final_results_title() : m.host_reveal_title()}</Card.Title
							>
						</Card.Header>
					{/if}
					<Card.Footer class="flex flex-wrap gap-2">
						{#if isFinalRound}
							<p class="text-sm font-medium text-muted-foreground">
								{m.host_final_round()}
							</p>
							<Button variant="outline" onclick={() => client.showRoomStatistics()}>
								{showRoomStatistics ? m.host_hide_room_statistics() : m.host_show_room_statistics()}
							</Button>
							<Button onclick={() => client.continueRound()}>{m.host_continue()}</Button>
						{:else}
							<Button variant="outline" onclick={() => client.showRoomStatistics()}>
								{showRoomStatistics ? m.host_hide_room_statistics() : m.host_show_room_statistics()}
							</Button>
							<Button variant="outline" onclick={() => client.showLeaderboard()}>
								{showLeaderboard ? m.host_hide_leaderboard() : m.host_show_leaderboard()}
							</Button>
							<Button onclick={() => client.continueRound()}>{m.host_continue()}</Button>
						{/if}
					</Card.Footer>
				</Card.Root>
			{/if}

			{#if !client.ended && phase !== 'finished' && history.length && revealFocus !== 'statistics' && revealFocus !== 'ranking'}
				<Card.Root>
					<Card.Header>
						<Card.Title class="text-sm">{m.host_score_sheet()}</Card.Title>
					</Card.Header>
					<Card.Content>
						<ScoreSheet
							rows={history}
							event={game.headers.Event}
							date={game.headers.Date}
							white={game.headers.White}
							black={game.headers.Black}
						/>
					</Card.Content>
				</Card.Root>
			{/if}
		</div>

		<!-- Left lane order matches the Participant's own Reveal card order (#90): Guess
		     Groups, then Ranking (Leaderboard/Podium) — see src/routes/play/[code]/+page.svelte. -->
		<div class="flex flex-col gap-6 md:col-start-1 md:row-start-1">
			{#if rosterSize > 0 && phase !== 'finished' && revealFocus !== 'statistics' && revealFocus !== 'ranking'}
				<Card.Root>
					<Card.Header>
						<Card.Title class="text-sm">{m.host_scoreboard_title({ count: rosterSize })}</Card.Title
						>
					</Card.Header>
					<Card.Content class="max-h-72 overflow-y-auto">
						<Tooltip.Provider delayDuration={150}>
							<ol class="flex flex-col gap-2">
								{#each scoreboard as row (row.participantId)}
									<li class="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
										<span class="min-w-0 flex-1 truncate font-medium">{row.participantId}</span>
										{#if phase === 'active' || phase === 'closed'}
											<span class="w-10 shrink-0 text-center font-mono text-muted-foreground">
												{row.move ?? '…'}
											</span>
										{/if}
										<span class="w-8 shrink-0 text-right font-mono tabular-nums">{row.score}</span>
										{#if phase === 'active' && row.move != null}
											<Tooltip.Root>
												<Tooltip.Trigger>
													{#snippet child({ props })}
														<Button
															{...props}
															variant="outline"
															size="icon"
															aria-label={m.host_reset_guess_label({ name: row.participantId })}
															onclick={() => client.resetGuess(row.participantId)}
															class="size-7"
														>
															<ArrowCounterClockwise class="size-3.5" />
														</Button>
													{/snippet}
												</Tooltip.Trigger>
												<Tooltip.Content>{m.reset_button()}</Tooltip.Content>
											</Tooltip.Root>
										{/if}
										<Tooltip.Root>
											<Tooltip.Trigger>
												{#snippet child({ props })}
													<Button
														{...props}
														variant="destructive"
														size="icon"
														aria-label={m.host_kick_label({ name: row.participantId })}
														onclick={() => client.kick(row.participantId)}
														class="size-7"
													>
														<UserMinus class="size-3.5" />
													</Button>
												{/snippet}
											</Tooltip.Trigger>
											<Tooltip.Content>{m.host_kick_button()}</Tooltip.Content>
										</Tooltip.Root>
									</li>
								{/each}
							</ol>
						</Tooltip.Provider>
					</Card.Content>
				</Card.Root>
			{/if}

			{#if !client.ended && revealFocus === 'statistics' && guessGroups.groups.length}
				<Card.Root>
					<Card.Header>
						<Card.Title class="text-sm">{m.guess_groups_title()}</Card.Title>
					</Card.Header>
					<Card.Content class="flex flex-col gap-4">
						<GuessGroupChart buckets={guessGroups.buckets} />
						<ul class="flex flex-col gap-2">
							{#each guessGroups.groups as group (group.san ?? '\u0000')}
								{@const isGameMove = group.san != null && group.san === quizStep?.san}
								<li
									class="flex flex-col gap-1 rounded-lg border px-3 py-2"
									class:border-2={isGameMove}
									class:border-amber-400={isGameMove}
								>
									<div class="flex items-baseline justify-between gap-2">
										<span class="font-mono text-base">
											{group.san
												? formatNumberedMove(group.san, quizStep?.ply ?? 1)
												: m.guess_groups_no_move()}
										</span>
										<span class="font-mono text-sm text-muted-foreground tabular-nums">
											{group.score > 0 ? '+' : ''}{group.score}
										</span>
									</div>
									<span class="text-sm text-muted-foreground">
										{group.participantIds.join(', ')}
									</span>
								</li>
							{/each}
						</ul>
					</Card.Content>
				</Card.Root>
			{/if}

			{#if phase === 'closed'}
				<Card.Root>
					<Card.Header>
						<Card.Title class="text-sm">{m.leaderboard_title()}</Card.Title>
						<Card.Description>{m.leaderboard_top5()}</Card.Description>
					</Card.Header>
					<Card.Content>
						<Leaderboard entries={leaders} />
					</Card.Content>
				</Card.Root>
			{:else if phase === 'finished'}
				<Card.Root>
					<Card.Header>
						<Card.Title class="text-sm">{m.leaderboard_title()}</Card.Title>
					</Card.Header>
					<Card.Content class="flex flex-col gap-4">
						<Podium entries={top3} />
						<Leaderboard entries={everyone} />
					</Card.Content>
				</Card.Root>
			{:else if !client.ended && revealFocus === 'ranking'}
				<Card.Root>
					<Card.Header>
						<Card.Title class="text-sm">{m.leaderboard_title()}</Card.Title>
						<Card.Description>{m.leaderboard_top5()}</Card.Description>
					</Card.Header>
					<Card.Content class="flex flex-col gap-4">
						{#if isFinalRound}
							<Podium entries={top3} />
						{/if}
						<Leaderboard
							entries={leaders}
							priorTotals={snapshot?.context.priorTotals ?? {}}
							{participants}
						/>
					</Card.Content>
				</Card.Root>
			{/if}
		</div>

		<div class="flex flex-col gap-6 md:col-start-3 md:row-start-1">
			{#if !client.ended && phase !== 'lobby' && phase !== 'finished' && breakdown.length && revealFocus !== 'statistics' && revealFocus !== 'ranking'}
				<Card.Root>
					<Card.Header>
						<Card.Title class="text-sm">{m.host_answer_key_title()}</Card.Title>
						<Card.Description>
							{m.host_answer_key_desc()}
						</Card.Description>
					</Card.Header>
					<Card.Content>
						<ol class="flex flex-col gap-1.5 text-sm">
							{#each breakdown as row (row.san)}
								<li
									class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg border px-3 py-2"
									class:border-2={row.isGameMove}
									class:border-amber-400={row.isGameMove}
								>
									<span class="w-16 shrink-0 font-mono font-medium tabular-nums">{row.tier}</span>
									<span class="font-mono text-base">{row.glyph}</span>
									{#if row.eval != null}
										<span class="font-mono text-xs text-muted-foreground tabular-nums">
											{row.eval > 0 ? '+' : ''}{row.eval}
										</span>
									{/if}
									{#if row.continuation}
										<span class="w-full font-mono text-xs text-muted-foreground">
											{row.continuation}
										</span>
									{/if}
									{#if row.remark}
										<span class="w-full text-xs text-muted-foreground italic">
											{row.remark}
										</span>
									{/if}
								</li>
							{/each}
						</ol>
					</Card.Content>
				</Card.Root>
			{/if}
		</div>
	</div>
</main>
