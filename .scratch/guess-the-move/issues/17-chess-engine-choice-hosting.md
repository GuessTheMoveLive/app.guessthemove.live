Status: resolved
Type: research

## Question

Which chess engine should the server use for live, on-demand move evaluation, and how should it run under a cloud-hosted deployment (self-hosted binary process pool, WASM in the server process, or a managed third-party analysis API)? Consider cost and latency at small scale (~30 concurrent Participants, one shared position being evaluated per Round per unique submitted move — see [Engine execution architecture](02-engine-execution-architecture.md)).

## Answer

Run the official native Stockfish binary as a spawned child process, talking UCI over stdin/stdout, on a single small cloud VM/container (e.g. Fly.io `shared-cpu-1x`), scaled to zero between Sessions. Bound each Evaluation with `go movetime` in the ~500ms–2s range (Threads = instance cores, modest Hash, MultiPV 1) — at ~1 MNPS/core on modern cloud CPUs that's comfortably enough depth to score a Guess, far beyond what's needed given this only has to place a Guess into a coarse accuracy band. A single engine process fed by a simple in-process work queue is sufficient at this scale (a handful of unique moves per Round, Host-paced, not timed); a small pool of 2–4 processes is a cheap option if near-parallel scoring is wanted, but nothing bigger is justified. Skip WASM Stockfish builds server-side — they exist only to work around browsers' inability to spawn native processes, and are measurably slower/fussier than a native binary a Node server can spawn directly. Skip managed analysis APIs too: Lichess's cloud eval endpoint is a precomputed-cache lookup (~320M mostly-opening positions), not on-demand analysis of arbitrary positions, so it would 404 on exactly the offbeat Guesses this app needs to score. Self-hosting costs cents per event at this usage pattern (occasional single-event, not 24/7), so cost isn't a real tradeoff against the (non-viable) managed-API option. Full sourcing and detail in [research/chess-engine-hosting.md](../research/chess-engine-hosting.md).
