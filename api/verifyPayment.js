const crypto = require('crypto');
const Razorpay = require('razorpay'); // Added Razorpay to fetch true order details
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

    // ONLY extract the Razorpay verification IDs. Ignore spoofable user data!
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

    // 3. Verify Secrets Exist
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
        console.error("CRITICAL: RAZORPAY_KEY_SECRET is missing in Vercel.");
        return res.status(500).json({ error: "Server Configuration Error" });
    }

    const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: secret,
    });

    // 4. Verify Signature Mathematically
    try {
        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(razorpay_order_id + "|" + razorpay_payment_id)
            .digest('hex');

        // FIX: Prevent Timing Attacks
        let isAuthentic = false;
        try {
            const expectedBuffer = Buffer.from(expectedSignature);
            const signatureBuffer = Buffer.from(razorpay_signature);
            if (expectedBuffer.length === signatureBuffer.length) {
                isAuthentic = crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
            }
        } catch (e) {
            isAuthentic = false;
        }

        if (isAuthentic) {
            // 5. THE MASTER FIX: Fetch the absolute truth directly from Razorpay
            const order = await razorpay.orders.fetch(razorpay_order_id);
            
            // Extract the secure data we stamped on the order during creation
            const secureUserId = order.notes.userId;
            const securePlanTier = order.notes.planTier;
            const secureAmountPaid = Number(order.notes.amountPaid);

            if (!secureUserId) {
                return res.status(400).json({ success: false, error: 'Invalid order notes.' });
            }

            // 6. Securely update Firestore
            const userRef = db.collection('student_details').doc(secureUserId);
            
            await userRef.set({
                isPaid: true,
                planTier: securePlanTier,
                paymentId: razorpay_payment_id,
                paymentDate: FieldValue.serverTimestamp()
            }, { merge: true });

            // FIX: Use .doc().set() to prevent duplicate receipts from retries
            await userRef.collection('payment_history').doc(razorpay_payment_id).set({
                planTier: securePlanTier,
                amountPaid: secureAmountPaid,
                paymentId: razorpay_payment_id,
                orderId: razorpay_order_id,
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
