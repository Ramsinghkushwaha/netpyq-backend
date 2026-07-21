const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase Admin if it isn't already running
if (!getApps().length) {
  initializeApp({ 
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) 
  });
}

const auth = getAuth();
const db = getFirestore();

export default async function handler(req, res) {
  // CORS Setup: ONLY allow requests from your specific domain
  res.setHeader('Access-Control-Allow-Origin', 'https://netpyq-552ad.web.app'); 
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { paperId, idToken } = req.body;
  if (!paperId || !idToken) return res.status(400).json({ error: 'Missing paperId or idToken' });

  try {
    // 1. Verify the student is genuinely logged into Firebase
    const decoded = await auth.verifyIdToken(idToken); 
    const uid = decoded.uid;

    // 2. Check if the paper is a Free Paper
    const metaDoc = await db.collection('paper_metadata').doc(paperId).get();
    const isFree = metaDoc.exists && metaDoc.data().isFree === true;

    // 3. If it's a Premium paper, verify the user actually paid
    let isPaid = false;
    if (!isFree) {
      const userDoc = await db.collection('student_details').doc(uid).get();
      isPaid = userDoc.exists && userDoc.data().isPaid === true;
    }

    // 4. Gatekeeper: Kick them out if they haven't paid for a premium test
    if (!isFree && !isPaid) {
      return res.status(403).json({ error: 'Not authorized to access this premium paper' });
    }

    // 5. Success! Fetch the secret key and hand it to the student's browser
    const keyDoc = await db.collection('paper_keys').doc(paperId).get();
    if (!keyDoc.exists) return res.status(404).json({ error: 'Encryption key not found on server' });

    return res.status(200).json({ key: keyDoc.data().key });

  } catch (err) {
    console.error("Key Fetch Error:", err);
    return res.status(401).json({ error: 'Invalid authentication or token expired' });
  }
}
