import { rmSync } from 'node:fs';

for (const dir of ['.svelte-kit/output', '.svelte-kit/cloudflare', '.svelte-kit/cloudflare-tmp']) {
	rmSync(dir, { recursive: true, force: true });
}
