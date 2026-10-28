# Keep shadcn-svelte as the UI component base

**Status**: accepted

We considered dropping shadcn-svelte (currently backing `Card`/`Button` under `web/src/lib/components/ui`, with `tailwind-variants`, `cn`, and `tw-animate-css` as its scaffolding) in favor of a fully hand-rolled Tailwind component set, in order to match specific layouts taken from shadcn's (React) site more exactly. We decided to keep shadcn-svelte: its CLI already copies ownable, editable Svelte+Tailwind source straight into the repo rather than pulling in a runtime dependency, so "add the closest component via `shadcn-svelte add`, then hand-edit it to match a chosen layout" is the same amount of custom work as building from scratch, except it starts from a working, accessible implementation instead of a blank file.

## Considered Options

- **Skeleton, Flowbite-Svelte, DaisyUI**: each carries its own visual language; matching a specific shadcn-style layout would mean fighting the library's defaults rather than building on them.
- **Melt UI / Bits UI directly**: these are the headless primitives shadcn-svelte itself is built on. Using them directly means re-implementing the styling layer shadcn-svelte already provides, for no behavioral gain.
- **Fully custom Tailwind components**: viable, but equivalent in effort to the chosen approach while discarding a working starting point.

## Consequences

New layouts lifted from shadcn.com (React) should be implemented by pulling in the nearest shadcn-svelte component via its CLI and editing the generated file, not by porting JSX by hand or introducing a second component system alongside it.
