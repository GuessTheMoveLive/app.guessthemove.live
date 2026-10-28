// Room Code and Host Token generation (#37). The Room Code is public (shown on the
// QR/join screen); the Host Token is a separate secret embedded only in the Host's
// own Session URL. See SessionRoom.createSession for how the token is bound to a code.

// Uppercase letters + digits, excluding visually-ambiguous characters (0/O, 1/I/L) -
// people retype this off a projected screen. 32 symbols ^ 6 chars ≈ 1 billion
// combinations, which is enough that a random collision retry (see createSession)
// is sufficient without a dedicated registry.
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;

export function generateRoomCode(): string {
	let code = '';
	const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
	for (const byte of bytes) {
		code += ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length];
	}
	return code;
}

/** A secret bearer credential for Host control - never shown on the shared/QR view (#37). */
export function generateHostToken(): string {
	return crypto.randomUUID();
}
