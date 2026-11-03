# Tooling gotchas

## `shadcn-svelte` CLI cannot run against this repo

This repo imports from `src/lib` via the package.json `imports` field (`#lib`,
`#lib/*`) rather than the conventional `$lib` alias — a deliberate SvelteKit 3
migration, not a misconfiguration. SvelteKit 3 actively removed the old
`$lib`/`svelte.config.js` alias mechanism (see `removed_modules` handling in
`@sveltejs/kit`'s Vite plugin), so there's no `tsconfig.compilerOptions.paths`
entry for `$lib` to add back without fighting the framework's own direction.

`components.json`'s aliases (`"lib": "$lib"`, etc.) are only there to satisfy
the `shadcn-svelte` CLI's schema — they don't reflect how imports actually
resolve. The CLI validates those aliases against tsconfig `paths` and
hard-fails (or loops on the same failing prompt interactively) because the
match never exists.

**Workaround**: don't invoke the CLI (`npx shadcn-svelte init/add/apply`).
Fetch the registry content directly over HTTP and apply it by hand:

```
https://shadcn-svelte.com/registry/styles/<style>/<component>.json
https://shadcn-svelte.com/registry/colors/<baseColor>.json
```

Diff the fetched JSON's `files[].content` against the local
`src/lib/components/ui/**` files, rewriting `$lib/*` import paths in the
fetched content to `#lib/*` as you apply them. See commit `dcd24b5` (issue
#79) for a worked example — it hand-applied the `rhea` style's `button` and
`card` components and the `olive` base color this way.
