import { version } from '../../package.json';

/** The running build's version (#73), read from package.json's own `version` field at
 *  build time — the single source of truth, bumped by convention at the end of a work
 *  session that ships a batch of changes. Shown in the sticky footer so a Host or
 *  Participant can tell exactly which build a Session is running on. */
export const appVersion = version;
