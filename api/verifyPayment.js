const crypto = require('crypto');
const admin = require('firebase-admin');

export default async function handler(req, res) {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // 1. Initialize Admin
    if (!admin.apps.length) {
        try {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        } catch (e) {
            console.error("Firebase Init Error (Check your JSON format):", e);
            return res.status(500).json({ error: "Firebase Init Failed" });
        }
    }

    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, userId, planTier, amountPaid } = req.body;

    // 2. DEBUGGING: Check for missing variables
    const secret = process.env.RAZORPAY_KEY_SECRET;
    
    console.log("DEBUG - Secret Exists:", !!secret);
    console.log("DEBUG - Order ID:", razorpay_order_id);
    console.log("DEBUG - Signature:", razorpay_signature);

    if (!secret || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ error: "Missing data or missing secret keys in Vercel Env Vars" });
    }

    // 3. Verify Signature
    const generated_signature = crypto
        .createHmac('sha256', secret)
        .update(razorpay_order_id + "|" + razorpay_payment_id)
        .digest('hex');

    if (generated_signature === razorpay_signature) {
        try {
            const db = admin.firestore();
            await db.collection('student_details').doc(userId).set({
                isPaid: true,
                planTier: planTier,
                paymentId: razorpay_payment_id,
                paymentDate: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            res.status(200).json({ success: true });
        } catch (dbError) {
            console.error("DB Error:", dbError);
            res.status(500).json({ error: 'Database update failed' });
        }
    } else {
        res.status(400).json({ error: 'Invalid signature' });
    }
}
