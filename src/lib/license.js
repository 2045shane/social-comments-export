import { LICENSE_TOKEN_PREFIX } from './constants.js';

/**
 * Local format check only. This string is not an API key and is never sent.
 * The repository is public, so this verifies a token Shane hands out;
 * it is not a server-side license issuer.
 */
const LICENSE_MAC_MATERIAL = 'sce-local-license-format-v1';
const LICENSE_PAYLOAD = 'social-comments-export:unlock:v1';

function bytesToB64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlToBytes(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function mac(payload) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(LICENSE_MAC_MATERIAL),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return new Uint8Array(signature);
}

function sameBytes(left, right) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left[index] ^ right[index];
  return diff === 0;
}

/** Mint a token. Used by tests and by whoever copies a code into a Xiaohongshu reply. */
export async function issueLicense() {
  const signature = bytesToB64url(await mac(LICENSE_PAYLOAD));
  return `${LICENSE_TOKEN_PREFIX}.${signature}`;
}

export async function verifyLicense(token) {
  const text = String(token || '').trim();
  const prefix = `${LICENSE_TOKEN_PREFIX}.`;
  if (!text.startsWith(prefix)) return false;
  const signature = text.slice(prefix.length);
  if (!/^[A-Za-z0-9_-]{43}$/.test(signature)) return false;
  let given;
  try {
    given = b64urlToBytes(signature);
  } catch {
    return false;
  }
  const expected = await mac(LICENSE_PAYLOAD);
  return sameBytes(given, expected);
}
