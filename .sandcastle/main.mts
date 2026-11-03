import { run, claudeCode } from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { execFileSync } from "node:child_process";

// Simple loop: an agent that picks open issues one by one and closes them.
// Run this with: npx tsx .sandcastle/main.mts
// Or add to package.json scripts: "sandcastle": "npx tsx .sandcastle/main.mts"

await run({
  // A name for this run, shown as a prefix in log output.
  name: "worker",

  // Sandbox provider — runs the agent inside an isolated container.
  //
  // `mounts` persist node_modules and the npm cache on the host across
  // iterations/runs (each iteration otherwise gets a fresh worktree with no
  // node_modules, so `npm install` was re-fetching everything from scratch
  // every time — ~230s/iteration measured, pure overhead). Skipped on
  // win32: @ai-hero/sandcastle's custom-mount path resolution mangles
  // Windows drive-letter host paths and relative sandboxPaths, producing an
  // invalid `docker run -v` argument ("too many colons"). Windows falls
  // back to a full `npm install` per iteration instead.
  sandbox: docker(
    process.platform === "win32"
      ? {}
      : {
          mounts: [
            { hostPath: "./.sandcastle/.cache/node_modules", sandboxPath: "node_modules" },
            { hostPath: "./.sandcastle/.cache/npm", sandboxPath: "~/.npm" },
          ],
        },
  ),

  // The agent provider. Pass a model string to claudeCode() — sonnet balances
  // capability and speed for most tasks. Switch to claude-opus-4-8 for harder
  // problems, or claude-haiku-4-5-20251001 for speed.
  agent: claudeCode("claude-sonnet-5"),

  // Path to the prompt file. Shell expressions inside are evaluated inside the
  // sandbox at the start of each iteration, so the agent always sees fresh data.
  promptFile: "./.sandcastle/prompt.md",

  // Maximum number of iterations (agent invocations) to run in a session.
  // Each iteration works on a single issue. Increase this to process more issues
  // per run, or set it to 1 for a single-shot mode.
  maxIterations: 20,

  // Branch strategy — merge-to-head creates a temporary branch for the agent
  // to work on, then merges the result back to HEAD when the run completes.
  // This is required when using copyToWorktree, since head mode bind-mounts
  // the host directory directly (no worktree to copy into).
  branchStrategy: { type: "merge-to-head" },

  // Lifecycle hooks — commands grouped by where they run (host or sandbox).
  hooks: {
    sandbox: {
      // onSandboxReady runs once after the sandbox is initialised and the repo is
      // synced in, before the agent starts. Use it to install dependencies or run
      // any other setup steps your project needs. With node_modules/npm-cache
      // mounted above, this is an incremental install after the first run.
      //
      // `npm ci` (not `npm install`) so a per-iteration install never rewrites
      // package-lock.json — on win32 (no cache mounts, so every iteration
      // installs from scratch) a plain `npm install` was touching the lockfile
      // each time, which left every iteration's worktree flagged "dirty" and
      // preserved on disk even when the agent made no real change.
      onSandboxReady: [{ command: "npm ci", timeoutMs: 300_000 }],
    },
  },
});

// Safety net: merge-to-head only ever merges committed commits into this
// branch, so it can't be the source of stray untracked files — but flag any
// untracked file left in the host repo after the run anyway, in case
// something (a stray local edit, a future sandcastle change) slips one in
// without a commit or review to catch it.
const untracked = execFileSync(
  "git",
  ["status", "--porcelain", "--untracked-files=all"],
  { encoding: "utf8" },
)
  .split("\n")
  .filter((line) => line.startsWith("?? "));
if (untracked.length > 0) {
  console.warn(
    `\nWarning: ${untracked.length} untracked file(s) found in the repo after the sandcastle run — these were never committed by any iteration, so review them before trusting anything landed cleanly:\n` +
      untracked.map((line) => `  ${line.slice(3)}`).join("\n"),
  );
}
