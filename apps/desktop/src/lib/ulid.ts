/** Minimal ULID (Crockford base32, 48-bit time + 80-bit random) — node ids
 *  minted in the Sketch editor must be real ULIDs so the backend's
 *  heal-on-load (which only mints for EMPTY ids) leaves them alone. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function ulid(): string {
  let time = Date.now();
  const chars = new Array<string>(26);
  for (let i = 9; i >= 0; i--) {
    chars[i] = ALPHABET[time % 32];
    time = Math.floor(time / 32);
  }
  const rand = new Uint8Array(16);
  crypto.getRandomValues(rand);
  for (let i = 0; i < 16; i++) {
    chars[10 + i] = ALPHABET[rand[i] % 32];
  }
  return chars.join("");
}
