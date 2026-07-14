const crypto = require('crypto');
const admin = require('firebase-admin');

export default async function handler(req, res) {
    // Standard CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // DEBUG: Log the body to see if it's arriving
    console.log("Request Body:", req.body);

    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
        });
    }
    const db = admin.firestore();

    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, userId, planTier, amountPaid } = req.body;

    // DEBUG: Check which variable is undefined
    if (!razorpay_order_id || !razorpay_payment_id || !process.env.RAZORPAY_KEY_SECRET) {
        console.error("Missing critical data:", { razorpay_order_id, razorpay_payment_id, secret_exists: !!process.env.RAZORPAY_KEY_SECRET });
        return res.status(400).json({ error: "Missing data from frontend or secrets" });
    }

    const secret = process.env.RAZORPAY_KEY_SECRET;
    const generated_signature = crypto
        .createHmac('sha256', secret)
        .update(razorpay_order_id + "|" + razorpay_payment_id)
        .digest('hex');

    if (generated_signature === razorpay_signature) {
        try {
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
