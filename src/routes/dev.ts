import { Router } from 'express';
import { sendMail } from '../utils/email';

const router = Router();

router.get('/send-test-email', async (req, res) => {
  const to = String(req.query.to || '');
  if (!to) return res.status(400).json({ error: 'missing_to' });
  await sendMail(to, 'Test Smoke Eat Burger', '<h1>¡Hola!</h1><p>Esto es una prueba.</p>');
  res.json({ ok: true });
});

export default router;
