# Explicit Game Catalog manifest instead of auto-discovering built game files

Built game files land in `src/lib/data/*.json` before they're necessarily ready to show live — a work-in-progress or incomplete answer key can sit there mid-development. Auto-discovering every JSON file in that directory would surface those to the Host immediately. Instead, the Game Catalog is a small, explicit manifest (`{ id, dataFile }` entries) listing only the games deliberately added — a new game requires one line added to the manifest, not just a file drop.

Catalog display facts (players, year, tournament, ECO code, move count, Elo when present) are read directly from each game's own PGN-derived headers rather than hand-authored, so the PGN stays the single source of truth and nothing drifts out of sync with it.

A real database-backed catalog (with filtering, sorting, pagination) is planned once the library grows large enough to need it; the manifest is the deliberately simple v1.
