// server/firebase-admin.js
const admin = require('firebase-admin');
const serviceAccount = require('./vibewriter-bb628-firebase-adminsdk-fbsvc-e9e329e56d.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function verifyFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { verifyFirebaseToken };