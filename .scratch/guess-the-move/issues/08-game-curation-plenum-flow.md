Status: resolved
Type: grilling

## Question

How does a Session pick which real game to feature, and what quality bar does that game need to meet? How much of the Featured Game does a Session cover?

## Answer

**Plenum Selection Phase**: live and collective, part of every Session's start — no digital Participant involvement or scoring. The Host enters moves on the Host Display's board as the room verbally agrees on a position (e.g. via discussion in the room, not app input). Once a position is reached, the system searches for **Candidate Games** by criteria (opening reached, tournament tier, gender, etc.) and the Host picks one meeting a minimum computed **Accuracy Score** to become the **Featured Game**.

**Quality bar**: enforced automatically, not by Host judgment alone — the system computes an Accuracy Score for each Candidate Game and only allows featuring one that clears a minimum threshold. The exact metric and cutoff are deferred to [Accuracy Score metric & threshold](../issues/12-accuracy-score-metric-threshold.md).

**Coverage**: the whole Featured Game, every move by the Featured Side, from the reached opening position through to the game's end — not a host-curated subset of moments.

Not yet resolved: where a searchable games database/API with this criteria support comes from, and how that interacts with the earlier idea of the Host uploading a PGN directly — see [Games database/API research](../issues/10-games-database-api-research.md) and [PGN upload's role alongside live plenum search](../issues/16-pgn-upload-role.md).
