// ================= FIREBASE =================
const firebaseConfig = {
  apiKey: "AIzaSyBfGXL6lKmBTZ9FIxsmsP_-40_-MZ33zBw",
  authDomain: "YOUR_DOMAIN",
  projectId: "YOUR_PROJECT_ID"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ================= SUPABASE =================
const supabase = window.supabase.createClient(
  "https://pmgmbpwscyrsyrgyqsyy.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtZ21icHdzY3lyc3lyZ3lxc3l5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MjAxMTQsImV4cCI6MjA4NTk5NjExNH0.PKF5Rc9LRZLKO7FuALPdSF4kiourN5NgZP6IUgk1BJ0";
);

// ================= UI =================
const nav = document.getElementById("nav");
const sellBtn = document.getElementById("sellBtn");
const adminBtn = document.getElementById("adminBtn");

function show(id) {
  document.querySelectorAll("section").forEach(s => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

// ================= AUTH =================
async function signup() {
  const email = emailEl.value.trim();
  const pass = passwordEl.value.trim();
  const role = roleEl.value;

  if (!email || !pass) return alert("Enter email/password");

  const cred = await auth.createUserWithEmailAndPassword(email, pass);

  await db.collection("users").doc(cred.user.uid).set({
    email,
    role,
    verified: false,
    banned: false
  });

  alert("Signup success");
}

async function login() {
  const email = emailEl.value.trim();
  const pass = passwordEl.value.trim();

  if (!email || !pass) return alert("Enter email/password");

  await auth.signInWithEmailAndPassword(email, pass);
}

// ================= AUTH STATE =================
auth.onAuthStateChanged(async user => {
  if (!user) {
    nav.classList.add("hidden");
    show("auth");
    return;
  }

  nav.classList.remove("hidden");

  const snap = await db.collection("users").doc(user.uid).get();
  const data = snap.data();

  sellBtn.classList.add("hidden");
  adminBtn.classList.add("hidden");

  // ADMIN
  if (data.role === "admin") {
    adminBtn.classList.remove("hidden");
    show("admin");
    loadAdmin();
    return;
  }

  // SELLER NOT VERIFIED
  if (data.role === "seller" && !data.verified) {
    show("verification");
    nav.classList.add("hidden");
    return;
  }

  // VERIFIED SELLER BUT NO PAYOUT
  if (data.role === "seller" && data.verified && !data.payout) {
    show("payout");
    return;
  }

  if (data.role === "seller" && data.verified) {
    sellBtn.classList.remove("hidden");
  }

  show("risk");
});

// ================= RISK =================
function acceptRisk() {
  if (!agreeRisk.checked) return alert("Accept risk");
  show("home");
}

// ================= VERIFICATION =================
async function submitVerification() {
  const user = auth.currentUser;

  const idFile = idFileEl.files[0];
  const selfieFile = selfieFileEl.files[0];
  const paymentFile = paymentFileEl.files[0];

  if (!idFile || !selfieFile || !paymentFile)
    return alert("Upload all files");

  await supabase.storage.from("Verification").upload(`${user.uid}_id`, idFile);
  await supabase.storage.from("Verification").upload(`${user.uid}_selfie`, selfieFile);
  await supabase.storage.from("Verification").upload(`${user.uid}_payment`, paymentFile);

  await db.collection("verifications").doc(user.uid).set({
    uid: user.uid,
    status: "pending",
    time: Date.now()
  });

  alert("Verification submitted");
}

// ================= PAYOUT =================
async function savePayout() {
  const user = auth.currentUser;

  await db.collection("users").doc(user.uid).update({
    payout: {
      method: payoutMethod.value,
      address: payoutAddress.value
    }
  });

  alert("Payout saved");
  show("home");
}

// ================= LISTING =================
async function createListing() {
  const user = auth.currentUser;

  const file = listingFile.files[0];
  if (!file) return alert("Upload screenshot");

  const path = `${user.uid}_${Date.now()}`;
  await supabase.storage.from("Listings").upload(path, file);

  await db.collection("listings").add({
    uid: user.uid,
    game: game.value,
    details: details.value,
    price: price.value,
    image: path,
    time: Date.now()
  });

  alert("Listing created");
}

// ================= ADMIN =================
async function loadAdmin() {
  const usersSnap = await db.collection("verifications").get();
  adminUsers.innerHTML = "";

  usersSnap.forEach(doc => {
    const d = doc.data();
    adminUsers.innerHTML += `
      <div>
        ${d.uid} — ${d.status}
        <button onclick="approve('${d.uid}')">Approve</button>
      </div>
    `;
  });
}

async function approve(uid) {
  await db.collection("users").doc(uid).update({ verified: true });
  await db.collection("verifications").doc(uid).update({ status: "approved" });
  alert("Seller verified");
}

// ================= LOGOUT =================
function logout() {
  auth.signOut();
}