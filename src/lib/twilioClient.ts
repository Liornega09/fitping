/**
 * Minimal Twilio REST client for outbound WhatsApp messages.
 *
 * Twilio's API: POST https://api.twilio.com/2010-04-01/Accounts/{Sid}/Messages.json
 * with HTTP Basic auth (Account SID + Auth Token) and form-encoded body.
 *
 * We deliberately avoid the official `twilio` npm package to keep the
 * dependency footprint small — fetch + URLSearchParams is enough.
 */

export type TwilioCredentials = {
  accountSid: string;
  authToken: string;
  fromNumber: string; // e.g. "whatsapp:+14155238886"
};

export type SendWhatsAppMessageInput = {
  to: string;   // e.g. "whatsapp:+972500000001"
  body: string;
};

export interface TwilioSender {
  sendWhatsAppMessage(input: SendWhatsAppMessageInput): Promise<{ sid: string }>;
}

export class TwilioRestClient implements TwilioSender {
  private readonly endpoint: string;
  private readonly authHeader: string;

  constructor(private readonly creds: TwilioCredentials) {
    this.endpoint = `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages.json`;
    this.authHeader =
      'Basic ' + Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString('base64');
  }

  async sendWhatsAppMessage(input: SendWhatsAppMessageInput): Promise<{ sid: string }> {
    const params = new URLSearchParams({
      To: input.to,
      From: this.creds.fromNumber,
      Body: input.body
    });

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`Twilio send failed (${res.status}): ${errorBody}`);
    }

    const json = (await res.json()) as { sid?: string };
    return { sid: json.sid ?? '' };
  }
}

/**
 * Build a sender from environment variables, or return null if any required
 * credential is missing. Callers can decide whether to fail loudly or skip.
 */
export function twilioSenderFromEnv(): TwilioSender | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;
  if (!accountSid || !authToken || !fromNumber) return null;
  return new TwilioRestClient({ accountSid, authToken, fromNumber });
}
