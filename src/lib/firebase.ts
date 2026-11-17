import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithPopup,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const firestoreDatabaseId = (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId;

export const db = firestoreDatabaseId
  ? getFirestore(app, firestoreDatabaseId)
  : getFirestore(app);
export const auth = getAuth(app);

export const SCOPES = ['https://www.googleapis.com/auth/gmail.send'] as const;

export const googleProvider = new GoogleAuthProvider();
SCOPES.forEach((scope) => googleProvider.addScope(scope));

// In-memory cache only (never stored in localStorage/sessionStorage)
let cachedGmailAccessToken: string | null = null;

onAuthStateChanged(auth, (user) => {
  if (!user) {
    cachedGmailAccessToken = null;
  }
});

export async function signInWithGoogleWorkspace() {
  const result = await signInWithPopup(auth, googleProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (credential?.accessToken) {
    cachedGmailAccessToken = credential.accessToken;
  }
  return result;
}

export function getCachedGmailAccessToken(): string | null {
  return cachedGmailAccessToken;
}

export function clearCachedGmailAccessToken(): void {
  cachedGmailAccessToken = null;
}

export async function ensureGmailAccessToken(): Promise<string> {
  if (cachedGmailAccessToken) {
    return cachedGmailAccessToken;
  }

  const gmailProvider = new GoogleAuthProvider();
  SCOPES.forEach((scope) => gmailProvider.addScope(scope));
  gmailProvider.setCustomParameters({
    prompt: 'consent',
    ...(auth.currentUser?.email ? { login_hint: auth.currentUser.email } : {}),
  });

  try {
    // Use reauthenticateWithPopup when already signed in so Gmail authorization
    // never switches auth.currentUser or alters the responder's database session.
    const result = auth.currentUser
      ? await reauthenticateWithPopup(auth.currentUser, gmailProvider)
      : await signInWithPopup(auth, gmailProvider);

    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Unable to obtain Gmail send permission from Google sign-in.');
    }
    cachedGmailAccessToken = credential.accessToken;
    return cachedGmailAccessToken;
  } catch (err) {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: string }).code)
        : '';
    if (code === 'auth/user-mismatch') {
      throw new Error(
        `Select your signed-in Google account (${auth.currentUser?.email || 'current account'}) to authorize sending. Your active session and patient records were not changed.`
      );
    }
    throw err;
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration. Firestore client is offline.');
    }
  }
}

void testConnection();
