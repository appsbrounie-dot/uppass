import Stripe from 'stripe';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();
const adminAuth = getAuth();

const PRODUCT_MAP = {
  'price_1TKNcTRzkfdGsko9Y9vMiIGD': ['CDMX'],
  'price_1TKNlIRzkfdGsko9ZyggP2pk': ['MTY'],
  'price_1TKNmDRzkfdGsko9JNVfINAv': ['GDL'],
  'price_1TKNoeRzkfdGsko99UWhB2KJ': ['CDMX', 'GDL', 'MTY'],
};

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const customerEmail = (
      session.customer_details?.email ||
      session.customer_email || ''
    ).toLowerCase().trim();

    if (!customerEmail) {
      console.error('No email en sesión');
      return res.status(200).json({ received: true });
    }

    // Obtener ciudades compradas
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
    const citiesSet = new Set();
    for (const item of lineItems.data) {
      const mapped = PRODUCT_MAP[item.price?.id];
      if (mapped) mapped.forEach(c => citiesSet.add(c));
    }

    if (citiesSet.size === 0) {
      console.log('Sin productos mapeados para sesión:', session.id);
      return res.status(200).json({ received: true });
    }

    const newCities = [...citiesSet];
    console.log(`Ciudades compradas por ${customerEmail}:`, newCities);

    // Verificar si ya existe usuario en Firebase Auth
    let uid = null;
    try {
      const userRecord = await adminAuth.getUserByEmail(customerEmail);
      uid = userRecord.uid;
    } catch (e) {
      uid = null; // Usuario aún no registrado
    }

    if (uid) {
      // Usuario ya existe — actualizar users/{uid}
      const docRef = db.collection('users').doc(uid);
      const existing = await docRef.get();
      if (existing.exists) {
        const current = existing.data().access || [];
        const merged = [...new Set([...current, ...newCities])];
        await docRef.update({ access: merged });
        console.log(`✓ Acceso actualizado para ${customerEmail}: ${merged}`);
      } else {
        await docRef.set({ email: customerEmail, access: newCities });
        console.log(`✓ Doc creado para ${customerEmail}: ${newCities}`);
      }
    } else {
      // Usuario no registrado — guardar en pending_access
      const pendingRef = db.collection('pending_access').doc(customerEmail);
      const existing = await pendingRef.get();
      if (existing.exists) {
        const current = existing.data().access || [];
        const merged = [...new Set([...current, ...newCities])];
        await pendingRef.update({ access: merged, updatedAt: new Date().toISOString() });
      } else {
        await pendingRef.set({
          email: customerEmail,
          access: newCities,
          createdAt: new Date().toISOString(),
          stripeSession: session.id,
        });
      }
      console.log(`✓ Acceso pendiente guardado para ${customerEmail}: ${newCities}`);
    }
  }

  return res.status(200).json({ received: true });
}
