import "dotenv/config";


export const config = {
port: Number(process.env.PORT || 5175),
jwtSecret: process.env.JWT_SECRET || "dev-secret",
jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 10),
pointsPer10k: Number(process.env.POINTS_PER_10K || 100),
referralBonus: Number(process.env.REFERRAL_BONUS || 50),
baseUrl: process.env.BASE_URL || "http://localhost:5175",
mailFrom: process.env.MAIL_FROM || "Smoke Eat <no-reply@smokeeat.local>",
mysql: {
host: process.env.MYSQL_HOST || "localhost",
port: Number(process.env.MYSQL_PORT || 3306),
user: process.env.MYSQL_USER || "root",
password: process.env.MYSQL_PASSWORD || "",
database: process.env.MYSQL_DATABASE || "smokeeat",
useSSL: (process.env.MYSQL_USE_SSL || "false").toLowerCase() === "true",
},
 smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: /^(true|1)$/i.test(process.env.SMTP_SECURE || ''),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'Smoke Eat Burger <no-reply@example.com>',
  },
};