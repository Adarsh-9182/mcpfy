import "server-only";

/**
 * Sending transactional mail.
 *
 * The development transport prints the message — including the link — to the
 * server log. That is not a stub: password reset and email verification are
 * unusable until mail is deliverable, and requiring an email provider before
 * anyone can test a signup flow means the flow goes untested. Printing it
 * makes the whole path exercisable on a laptop with nothing configured.
 *
 * Production requires a real provider and says so loudly rather than
 * pretending to send. A reset email that silently vanishes is worse than one
 * that fails.
 */

export interface Email {
  to: string;
  subject: string;
  /** Plain text. Always sent — some clients never render the HTML part. */
  text: string;
  html?: string;
}

export type Transport = "console" | "resend";

export function emailTransport(): Transport {
  return process.env.RESEND_API_KEY ? "resend" : "console";
}

export async function sendEmail(email: Email): Promise<void> {
  if (emailTransport() === "resend") {
    await sendWithResend(email);
    return;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "No email provider is configured, so this message cannot be delivered. " +
        "Set RESEND_API_KEY and EMAIL_FROM.",
    );
  }

  logToConsole(email);
}

/**
 * Prints the message with the link on its own line.
 *
 * Formatted to be findable in a busy dev log — the reason a developer is
 * reading this at all is to click the link.
 */
function logToConsole(email: Email): void {
  const link = email.text.match(/https?:\/\/\S+/)?.[0];
  const rule = "─".repeat(64);

  console.log(
    [
      "",
      rule,
      `  email → ${email.to}`,
      `  ${email.subject}`,
      link ? `\n  ${link}\n` : "",
      `  (printed because no RESEND_API_KEY is set; nothing was sent)`,
      rule,
      "",
    ].join("\n"),
  );
}

async function sendWithResend(email: Email): Promise<void> {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new Error("EMAIL_FROM must be set when RESEND_API_KEY is.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: email.to,
      subject: email.subject,
      text: email.text,
      ...(email.html ? { html: email.html } : {}),
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Resend rejected the message (${response.status}). ${detail.slice(0, 300)}`,
    );
  }
}

/* --------------------------------------------------------------- templates */

/**
 * One layout for every message.
 *
 * Deliberately plain: transactional mail that looks like marketing gets
 * filtered like marketing, and the only thing the reader needs is the link.
 */
function layout(heading: string, body: string, action: { label: string; url: string }) {
  const html = `<!doctype html>
<html><body style="margin:0;padding:32px 16px;background:#f4f4f5;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border:1px solid #e4e4e7;border-radius:10px;">
      <tr><td style="padding:28px 28px 0;">
        <p style="margin:0 0 20px;font-size:15px;font-weight:600;color:#18181b;">MCPfy</p>
        <h1 style="margin:0 0 12px;font-size:19px;line-height:1.3;color:#18181b;">${heading}</h1>
        <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#52525b;">${body}</p>
        <a href="${action.url}" style="display:inline-block;padding:10px 18px;background:#6b52f5;color:#ffffff;font-size:14px;font-weight:500;text-decoration:none;border-radius:7px;">${action.label}</a>
      </td></tr>
      <tr><td style="padding:22px 28px 28px;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:#71717a;">
          If the button does not work, paste this into your browser:<br>
          <span style="word-break:break-all;color:#52525b;">${action.url}</span>
        </p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  const text = `MCPfy — ${heading}\n\n${body.replace(/<[^>]+>/g, "")}\n\n${action.url}\n`;
  return { html, text };
}

export function resetPasswordEmail(to: string, url: string): Email {
  const { html, text } = layout(
    "Reset your password",
    "Someone asked to reset the password for this account. If that was not you, nothing has changed and you can ignore this. The link expires in one hour.",
    { label: "Choose a new password", url },
  );
  return { to, subject: "Reset your MCPfy password", text, html };
}

export function verifyEmailEmail(to: string, url: string): Email {
  const { html, text } = layout(
    "Confirm your email",
    "Confirming your address lets us reach you about deployments and security events. It takes one click.",
    { label: "Confirm this address", url },
  );
  return { to, subject: "Confirm your MCPfy email", text, html };
}
