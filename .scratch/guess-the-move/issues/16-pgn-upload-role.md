Status: open
Type: grilling
Blocked by: 10

## Question

Earlier grilling ("How do the accurate games get into the system?") settled on supporting both Host PGN upload and live database search — but the later Plenum Selection Phase decision established live criteria-search as the actual per-Session game-finding mechanic, with no mention of manual upload in that flow. Reconcile the two: is PGN upload (a) a fallback within the live flow when criteria search returns nothing good, (b) how games get added to the searchable pool in the first place (a Task, not a per-Session Host action), (c) an entirely separate session-start path that bypasses the Plenum Selection Phase, or (d) dropped now that live search is the decided mechanic?

Blocked on [Games database/API research](10-games-database-api-research.md) since the answer depends on whether the chosen database already covers the games this format needs, or leaves gaps a manual upload would need to fill.
