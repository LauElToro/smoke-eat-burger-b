import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { config } from "../config";

type SendResult = { messageId: string; accepted?: string[] };

type SendEmailOptions = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
};

let transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo> | null = null;

function buildTransport() {
  if (config.emailDryRun || process.env.NODE_ENV === "test") {
    // Transport “falso”: no envía, sólo loguea
    const fake = {
      async sendMail(opts: any): Promise<SendResult> {
        console.log(
          "[mailer] DRY-RUN email:",
          JSON.stringify({ to: opts.to, subject: opts.subject }, null, 2)
        );
        return {
          messageId: "dry-run",
          accepted: Array.isArray(opts.to) ? opts.to : [opts.to],
        };
      },
      verify: async () => true,
    } as any;
    return fake;
  }

  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  });
}

function getTransport() {
  if (!transporter) transporter = buildTransport();
  return transporter!;
}

/** Envío genérico */
export async function sendEmail(opts: SendEmailOptions): Promise<SendResult> {
  const t = getTransport();
  const res = await t.sendMail({
    from: opts.from ?? config.smtp.from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
  return res as SendResult;
}

/** Email de verificación con link */
export async function sendVerificationEmail(
  to: string,
  token: string
): Promise<SendResult> {
  const base =
    process.env.API_PUBLIC_URL /* opcional (ej. Render) */ ||
    config.baseUrl ||
    `http://localhost:${process.env.PORT || 5175}`;

  const verifyUrl = `${base.replace(/\/+$/, "")}/auth/verify-email?token=${encodeURIComponent(
    token
  )}`;

  return sendEmail({
    to,
    subject: "Confirmá tu correo · Smoke Eat Burger",
    text: `Confirmá tu correo entrando a: ${verifyUrl}`,
    html: `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
        <h2>¡Bienvenido/a!</h2>
        <p>Para activar tu cuenta, verificá tu email con este enlace:</p>
        <p><a href="${verifyUrl}">${verifyUrl}</a></p>
        <p>Si no intentaste registrarte, ignorá este correo.</p>
      </div>
    `,
  });
}
