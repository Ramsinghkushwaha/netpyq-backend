const Razorpay = require('razorpay');

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    try {
        // Read the plan price from the frontend request
        const { planPrice } = req.body; 

        // Set the final amount (in paise). Default to ₹49 if something goes wrong.
        let finalAmount = 50; 
        if (planPrice === 99) {
            finalAmount = 9900; 
        } else if (planPrice === 1) {
            finalAmount = 100; // For your ₹1 live test!
        }

        const options = {
            amount: finalAmount, 
            currency: "INR",
            receipt: `rcpt_${Date.now()}`
        };
        
        const order = await razorpay.orders.create(options);
        res.status(200).json(order);
        
    } catch (error) {
        console.error("Razorpay Error:", error);
        res.status(500).json({ error: "Failed to create order" });
    }
}
