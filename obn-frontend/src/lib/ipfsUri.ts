// Accept content-addressed CIDv0 and CIDv1 (base32/base58btc/base36), never IPNS or URLs.
// Decode the small CID header/digest envelope instead of accepting an arbitrary gateway path.
function decodeBase(value: string, alphabet: string): number[] {
  let number = 0n;
  for (const character of value) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error("Invalid CID");
    number = number * BigInt(alphabet.length) + BigInt(digit);
  }
  const bytes: number[] = [];
  while (number) { bytes.unshift(Number(number & 255n)); number >>= 8n; }
  for (const character of value) { if (character !== alphabet[0]) break; bytes.unshift(0); }
  return bytes;
}

function cidBytes(cid: string): number[] {
  if (cid.length > 128) throw new Error("Invalid CID");
  const base58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  if (/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(cid)) {
    const digest = decodeBase(cid, base58);
    if (digest.length !== 34 || digest[0] !== 0x12 || digest[1] !== 0x20) throw new Error("Invalid CID");
    return [1, 0x70, ...digest];
  }
  if (cid[0] === "z") return decodeBase(cid.slice(1), base58);
  if (cid[0] === "k") return decodeBase(cid.slice(1), "0123456789abcdefghijklmnopqrstuvwxyz");
  if (!/^b[a-z2-7]+$/.test(cid)) throw new Error("Invalid CID");
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  const bytes: number[] = [];
  let buffer = 0, bits = 0;
  for (const character of cid.slice(1)) {
    buffer = (buffer << 5) | alphabet.indexOf(character); bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((buffer >> bits) & 255); buffer &= (1 << bits) - 1; }
  }
  if (buffer !== 0 || bits >= 5) throw new Error("Invalid CID");
  return bytes;
}

export function normalizeIpfsUri(uri: string): string {
  if (uri.length > 2_048 || !uri.startsWith("ipfs://") || /[?#\\\u0000-\u001f\u007f]/.test(uri)) {
    throw new Error("Invalid IPFS URI");
  }
  const [cid, ...segments] = uri.slice(7).replace(/^ipfs\//, "").split("/");
  const bytes = cidBytes(cid);
  let offset = 0;
  const varint = () => {
    let value = 0, shift = 0;
    while (offset < bytes.length && shift <= 28) {
      const byte = bytes[offset++];
      value += (byte & 127) * 2 ** shift;
      if (!(byte & 128)) {
        if (shift && byte === 0) throw new Error("Invalid CID");
        return value;
      }
      shift += 7;
    }
    throw new Error("Invalid CID");
  };
  if (varint() !== 1 || varint() === 0 || varint() === 0) throw new Error("Invalid CID");
  const digestLength = varint();
  if (digestLength < 16 || digestLength > 64 || bytes.length - offset !== digestLength) throw new Error("Invalid CID");
  const path = segments.map((segment) => {
    const decoded = decodeURIComponent(segment);
    if (!decoded || decoded === "." || decoded === ".." || /[/%\\?#\u0000-\u001f\u007f]/.test(decoded)) {
      throw new Error("Invalid IPFS path");
    }
    return encodeURIComponent(decoded);
  });
  return `ipfs://${cid}${path.length ? "/" + path.join("/") : ""}`;
}

/** Permit gateway-to-gateway/subdomain redirects only for the exact same CID and path. */
export function matchesIpfsGatewayResource(url: URL, uri: string, gateways: string[]): boolean {
  try {
    if (url.search || url.hash || url.username || url.password || url.port || url.protocol !== "https:") return false;
    let candidate: string | undefined;
    for (const gateway of gateways) {
      const hostname = new URL(gateway).hostname;
      if (url.hostname === hostname && url.pathname.startsWith("/ipfs/")) candidate = "ipfs://" + url.pathname.slice(6);
      const suffix = ".ipfs." + hostname;
      if (url.hostname.endsWith(suffix)) {
        const cid = url.hostname.slice(0, -suffix.length);
        if (!cid.includes(".")) candidate = "ipfs://" + cid + (url.pathname === "/" ? "" : url.pathname);
      }
    }
    if (!candidate) return false;
    const original = normalizeIpfsUri(uri).slice(7).split("/");
    const redirected = normalizeIpfsUri(candidate).slice(7).split("/");
    return cidBytes(original[0]).join(",") === cidBytes(redirected[0]).join(",") && original.slice(1).join("/") === redirected.slice(1).join("/");
  } catch { return false; }
}
