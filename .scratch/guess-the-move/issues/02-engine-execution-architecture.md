Status: resolved
Type: grilling

## Question

Where should this run network-wise for the live event, and when/where should the chess engine evaluate Participant-submitted Guesses?

## Answer

**Hosting**: cloud-hosted, internet-facing. Participants join via a public URL/QR code over their own connection or venue wifi, rather than depending on venue wifi supporting device-to-device LAN traffic (which is often blocked or unreliable at venues).

**Engine timing**: live, on-demand, server-side. A server-side engine evaluates each unique Guess as it's submitted, once per Round — this only needs to run once per position (not once per Participant), so it doesn't scale with Participant count, and it handles any legal move a Participant might guess rather than only anticipated ones (ruling out a fully pre-computed/offline approach). Client-side (phone) evaluation was ruled out as trusting the client and being heavy on low-power phones.

Not yet decided: which specific engine and hosting mechanism (binary process pool, WASM, managed API) — see [Chess engine choice & hosting](../issues/17-chess-engine-choice-hosting.md) (research).
