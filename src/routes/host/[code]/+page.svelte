<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import QRCode from 'qrcode';
	import { SessionClient } from '#lib/round/session-client.svelte.js';
	import {
		topLeaderboard,
		scoreboardRows,
		submissionProgress,
		everyoneAnswered,
		remainingMs,
		formatCountdown,
		answerKeyBreakdown
	} from '#lib/host/host-view.js';
	import { getGameData, quizSteps } from '#lib/round/game-data.js';
	import { buildMoveHistory, sanToGlyph } from '#lib/round/participant-input.js';
	import { computeGuessGroupBreakdown } from '#lib/round/guess-groups.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import Leaderboard from '#lib/components/leaderboard.svelte';
	import Podium from '#lib/components/podium.svelte';
	import ScoreSheet from '#lib/components/score-sheet.svelte';
	import GuessGroupChart from '#lib/components/guess-group-chart.svelte';
	import { m } from '#lib/paraglide/messages.js';

	const code = page.params.code ?? '';
	const token = page.url.searchParams.get('token') ?? '';
	const client = new SessionClient();
	const game = getGameData();

	let now = $state(Date.now());
	let tick: ReturnType<typeof setInterval>;
	let qrDataUrl = $state<string | null>(null);
	let confirmingDelete = $state(false);
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

	const snapshot = $derived(client.snapshot);
	const phase = $derived(snapshot?.value ?? 'lobby');
	const participants = $derived(snapshot?.context.participants ?? {});
	const progress = $derived(submissionProgress(participants));
	const answered = $derived(everyoneAnswered(participants));
	const leaders = $derived(topLeaderboard(snapshot?.context.totals ?? {}));
	const top3 = $derived(topLeaderboard(snapshot?.context.totals ?? {}, 3));
	const countdown = $derived(formatCountdown(remainingMs(snapshot?.deadline ?? null, now)));
	const scoreboard = $derived(
		scoreboardRows(
			participants,
			snapshot?.context.totals ?? {},
			snapshot?.context.priorTotals ?? {}
		)
	);
	const rosterSize = $derived(scoreboard.length);
	const roundIndex = $derived(snapshot?.roundIndex ?? 0);
	const totalRounds = $derived(snapshot?.totalRounds ?? 0);
	const hasNextRound = $derived(roundIndex + 1 < totalRounds);
	const isFinalRound = $derived(phase === 'reveal' && !hasNextRound);
	const quizStep = $derived(quizSteps()[roundIndex]);
	const breakdown = $derived(answerKeyBreakdown(quizStep ?? null));
	// The full Guess Group breakdown (#42): the Host Display shows every Guess Group and
	// every name automatically at Reveal — no action needed. Reads off the broadcast
	// snapshot's scores, populated once the Round closes.
	const guessGroups = $derived(
		computeGuessGroupBreakdown(participants, snapshot?.context.scores ?? {})
	);
	const history = $derived(
		buildMoveHistory(game.steps.filter((s) => s.ply < (quizStep?.ply ?? 1)))
	);
</script>

<main class="mx-auto flex max-w-2xl flex-col gap-6 p-6">
	<header class="flex flex-wrap items-baseline justify-between gap-2">
		<h1 class="text-2xl font-semibold">{m.host_title()}</h1>
		<div class="flex items-center gap-3">
			<p class="text-sm text-muted-foreground">
				{m.room_label()} <span class="font-mono font-medium tracking-widest">{code}</span>
				· {client.connected ? m.status_live() : m.status_connecting()}
				{#if totalRounds > 0}
					· {m.round_x_of_y({ current: roundIndex + 1, total: totalRounds })}
				{/if}
			</p>
			<Button variant="outline" size="sm" onclick={reset}>{m.reset_button()}</Button>
			<Button variant="destructive" size="sm" onclick={deleteSession}>
				{confirmingDelete ? m.delete_confirm() : m.delete_button()}
			</Button>
		</div>
	</header>

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
				<Button onclick={() => client.startRound()}>{m.host_start_round()}</Button>
			</Card.Footer>
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
				<Card.Description>{m.leaderboard_top5()}</Card.Description>
			</Card.Header>
			<Card.Content>
				<Leaderboard entries={leaders} />
			</Card.Content>
			<Card.Footer>
				<Button onclick={() => client.reveal()}>{m.host_reveal_button()}</Button>
			</Card.Footer>
		</Card.Root>
	{:else}
		<Card.Root>
			<Card.Header>
				<Card.Title>{isFinalRound ? m.final_results_title() : m.host_reveal_title()}</Card.Title>
				{#if !isFinalRound}
					<Card.Description>{m.leaderboard_top5()}</Card.Description>
				{/if}
			</Card.Header>
			<Card.Content class="flex flex-col gap-4">
				{#if isFinalRound}
					<Podium entries={top3} />
				{/if}
				<Leaderboard entries={leaders} />
			</Card.Content>
			<Card.Footer class="flex gap-2">
				<Button variant="outline" onclick={() => client.shareGuessGroups()}
					>{m.host_share_guess_groups()}</Button
				>
				{#if hasNextRound}
					<Button onclick={() => client.nextRound()}>{m.host_next_round()}</Button>
				{:else}
					<p class="text-sm font-medium text-muted-foreground">
						{m.host_final_round()}
					</p>
				{/if}
			</Card.Footer>
		</Card.Root>
	{/if}

	{#if !client.ended && phase === 'reveal' && guessGroups.groups.length}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-sm">{m.guess_groups_title()}</Card.Title>
			</Card.Header>
			<Card.Content class="flex flex-col gap-4">
				<GuessGroupChart buckets={guessGroups.buckets} />
				<ul class="flex flex-col gap-2">
					{#each guessGroups.groups as group (group.san ?? '\u0000')}
						<li class="flex flex-col gap-1 rounded-lg border px-3 py-2">
							<div class="flex items-baseline justify-between gap-2">
								<span class="font-mono text-base">
									{group.san ? sanToGlyph(group.san) : m.guess_groups_no_move()}
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

	{#if !client.ended && history.length}
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

	{#if !client.ended && phase !== 'lobby' && breakdown.length}
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
						<li class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-lg border px-3 py-2">
							<span class="w-16 shrink-0 font-mono font-medium tabular-nums">{row.tier}</span>
							<span class="font-mono text-base">{row.glyph}</span>
							{#if row.eval != null}
								<span class="font-mono text-xs text-muted-foreground tabular-nums">
									{row.eval > 0 ? '+' : ''}{row.eval}
								</span>
							{/if}
							{#if row.continuation.length}
								<span class="w-full font-mono text-xs text-muted-foreground">
									{row.continuation.join(' ')}
								</span>
							{/if}
						</li>
					{/each}
				</ol>
			</Card.Content>
		</Card.Root>
	{/if}

	{#if rosterSize > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-sm">{m.host_scoreboard_title({ count: rosterSize })}</Card.Title>
			</Card.Header>
			<Card.Content class="max-h-72 overflow-y-auto">
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
							<Button
								variant="destructive"
								size="icon-xs"
								aria-label={m.host_kick_label({ name: row.participantId })}
								onclick={() => client.kick(row.participantId)}
							>
								&times;
							</Button>
						</li>
					{/each}
				</ol>
			</Card.Content>
		</Card.Root>
	{/if}
</main>
