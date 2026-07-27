const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

module.exports = async function handler(req, res) {
  // 1. BULLETPROOF CORS
  const allowedOrigins = [
    'https://netpyq.web.app',      
    'https://netpyq-552ad.web.app', 
    'http://127.0.0.1:5500'
  ];
  const origin = req.headers.origin || '*';
  
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://netpyq.web.app'); 
  }
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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

    const auth = getAuth();
    const db = getFirestore();

    // EXPECT subjectId FROM THE FRONTEND
    const { subjectId, paperId, idToken } = req.body;
    if (!subjectId || !paperId || !idToken) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Verify Student Token
    const decoded = await auth.verifyIdToken(idToken); 
    const uid = decoded.uid;

    // 3. SPEED OPTIMIZATION: Fetch Metadata, Key, and User Profile simultaneously
    const [metaDoc, keyDoc, userDoc] = await Promise.all([
        db.collection('paper_metadata').doc(subjectId).get(),
        db.collection('paper_keys').doc(paperId).get(),
        db.collection('student_details').doc(uid).get()
    ]);

    if (!keyDoc.exists) {
      return res.status(404).json({ error: 'Encryption key not found on server' });
    }

    // 4. Check if the paper is Free in the NEW nested structure
    const subjectMeta = metaDoc.exists ? metaDoc.data() : {};
    const paperMeta = subjectMeta[paperId] || {};
    const isFree = paperMeta.isFree === true;

    // 5. ENTITLEMENT & EXPIRATION CHECK
    if (!isFree) {
        if (!userDoc.exists) {
            return res.status(403).json({ error: 'Premium access required. Please upgrade your plan.' });
        }
        
        const userData = userDoc.data();
        
        if (userData.isPaid !== true || !userData.paymentDate) {
            return res.status(403).json({ error: 'Premium access required. Please upgrade your plan.' });
        }

        // Calculate Expiration
        const payDate = userData.paymentDate.toDate();
        const monthsToAdd = userData.planTier === "Gold" ? 24 : 6;
        const expDate = new Date(payDate);
        expDate.setMonth(expDate.getMonth() + monthsToAdd);

        if (new Date() > expDate) {
            return res.status(403).json({ error: 'Your premium plan has expired. Please renew to access this paper.' });
        }
    }

    // 6. SUCCESS! Hand over the decryption key
    return res.status(200).json({ key: keyDoc.data().key });

  } catch (err) {
    console.error("Server Error:", err);
    return res.status(500).json({ error: err.message });
  }
};
