let admin = require('firebase-admin');

// 1. Handle Vercel's packaging quirk
if (admin.default) {
  admin = admin.default;
}

// 2. Bulletproof Serverless Initialization (No .length checks!)
try {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
} catch (error) {
  // Serverless functions run this file multiple times. 
  // If Firebase is already initialized, it throws an error. We safely ignore it!
  if (!/already exists/i.test(error.message)) {
    console.error('Firebase initialization error', error);
  }
}

module.exports = async function handler(req, res) {
  // --- BULLETPROOF CORS ---
  const allowedOrigins = ['https://netpyq-552ad.web.app', 'http://127.0.0.1:5500'];
  const origin = req.headers.origin || '*';
  
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://netpyq-552ad.web.app'); 
  }
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle CORS Preflight instantly
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const db = admin.firestore();
    const auth = admin.auth();

    const { paperId, idToken } = req.body;
    if (!paperId || !idToken) {
      return res.status(400).json({ error: 'Missing paperId or idToken' });
    }

    // Verify Student Token
    const decoded = await auth.verifyIdToken(idToken); 
    const uid = decoded.uid;

    // Check if Free Paper
    const metaDoc = await db.collection('paper_metadata').doc(paperId).get();
    const isFree = metaDoc.exists && metaDoc.data().isFree === true;

    // Verify Premium Status
    let isPaid = false;
    if (!isFree) {
      const userDoc = await db.collection('student_details').doc(uid).get();
      isPaid = userDoc.exists && userDoc.data().isPaid === true;
    }

    if (!isFree && !isPaid) {
      return res.status(403).json({ error: 'Not authorized to access this premium paper' });
    }

    // Fetch Secret Key
    const keyDoc = await db.collection('paper_keys').doc(paperId).get();
    if (!keyDoc.exists) {
      return res.status(404).json({ error: 'Encryption key not found on server' });
    }

    return res.status(200).json({ key: keyDoc.data().key });

  } catch (err) {
    console.error("Server Error:", err);
    return res.status(500).json({ error: err.message });
  }
};
