import { Injectable, Logger } from '@nestjs/common';

const RESEND_URL = 'https://api.resend.com/emails';
const SEND_TIMEOUT_MS = 10_000;

export type Mail = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

/**
 * Sends through Resend when it is configured. With no key it logs the message
 * instead of pretending to send, which keeps local development working
 * without an account and makes a missing key obvious rather than silent.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  get configured(): boolean {
    return Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
  }

  async send(mail: Mail): Promise<boolean> {
    if (!this.configured) {
      this.logger.warn(
        `No mail provider configured — not sending "${mail.subject}" to ${mail.to}.\n${mail.text}`,
      );
      return false;
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

      const res = await fetch(RESEND_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.MAIL_FROM,
          to: [mail.to],
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        }),
      });
      clearTimeout(timer);

      if (!res.ok) {
        // The body carries the reason — a domain that is not verified yet is
        // the usual one, and it is worth seeing in the log.
        this.logger.error(
          `Mail provider refused the message (${res.status}): ${await res
            .text()
            .catch(() => '')}`,
        );
        return false;
      }

      return true;
    } catch (err) {
      this.logger.error(`Could not reach the mail provider: ${String(err)}`);
      return false;
    }
  }
}
