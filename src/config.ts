export type DbConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionLimit: number;
  ssl?: {
    rejectUnauthorized?: boolean;
  } | false;
};

const dbSsl =
  /^(true|1|on)$/i.test(process.env.DB_SSL || "") ?
    { rejectUnauthorized: /^(true|1)$/i.test(process.env.DB_SSL_REJECT_UNAUTHORIZED || "false") } :
    false;

const dbConf: DbConfig = {
  host: process.env.DB_HOST || "193.203.175.107",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "u398094984_Burger",
  password: process.env.DB_PASSWORD || "Smoke12?@",
  database: process.env.DB_NAME || "u398094984_Burger",
  connectionLimit: Number(process.env.DB_POOL || 10),
  ssl: dbSsl,
};

export const config = {
  port: Number(process.env.PORT || 5175),
  baseUrl: (process.env.BASE_URL || "http://localhost:5173").toString(),
  jwtSecret: (process.env.JWT_SECRET || "dev-secret-change-me").toString(),
  db: dbConf,
  mysql: dbConf, // alias compat
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 465),
    secure: /^true$/i.test(process.env.SMTP_SECURE || "true"),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.MAIL_FROM || "Smoke Eat Burger <no-reply@localhost>",
  },
  emailDryRun: /^(true|1)$/i.test(process.env.EMAIL_DRY_RUN || ""),
  signupEmailCheck: (process.env.SIGNUP_EMAIL_CHECK || "strict") as "strict"|"soft"|"off",
  mailMxCheck: /^(true|1)$/i.test(process.env.MAIL_MX_CHECK || "false"),
};