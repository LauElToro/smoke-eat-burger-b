import nodemailer from "nodemailer";

function envBool(name: string, def = false) {
  const v = process.env[name];
  if (v === undefined) return def;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
}

export const config = {
  app: {
    port: Number(process.env.PORT || 5175),
    baseUrl: process.env.BASE_URL || "http://localhost:5175",
  },
  mysql: {
    host: process.env.MYSQL_HOST!,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER!,
    password: process.env.MYSQL_PASSWORD!,
    database: process.env.MYSQL_DATABASE!,
    ssl: envBool("MYSQL_USE_SSL", false) ? { rejectUnauthorized: false } : undefined,
  },
  jwt: {
   secret: process.env.JWT_SECRET || "dev-secret",
   expiresIn: (process.env.JWT_EXPIRES_IN || "7d") as string | number,
  },
  bcrypt: {
    rounds: Number(process.env.BCRYPT_ROUNDS || 10),
  },
  points: {
    per10k: Number(process.env.POINTS_PER_10K || 100),
    referralBonus: Number(process.env.REFERRAL_BONUS || 50),
  },
  signup: {
    check: (process.env.SIGNUP_EMAIL_CHECK || "off").toLowerCase() as "on" | "off",
  },
  mail: {
    from: process.env.MAIL_FROM || "Smoke Eat Burger <no-reply@localhost>",
    dryRun: envBool("MAILER_DRY_RUN") || envBool("EMAIL_DRY_RUN"),
    mxCheck: envBool("MAIL_MX_CHECK", false),
    driver: (process.env.MAILER_DRIVER || "smtp") as "smtp" | "log",
    smtp: {
      host: process.env.SMTP_HOST || "",
      port: Number(process.env.SMTP_PORT || 465),
      secure: envBool("SMTP_SECURE", true),
      auth: {
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASS || "",
      },
    },
  },
  mailer: {
    async sendMail({ to, subject, html, text }: { to: string; subject: string; html?: string; text?: string; }) {
      // DRY-RUN o driver=log ⇒ no se envía nada real
      if (config.mail.dryRun || config.mail.driver === "log") {
        console.log("[mailer] DRY-RUN email:", JSON.stringify({ to, subject }, null, 2));
        return;
      }
      const transporter = nodemailer.createTransport(config.mail.smtp);
      await transporter.sendMail({
        from: config.mail.from,
        to,
        subject,
        html,
        text,
      });
    }
  }
};
