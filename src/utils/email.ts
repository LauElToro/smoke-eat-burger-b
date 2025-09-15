import nodemailer from 'nodemailer';
import { config } from '../config';

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.secure,
  auth: { user: config.smtp.user, pass: config.smtp.pass },
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
});

export async function sendMail(to: string, subject: string, html: string, text?: string) {
  const info = await transporter.sendMail({
    from: config.smtp.from,
    to,
    subject,
    html,
    text: text || html.replace(/<[^>]+>/g, ''), // fallback texto plano
  });
  if (process.env.NODE_ENV !== 'production') {
    console.log('Email sent:', info.messageId);
  }
  return info;
}
