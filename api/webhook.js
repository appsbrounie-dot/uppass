export const config = {
  api: {
    bodyParser: false,
  },
};

import Stripe from 'stripe';
import admin from 'firebase-admin';

// Inicializa Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ⚠️ TEMPORAL: Firebase desactivado para evitar crash
/*
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_KEY)
    ),
  });
}
*/

export default async function handler(req, res) {
  try {
    // ⚠️ TEMPORAL: solo responder OK para validar que todo funciona
    return res.status(200).json({ received: true });

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
