export const config = {
  api: {
    bodyParser: false,
  },
};

import Stripe from 'stripe';
import admin from 'firebase-admin';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Firebase init
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_KEY)
    ),
  });
}

export default async function handler(req, res) {
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    const chunks = [];

    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const rawBody = Buffer.concat(chunks);

    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('❌ Error verificando webhook:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Evento correcto
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    const email = session.customer_details.email;
    const product = session.metadata.product;

    let access = [];

    if (product === 'CDMX') access = ['CDMX'];
    if (product === 'MTY') access = ['MTY'];
    if (product === 'GDL') access = ['GDL'];
    if (product === 'FULL_MX') access = ['CDMX','MTY','GDL'];

    await admin.firestore().collection('users').add({
      email,
      access,
      createdAt: new Date().toISOString(),
    });

    console.log('✅ Usuario creado:', email);
  }

  res.status(200).json({ received: true });
}
