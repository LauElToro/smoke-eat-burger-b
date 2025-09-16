import nodemailer from "nodemailer";

// Usa SMTP si está configurado. Si falla o no hay SMTP, intenta con Resend API (opcional).
const hasSmtp = !!process.env.SMTP_HOST;
const hasResend = !!process.env.RESEND_API_KEY;

let transporter: nodemailer.Transporter | null = null;

if (hasSmtp) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure:
      String(process.env.SMTP_SECURE || "").toLowerCase() === "true" ||
      Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
    // ⚠️ Usá esto sólo si tu proveedor tiene certificados raros:
    tls:
      String(process.env.SMTP_ALLOW_SELF_SIGNED || "").toLowerCase() === "true"
        ? { rejectUnauthorized: false }
        : undefined,
    logger: Boolean(process.env.MAIL_DEBUG),
  } as any);
}

const FROM =
  process.env.MAIL_FROM || `Smoke Eat Burger <no-reply@smokeeatburger.com>`;
const APP_URL = process.env.APP_URL || "smokeeatburger.com";

type SendParams = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export async function sendMail(p: SendParams) {
  if (String(process.env.MAIL_DISABLE) === "1") {
    console.warn("[mailer] MAIL_DISABLE=1: skip envío", p.subject, p.to);
    return { ok: true, skipped: true, via: "disabled" };
  }

  const text = p.text || p.html.replace(/<[^>]+>/g, " ");

  // 1) SMTP
  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: FROM,
        to: p.to,
        subject: p.subject,
        html: p.html,
        text,
      });
      console.log("[mailer] SMTP ok:", info.messageId);
      return { ok: true, via: "smtp", id: info.messageId };
    } catch (e: any) {
      console.error("[mailer] SMTP fail:", e?.message || e);
      // sigue abajo a fallback si hay Resend
    }
  }

  // 2) Resend API (fallback opcional)
  if (hasResend) {
    try {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM,
          to: p.to,
          subject: p.subject,
          html: p.html,
          text,
        }),
      });
      const body = await resp.text();
      if (!resp.ok) throw new Error(`Resend ${resp.status}: ${body}`);
      console.log("[mailer] Resend ok");
      return { ok: true, via: "resend" };
    } catch (e: any) {
      console.error("[mailer] Resend fail:", e?.message || e);
    }
  }

  // 3) Si nada funcionó:
  throw new Error("No se pudo enviar el email (SMTP y/o Resend fallaron)");
}

export async function sendVerificationEmail(to: string, token: string) {
  const link = `${APP_URL.replace(/\/$/, "")}/auth/verify-email?token=${encodeURIComponent(
    token
  )}`;
  const subject = "Verificá tu email";
  const html = `
    <p>¡Hola! Gracias por registrarte en Smoke Eat Burger 🍔</p>
    <p>Para activar tu cuenta, hacé click en el siguiente enlace:</p>
    <p><a href="${link}">${link}</a></p>
    <p>Si no fuiste vos, ignorá este mensaje.</p>
  `;
  return sendMail({ to, subject, html });
}

// Verifica el transporte en el arranque (útil para logs tempranos)
export async function verifyMailTransport() {
  if (!transporter) {
    if (hasResend) {
      console.log("[mailer] SMTP no configurado. Se usará Resend API.");
    } else {
      console.warn(
        "[mailer] Sin SMTP ni Resend. No se podrán enviar emails en producción."
      );
    }
    return;
  }
  try {
    await transporter.verify();
    console.log("[mailer] SMTP verify OK");
  } catch (e: any) {
    console.error("[mailer] SMTP verify FAIL:", e?.message || e);
  }
}