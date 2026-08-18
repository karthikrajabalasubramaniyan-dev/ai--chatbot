import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCnkP5LUC3mRDAavMckNCGcaZRMQCvKuV0",
  authDomain: "karthik-ai-ebf94.firebaseapp.com",
  projectId: "karthik-ai-ebf94",
  storageBucket: "karthik-ai-ebf94.firebasestorage.app",
  messagingSenderId: "544474686026",
  appId: "1:544474686026:web:3d0ea3613cf352954bfcb3"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);