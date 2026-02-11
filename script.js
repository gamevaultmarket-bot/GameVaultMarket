// ================= FIREBASE =================
const firebaseConfig = {
  apiKey: "AIzaSyBfGXL6lKmBTZ9FIxsmsP_-40_-MZ33zBw",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ================= SUPABASE =================
const SUPABASE_URL = "https://pmgmbpwscyrsyrgyqsyy.supabase.co";
const SUPABASE_KEY = "YOUR_PUBLIC_ANON_KEY";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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