import type { Mail } from './mail.service';

/**
 * Plain and short on purpose: a first message from an unknown domain that
 * looks like a newsletter is the one that lands in spam.
 */
export const verificationEmail = (to: string, link: string): Mail => ({
  to,
  subject: 'Confirm your Nukaloot account',
  text: [
    'Confirm your email to finish creating your Nukaloot account:',
    '',
    link,
    '',
    'The link works for 24 hours.',
    'If you did not sign up, ignore this message — the account stays inactive and is removed on its own.',
  ].join('\n'),
  html: `
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#111">
  <p>Confirm your email to finish creating your Nukaloot account.</p>
  <p style="margin:24px 0">
    <a href="${link}" style="background:#16a34a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">
      Confirm my email
    </a>
  </p>
  <p style="color:#555;font-size:13px">Or paste this into your browser:<br><span style="word-break:break-all">${link}</span></p>
  <p style="color:#555;font-size:13px">The link works for 24 hours.</p>
  <p style="color:#555;font-size:13px">
    If you did not sign up, ignore this message — the account stays inactive and is removed on its own.
  </p>
</div>`.trim(),
});
