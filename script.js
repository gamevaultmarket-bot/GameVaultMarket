/* ================= CONFIG ================= /

const firebaseConfig = {
  apiKey: "AIzaSyBfGXL6lKmBTZ9FIxsmsP_-40_-MZ33zBw",
  authDomain: "gamevaultmarket-5e494.firebaseapp.com",
  projectId: "gamevaultmarket-5e494"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

/ ================= SUPABASE ================= /

const SUPABASE_URL = "https://pmgmbpwscyrsyrgyqsyy.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtZ21icHdzY3lyc3lyZ3lxc3l5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MjAxMTQsImV4cCI6MjA4NTk5NjExNH0.PKF5Rc9LRZLKO7FuALPdSF4kiourN5NgZP6IUgk1BJ0";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/ ================= UI ================= /

const nav = document.getElementById("nav");
const adminBtn = document.getElementById("adminBtn");

function show(id) {
  document.querySelectorAll("section").forEach(s => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

/ ================= AUTH ================= /

async function signup() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const role = document.getElementById("role").value;

  if (!email || !password) return alert("Enter email and password");

  try {
    const userCred = await auth.createUserWithEmailAndPassword(email, password);

    await db.collection("users").doc(userCred.user.uid).set({
      email,
      role,
      verified: false,
      created: new Date()
    });

    alert("Account created ✔");
  } catch (e) {
    alert(e.message);
  }
}

function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!email || !password) return alert("Enter email and password");

  auth.signInWithEmailAndPassword(email, password)
    .catch(e => alert(e.message));
}

function logout() {
  auth.signOut();
}

/ ================= AUTH STATE ================= */

auth.onAuthStateChanged(async user => {

  if (!user) {
    nav.classList.add("hidden");
    show("auth");
    return;
  }

  nav.classList.remove("hidden");

  const doc = await db.collection("users").doc(user.uid).get();

  if (!doc.exists) {
    alert("User doc missing");
    return;
  }

  const data = doc.data();
  const role = (data.role || "").toLowerCase();

  adminBtn.classList.add("hidden");

  if (role === "admin") {
    adminBtn.classList.remove("hidden");
    show("admin");
    return;
  }

  show("home");
});