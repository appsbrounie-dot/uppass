export const config = {
  api: {
    bodyParser: false,
  },
};

import Stripe from 'stripe';
import admin from 'firebase-admin';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Inicializar Firebase una sola vez
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_KEY)
    ),
  });
}

export default async function handler(req, res) {
  try {
    // 🔥 Por ahora evitamos crash (luego metemos Stripe real)
    const event = {};

    // Si en el futuro viene evento real
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      const email = session.customer_details?.email;
      const product = session.metadata?.product;

      let access = [];

      if (product === 'CDMX') access = ['CDMX'];
      if (product === 'MTY') access = ['MTY'];
      if (product === 'GDL') access = ['GDL'];
      if (product === 'FULL_MX') access = ['CDMX', 'MTY', 'GDL'];

      if (email) {
        await admin.firestore().collection('users').add({
          email,
          access,
          createdAt: new Date().toISOString(),
        });
      }
    }

    // ✅ SIEMPRE RESPONDE
    return res.status(200).json({ received: true });

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
