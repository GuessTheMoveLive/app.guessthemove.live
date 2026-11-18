// Smoke test for the Host -> Start Round -> Participant tap-to-guess flow (#87's
// board auto-flip fix). Not wired into CI (would add a Playwright browser-install
// cost to every push) - run it on demand with `npm run test:e2e` after `npm run build`.
// Drives a real wrangler-dev instance (plain `vite dev` can't serve the
// Durable-Object-backed /api/session socket), so it needs a prior build.
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import assert from 'node:assert/strict';

// `shell: true` spawns wrangler dev under an intermediate cmd.exe/sh - killing just
// that PID leaves the actual wrangler/workerd process (and its held port) running, so
// the process tree needs killing instead, not just the shell's own PID.
function killTree(pid) {
	if (process.platform === 'win32') {
		execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
	} else {
		process.kill(-pid, 'SIGKILL');
	}
}

const PORT = 4174;
const BASE = `http://127.0.0.1:${PORT}`;

function waitForReady(proc) {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(
			() => reject(new Error('wrangler dev did not become ready in time')),
			30_000
		);
		proc.stdout.on('data', (chunk) => {
			if (chunk.toString().includes('Ready on')) {
				clearTimeout(timeout);
				resolve();
			}
		});
		proc.on('exit', (code) => {
			clearTimeout(timeout);
			reject(new Error(`wrangler dev exited early with code ${code}`));
		});
	});
}

async function main() {
	const server = spawn(`npx wrangler dev --port ${PORT}`, {
		shell: true,
		detached: process.platform !== 'win32',
		stdio: ['ignore', 'pipe', 'inherit']
	});

	try {
		await waitForReady(server);

		const browser = await chromium.launch();
		try {
			const hostPage = await browser.newPage();
			await hostPage.goto(BASE + '/');
			await hostPage.click('form[action="/create-session"] button');
			await hostPage.waitForURL(/\/host\//);
			const code = hostPage.url().match(/\/host\/([^/?]+)/)[1];

			const participantPage = await browser.newPage();
			await participantPage.goto(`${BASE}/play/${code}?name=E2E`);
			await participantPage.fill('input[placeholder]', 'E2E');
			await participantPage.click('button:has-text("Join")');
			await participantPage.waitForTimeout(500);

			await hostPage.locator('button:has-text("Start Round")').click();
			await participantPage.waitForTimeout(500);

			// The tap-to-guess grid renders as rows of "<rank label><8 squares>", then a
			// trailing file-label row - see the markup in src/routes/play/[code]/+page.svelte.
			const { ranks, files } = await participantPage.evaluate(() => {
				const rankDivs = Array.from(document.querySelectorAll('div.w-5'));
				const fileRow = rankDivs.at(-1)?.parentElement;
				return {
					ranks: rankDivs.slice(0, -1).map((d) => d.textContent.trim()),
					files: fileRow
						? Array.from(fileRow.querySelectorAll('div.flex-1')).map((d) => d.textContent.trim())
						: []
				};
			});

			// The bundled Featured Game (Bernstein-Capablanca) is analysed for Black, so
			// every quizzed Round has a Black Featured Side - the board must render flipped.
			assert.deepEqual(ranks, ['1', '2', '3', '4', '5', '6', '7', '8']);
			assert.deepEqual(files, ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a']);
			console.log('ok: board auto-flips for a Black Featured Side');
		} finally {
			await browser.close();
		}
	} finally {
		killTree(server.pid);
	}
}

main().catch((e) => {
	console.error(e);
	process.exitCode = 1;
});
