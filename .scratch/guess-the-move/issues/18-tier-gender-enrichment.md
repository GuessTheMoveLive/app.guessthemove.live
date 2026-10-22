Status: open
Type: grilling

## Question

[Games database/API research](10-games-database-api-research.md) found that no game source (Lichess, Chess.com, PGN archives) exposes tournament-tier or player-gender metadata directly. Tier would have to be derived by fetching each Candidate Game's PGN and matching its `Event` tag against a tier table the app curates itself; gender would have to come from an offline join against FIDE's official ratings list (`ratings.fide.com`, which has a `sex` field) by player name/FIDE ID — a fragile, name-matching-dependent join with no chess API support at all.

Decide: is this enrichment worth building (as a one-time seed dataset the app ships with, or an ongoing maintenance task), or should one or both of "tournament tier" and "gender" be dropped from the Plenum Selection Phase's search criteria given the cost/fragility of getting them? If kept, who/what maintains the tier table over time as new tournaments happen?
