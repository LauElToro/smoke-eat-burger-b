type DbConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  useSSL: boolean;
};

export const config = {
  port: Number(process.env.PORT || 5175),
  baseUrl: process.env.APP_URL || process.env.BASE_URL || "http://localhost:5175",

  // JWT
  jwtSecret: process.env.JWT_SECRET || "change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",

  // Bcrypt
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 10),

  // MySQL
  mysql: {
    host: process.env.MYSQL_HOST!,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER!,
    password: process.env.MYSQL_PASSWORD!,
    database: process.env.MYSQL_DATABASE!,
    useSSL: String(process.env.MYSQL_USE_SSL || "").toLowerCase() === "true"
  } as DbConfig,

  // SMTP
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure:
      String(process.env.SMTP_SECURE || "").toLowerCase() === "true" ||
      Number(process.env.SMTP_PORT) === 465,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM || "Smoke Eat Burger <no-reply@smokeeatburger.com>"
  },

  // Flags email
  emailDryRun: String(process.env.MAIL_DISABLE || "") === "1",
  mailDebug: String(process.env.MAIL_DEBUG || "") === "1",

  // Opciones de signup
  signupEmailCheck: (process.env.SIGNUP_EMAIL_CHECK as "strict" | "mx" | "off") || "off",
  mailMxCheck: String(process.env.MAIL_MX_CHECK || "") === "1",

  // Rewards (alias + objeto)
  pointsPer10k: Number(process.env.POINTS_PER_10K || 100),
  referralBonus: Number(process.env.REFERRAL_BONUS || 50),
  rewards: {
    pointsPer10k: Number(process.env.POINTS_PER_10K || 100),
    referralBonus: Number(process.env.REFERRAL_BONUS || 50)
  },

  // JWT alias agrupado (por compatibilidad con algunos servicios)
  jwt: {
    secret: process.env.JWT_SECRET || "change-me",
    expiresIn: process.env.JWT_EXPIRES_IN || "7d"
  },

  // Seguridad agrupada (para compat con utils/crypto.ts)
  security: {
    bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 10)
  }
};

export type AppConfig = typeof config;