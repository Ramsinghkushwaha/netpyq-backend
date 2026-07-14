const crypto = require('crypto');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// 1. MODERN FIREBASE INITIALIZATION (v14+)
try {
    if (!getApps().length) {
        initializeApp({
            credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
        });
        console.log("Firebase initialized successfully.");
    }
} catch (error) {
    console.error("Firebase init error:", error);
}

const db = getFirestore();

export default async function handler(req, res) {
    // 2. CORS Setup
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, userId, planTier, amountPaid } = req.body;

    // 3. Verify Secrets Exist
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
        console.error("CRITICAL: RAZORPAY_KEY_SECRET is missing in Vercel.");
        return res.status(500).json({ error: "Server Configuration Error" });
    }

    // 4. Verify Signature Mathematically
    try {
        const generated_signature = crypto
            .createHmac('sha256', secret)
            .update(razorpay_order_id + "|" + razorpay_payment_id)
            .digest('hex');

        if (generated_signature === razorpay_signature) {
            // 5. SIGNATURE IS VALID! Securely update Firestore
            const userRef = db.collection('student_details').doc(userId);
            
            await userRef.set({
                isPaid: true,
                planTier: planTier,
                paymentId: razorpay_payment_id,
                paymentDate: FieldValue.serverTimestamp()
            }, { merge: true });

            await userRef.collection('payment_history').add({
                planTier: planTier,
                amountPaid: amountPaid,
                paymentId: razorpay_payment_id,
                paymentDate: FieldValue.serverTimestamp()
            });

            return res.status(200).json({ success: true });
        } else {
            return res.status(400).json({ success: false, error: 'Invalid signature. Payment rejected.' });
        }
    } catch (err) {
        console.error("Backend Execution Error:", err);
        return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
}
