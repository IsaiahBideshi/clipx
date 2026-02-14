import { initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyC00_A8bXZ_QXsYwpfcoJb6ApHLAecdYMQ",
  authDomain: "clipx-c718f.firebaseapp.com",
  projectId: "clipx-c718f",
  storageBucket: "clipx-c718f.firebasestorage.app",
  messagingSenderId: "660708517451",
  appId: "1:660708517451:web:bc2f0babf2282d0ed38fce",
  measurementId: "G-67KY4Q79YX",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

async function signupWithEmail(email, password, displayName = "") {
  const credential = await createUserWithEmailAndPassword(auth, email, password);

  if (displayName.trim()) {
    await updateProfile(credential.user, { displayName: displayName.trim() });
  }

  return credential.user;
}

async function loginWithEmail(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}


async function logout() {
  await auth.signOut();
}

export { app, auth, signupWithEmail, loginWithEmail, logout };
