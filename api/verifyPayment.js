const crypto = require('crypto');
const admin = require('firebase-admin');

// 1. USE A GLOBAL VARIABLE TO TRACK INIT (This never fails)
if (!global.adminInitialized) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
        });
        global.adminInitialized = true;
        console.log("Firebase Admin Initialized successfully");
    } catch (e) {
        console.error("Firebase Init Failed:", e);
    }
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, userId, planTier, amountPaid } = req.body;

    const secret = process.env.RAZORPAY_KEY_SECRET;
    
    // Safety check for secrets
    if (!secret) {
        console.error("CRITICAL: RAZORPAY_KEY_SECRET is missing!");
        return res.status(500).json({ error: "Backend secret missing" });
    }

    // Verify Signature
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

            await db.collection('student_details').doc(userId).collection('payment_history').add({
                planTier: planTier,
                amountPaid: amountPaid,
                paymentId: razorpay_payment_id,
                paymentDate: admin.firestore.FieldValue.serverTimestamp()
            });

            res.status(200).json({ success: true });
        } catch (dbError) {
            console.error("DB Error:", dbError);
            res.status(500).json({ error: 'Database update failed' });
        }
    } else {
        res.status(400).json({ error: 'Invalid signature' });
    }
}
