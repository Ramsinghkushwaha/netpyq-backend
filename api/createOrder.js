const Razorpay = require('razorpay');

export default async function handler(req, res) {
    // 1. CORS Setup (Crucial so your Firebase frontend is allowed to talk to your Vercel backend)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle pre-flight browser requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // 2. Initialize Razorpay using secure Environment Variables
    const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    // 3. Create the order
    try {
        const options = {
            amount: 4900, // Amount is strictly in paise (4900 = ₹49.00)
            currency: "INR",
            receipt: `rcpt_${Date.now()}` // Generates a unique receipt ID
        };
        
        const order = await razorpay.orders.create(options);
        
        // Send the secure order data back to your frontend!
        res.status(200).json(order);
        
    } catch (error) {
        console.error("Razorpay Error:", error);
        res.status(500).json({ error: "Failed to create order" });
    }
}
