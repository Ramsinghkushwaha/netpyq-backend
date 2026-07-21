const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
// Notice: We are NOT requiring 'firebase-admin/auth' at the top!

module.exports = async function handler(req, res) {
  // 1. BULLETPROOF CORS
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
    // 2. Initialize Firebase safely
    if (!getApps().length) {
      initializeApp({
        credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
      });
    }

    // Use the correct v12 syntax for Firestore
    const db = getFirestore();
    
    // 3. THE MAGIC TRICK: Dynamic Import for Auth
    // This completely bypasses the Vercel 'jose' ESM crash!
    const { getAuth } = await import('firebase-admin/auth');
    const auth = getAuth();

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
