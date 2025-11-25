import * as admin from 'firebase-admin';
import * as serviceAccount from '../../serviceAccountKey.json';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL || serviceAccount.client_email,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || serviceAccount.private_key).replace(/\\n/g, '\n'),
    }),
    databaseURL: `https://${process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id}.firebaseio.com`
  });
}

export const db = admin.firestore();
export const auth = admin.auth();
export const adminSdk = admin;