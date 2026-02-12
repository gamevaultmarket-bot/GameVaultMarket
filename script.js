/* ===============================
   GAMEVAULT MARKET — CORE ENGINE
   PART 1 — AUTH + CORE
=============================== */

/* ===== FIREBASE CONFIG ===== */
const firebaseConfig = {
  apiKey: "AIzaSyBfGXL6lKmBTZ9FIxsmsP_-40_-MZ33zBw",
  authDomain: "gamevault-market.firebaseapp.com",
  projectId: "gamevault-market",
  storageBucket: "gamevault-market.appspot.com",
  messagingSenderId: "000000000",
  appId: "1:000000000:web:000000"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

/* ===== SUPABASE CONFIG ===== */
const SUPABASE_URL = "https://pmgmbpwscyrsyrgyqsyy.supabase.co";
const SUPABASE_KEY = "YOUR_SUPABASE_ANON_KEY_HERE"; // replace

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ===== UI ELEMENTS ===== */
const nav = document.getElementById("nav");
const sellBtn = document.getElementById("sellBtn");
const adminBtn = document.getElementById("adminBtn");
const paymentDetails = document.getElementById("paymentDetails");

/* ===== SHOW PAGE ===== */
function show(id){
  document.querySelectorAll("section").forEach(s=>s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

/* ===== SIGNUP ===== */
async function signup(){
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const role = document.getElementById("role").value;

  if(!email || !password) return alert("Enter email & password");

  const cred = await auth.createUserWithEmailAndPassword(email,password);

  await db.collection("users").doc(cred.user.uid).set({
    email,
    role,
    verified:false,
    payout:false,
    banned:false,
    createdAt:Date.now()
  });

  alert("Account created");
}

/* ===== LOGIN ===== */
async function login(){
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  await auth.signInWithEmailAndPassword(email,password);
}

/* ===== LOGOUT ===== */
function logout(){
  auth.signOut();
}

/* ===== AUTH STATE ===== */
auth.onAuthStateChanged(async user=>{
  if(!user){
    nav.classList.add("hidden");
    show("auth");
    return;
  }

  nav.classList.remove("hidden");
  document.getElementById("auth").classList.add("hidden");

  const snap = await db.collection("users").doc(user.uid).get();
  if(!snap.exists) return;

  const data = snap.data();

  /* RESET BUTTONS */
  sellBtn.classList.add("hidden");
  adminBtn.classList.add("hidden");

  /* ADMIN */
  if(data.role === "admin"){
    adminBtn.classList.remove("hidden");
    show("admin");
    loadAdmin();
    return;
  }

  /* SELLER NOT VERIFIED */
  if(data.role === "seller" && !data.verified){
    nav.classList.add("hidden");
    show("verification");

    paymentDetails.innerHTML = `
      Skrill: gamevaultmarket@gmail.com<br>
      USDT ERC20: 0x992d0E36A7409F0c9228B51C6bB8F875b1A4Af3B<br>
      Grey: 212286724510
    `;
    return;
  }

  /* SELLER VERIFIED BUT NO PAYOUT */
  if(data.role === "seller" && data.verified && !data.payout){
    show("payout");
    return;
  }

  /* VERIFIED SELLER */
  if(data.role === "seller" && data.verified){
    sellBtn.classList.remove("hidden");
  }

  show("home");
  loadListings();
});

/* ===============================
   PLACEHOLDERS (NEXT PARTS)
=============================== */

function loadListings(){}
function createListing(){}
function submitVerification(){}
function savePayout(){}
function loadAdmin(){}
function openOrders(){}
function sendMessage(){}