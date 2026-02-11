// ================= FIREBASE =================
const firebaseConfig = {
  apiKey: "AIzaSyBfGXL6lKmBTZ9FIxsmsP_-40_-MZ33zBw",
  authDomain: "gamevaultmarket-5e494.firebaseapp.com",
  projectId: "gamevaultmarket-5e494",
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ================= SUPABASE =================
const SUPABASE_URL = "https://pmgmbpwscyrsyrgyqsyy.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtZ21icHdzY3lyc3lyZ3lxc3l5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MjAxMTQsImV4cCI6MjA4NTk5NjExNH0.PKF5Rc9LRZLKO7FuALPdSF4kiourN5NgZP6IUgk1BJ0";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ================= UI =================
const nav = document.getElementById("nav");
const sellBtn = document.getElementById("sellBtn");
const adminBtn = document.getElementById("adminBtn");

function show(id) {
  document.querySelectorAll("section").forEach(s => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}
const PAYMENTS = {
  usdt: "USDT ERC20: 0x992d0E36A7409F0c9228B51C6bB8F875b1A4Af3B",
  skrill: "Skrill: gamevaultmarket@gmail.com",
  grey: "Grey: 212286724510"
};

let paymentEnd = 0;

function startTimer(minutes = 40) {
  paymentEnd = Date.now() + minutes * 60000;
  updateTimer();
}

function updateTimer() {
  const el = document.getElementById("timer");
  const interval = setInterval(() => {
    const left = paymentEnd - Date.now();
    if (left <= 0) {
      clearInterval(interval);
      el.innerText = "Payment expired";
      return;
    }
    const m = Math.floor(left / 60000);
    const s = Math.floor((left % 60000) / 1000);
    el.innerText = `Time left: ${m}:${s}`;
  }, 1000);
}

function openPayment(type) {
  show("payment");

  document.getElementById("paymentInfo").innerHTML = `
    ${PAYMENTS.usdt}<br>
    ${PAYMENTS.skrill}<br>
    ${PAYMENTS.grey}
  `;

  startTimer();
  window.paymentType = type;
}

async function confirmPayment() {
  const user = auth.currentUser;
  if (!user) return;

  if (window.paymentType === "verification") {
    await db.collection("users").doc(user.uid).update({
      paidVerification: true
    });
    alert("Verification payment recorded");
    show("verification");
  }

  if (window.paymentType === "service") {
    alert("Service fee recorded");
  }
}
const BLOCK_WORDS = [
  "whatsapp","telegram","@","gmail",".com","+233",
  "0x","bank","account","paypal","skrill","crypto"
];

function cleanMessage(msg) {
  const lower = msg.toLowerCase();
  for (let w of BLOCK_WORDS) {
    if (lower.includes(w)) return "[Blocked: Contact/Payment info not allowed]";
  }
  return msg;
}

async function sendMessage() {
  const user = auth.currentUser;
  const text = document.getElementById("msgInput").value;

  if (!text) return;

  const safe = cleanMessage(text);

  await db.collection("messages").add({
    user: user.uid,
    text: safe,
    time: Date.now()
  });

  document.getElementById("msgInput").value = "";
}
// ================= AUTH =================
async function signup() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const role = document.getElementById("role").value;

  const res = await auth.createUserWithEmailAndPassword(email, password);
  await db.collection("users").doc(res.user.uid).set({
    email,
    role,
    verified: false,
    banned: false,
    created: Date.now()
  });

  alert("Signup successful");
}

async function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  await auth.signInWithEmailAndPassword(email, password);
}

function logout() {
  auth.signOut();
}

// ================= AUTH STATE =================
auth.onAuthStateChanged(async user => {
  if (!user) {
    nav.classList.add("hidden");
    show("auth");
    return;
  }

  nav.classList.remove("hidden");

  const doc = await db.collection("users").doc(user.uid).get();
  const data = doc.data();
await checkBan(user);
  sellBtn.classList.add("hidden");
  adminBtn.classList.add("hidden");

  if (data.role === "admin") {
    adminBtn.classList.remove("hidden");
    show("admin");
    loadAdmin();
    return;
  }

  if (data.role === "seller" && !data.verified) {
    show("verification");
    return;
  }

  if (data.role === "seller" && data.verified) {
    sellBtn.classList.remove("hidden");
  }

  show("home");
});

// ================= VERIFICATION =================
async function submitVerification() {
  const user = auth.currentUser;
  if (!user) return;

  const idFile = document.getElementById("idFile").files[0];
  const selfieFile = document.getElementById("selfieFile").files[0];

  if (!idFile || !selfieFile) {
    alert("Upload both images");
    return;
  }

  const idPath = `Verification/${user.uid}_id.png`;
  const selfiePath = `Verification/${user.uid}_selfie.png`;

  await supabaseClient.storage.from("Verification").upload(idPath, idFile, { upsert: true });
  await supabaseClient.storage.from("Verification").upload(selfiePath, selfieFile, { upsert: true });

  await db.collection("users").doc(user.uid).update({
    verificationPending: true
  });

  alert("Verification submitted. Wait for admin approval.");
}

// ================= LISTING =================
async function createListing() {
  const user = auth.currentUser;
  if (!user) return;

  const game = document.getElementById("game").value;
  const details = document.getElementById("details").value;
  const price = document.getElementById("price").value;

  await db.collection("listings").add({
    seller: user.uid,
    game,
    details,
    price,
    created: Date.now()
  });

  alert("Listing created");
}

// ================= ADMIN =================
async function loadAdmin() {
  const container = document.getElementById("adminUsers");
  container.innerHTML = "Loading...";

  const snap = await db.collection("users")
    .where("verificationPending", "==", true)
    .get();

  container.innerHTML = "";

  snap.forEach(doc => {
    const u = doc.data();

    const div = document.createElement("div");
    div.innerHTML = `
      ${u.email}
      <button onclick="approve('${doc.id}')">Approve</button>
    `;

    container.appendChild(div);
  });
}

async function approve(uid) {
  await db.collection("users").doc(uid).update({
    verified: true,
    verificationPending: false
  });

  alert("Seller approved");
  loadAdmin();
}

async function banUser(uid, reason="Fraud") {
  await db.collection("users").doc(uid).update({
    banned: true,
    bannedReason: reason
  });
}

async function checkBan(user) {
  const doc = await db.collection("users").doc(user.uid).get();
  const data = doc.data();

  if (data.banned) {
    alert("Account banned: " + data.bannedReason);
    await auth.signOut();
  }
}

async function createOrder(listingId, sellerId) {
  const user = auth.currentUser;

  const order = await db.collection("orders").add({
    buyer: user.uid,
    seller: sellerId,
    listing: listingId,
    status: "pending",
    expires: Date.now() + 40*60000
  });

  openPayment("service");
}