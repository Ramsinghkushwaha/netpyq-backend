// File: api/verifyPayment.js
const crypto = require('crypto');
const admin = require('firebase-admin');

// 1. CORS Setup
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // 2. Initialize Firebase Admin securely
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
        });
    }
    const db = admin.firestore();

    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, userId, planTier, amountPaid } = req.body;

    // 3. Verify the Signature mathematically
    const secret = process.env.RAZORPAY_KEY_SECRET;
    const generated_signature = crypto
        .createHmac('sha256', secret)
        .update(razorpay_order_id + "|" + razorpay_payment_id)
        .digest('hex');

    if (generated_signature === razorpay_signature) {
        // 4. SIGNATURE IS VALID! Securely update Firestore
        try {
            const userRef = db.collection('student_details').doc(userId);
            
            await userRef.set({
                isPaid: true,
                planTier: planTier,
                paymentId: razorpay_payment_id,
                paymentDate: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            await userRef.collection('payment_history').add({
                planTier: planTier,
                amountPaid: amountPaid,
                paymentId: razorpay_payment_id,
                paymentDate: admin.firestore.FieldValue.serverTimestamp()
            });

            res.status(200).json({ success: true });
        } catch (dbError) {
            console.error("Database update failed:", dbError);
            res.status(500).json({ success: false, error: 'Database update failed' });
        }
    } else {
        res.status(400).json({ success: false, error: 'Invalid signature. Payment rejected.' });
    }
}
