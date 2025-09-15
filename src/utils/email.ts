import { config } from "../config";
export async function sendMail(to: string, subject: string, html: string) {
console.log("\n[EMAIL] ", { from: config.mailFrom, to, subject, html });
}