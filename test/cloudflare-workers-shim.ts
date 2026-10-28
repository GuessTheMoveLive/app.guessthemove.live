// Stand-in for the `cloudflare:workers` module, which only exists inside the
// Workers runtime. Aliased in for tests only (see vite.config.ts) so modules
// built on `DurableObject` can be imported and exercised under Node with a
// fake ctx/env - see session-room.spec.ts.
export class DurableObject<Env = unknown> {
	ctx: unknown;
	env: Env;

	constructor(ctx: unknown, env: Env) {
		this.ctx = ctx;
		this.env = env;
	}
}
