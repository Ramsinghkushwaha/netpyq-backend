const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

module.exports = async function handler(req, res) {
  // 1. CORS Configuration
  const allowedOrigins = [
    'https://netpyq.web.app',      
    'https://netpyq-552ad.web.app', 
    'http://127.0.0.1:5500'
  ];
  const origin = req.headers.origin || '*';

function isAllowedOrigin(o) {
  if (!o) return false;
  if (allowedOrigins.includes(o)) return true;
  try {
    return new URL(o).hostname.endsWith('.webcontainer.io'); // StackBlitz preview, any session
  } catch {
    return false;
  }
}

if (isAllowedOrigin(origin)) {
  res.setHeader('Access-Control-Allow-Origin', origin);
} else {
  res.setHeader('Access-Control-Allow-Origin', 'https://netpyq.web.app');
}
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!getApps().length) {
      initializeApp({ 
        credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) 
      });
    }

    const auth = getAuth();
    const db = getFirestore();

    const { idToken, daysOld } = req.body;
    if (!idToken) return res.status(400).json({ error: 'Missing idToken' });

    // 2. Security: Verify it is the Admin requesting this
    const decoded = await auth.verifyIdToken(idToken);
    if (decoded.email !== "ramsinghkushwaha71@gmail.com") {
      return res.status(403).json({ error: 'Unauthorized: Admin access required.' });
    }

    let deletedCount = 0;
    let nextPageToken;

    // 3. Scan all users in Firebase Auth
    do {
      const listUsersResult = await auth.listUsers(1000, nextPageToken);
      
      for (const user of listUsersResult.users) {
        // A user with no providerData is an Anonymous Guest
        if (user.providerData.length === 0) {
          
          const lastSignInTime = new Date(user.metadata.lastSignInTime).getTime();
          const ageInDays = (Date.now() - lastSignInTime) / (1000 * 60 * 60 * 24);

          // If they are older than the requested threshold, delete them!
          if (ageInDays >= daysOld) {
            
            // A. Delete all their mock test scores
            const scoresSnap = await db.collection("student_scores").where("userId", "==", user.uid).get();
            if (!scoresSnap.empty) {
                const batch = db.batch();
                scoresSnap.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
            }

            // B. Delete their Profile and ALL Sub-collections (recursive — covers active_exam,
            // bookmarks, study_tracker, syllabus, notifications, and anything added later)
            await db.recursiveDelete(db.collection("student_details").doc(user.uid));

            // C. Delete the Auth Account itself
            await auth.deleteUser(user.uid);
            deletedCount++;
          }
        }
      }
      nextPageToken = listUsersResult.pageToken;
    } while (nextPageToken);

    return res.status(200).json({ message: `Successfully swept and deleted ${deletedCount} dormant ghost accounts!` });

  } catch (err) {
    console.error("Cleanup Error:", err);
    return res.status(500).json({ error: err.message });
  }
};
