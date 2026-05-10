import crypto from 'node:crypto';

/**
 * Computes the expected Twilio signature for a request.
 *
 * Per Twilio's spec, the signature is HMAC-SHA1 (base64) of:
 *   fullUrl + concat(sortedKey + value) for every POST form param.
 *
 * Reference:
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
export function computeTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string | undefined>
): string {
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + (params[key] ?? '');
  }
  return crypto.createHmac('sha1', authToken).update(data, 'utf8').digest('base64');
}

/**
 * Constant-time validation of an incoming X-Twilio-Signature header.
 */
export function validateTwilioSignature(
  authToken: string,
  signature: string | undefined,
  url: string,
  params: Record<string, string | undefined>
): boolean {
  if (!signature) {
    return false;
  }

  const expected = computeTwilioSignature(authToken, url, params);
  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(signature, 'utf8');

  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}
