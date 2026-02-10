/* ================= FIREBASE ================= */

firebase.initializeApp({
  apiKey: "YOUR_FIREBASE_KEY",
  authDomain: "gamevaultmarket-5e494.firebaseapp.com",
  projectId: "gamevaultmarket-5e494"
});

const auth = firebase.auth();
const db = firebase.firestore();

/* ================= SUPABASE ================= */

const SUPABASE_URL = "https://pmgmbpwscyrsyrgyqsyy.supabase.co";
const SUPABASE_KEY = "YOUR_SUPABASE_PUBLIC_KEY";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ================= ELEMENTS ================= */

const nav = document.getElementById("nav");
const sellBtn = document.getElementById("sellBtn");
const adminBtn = document.getElementById("adminBtn");

const email = document.getElementById("email");
const password = document.getElementById("password");
const roleSelect = document.getElementById("role");

const listings = document.getElementById("listings");
const ordersList = document.getElementById("ordersList");
const adminUsers = document.getElementById("adminUsers");
const adminOrders = document.getElementById("adminOrders");

/* ================= AUTH ================= */

async function signup() {
  try {
    if (password.value.length < 6) {
      alert("Password must be at least 6 characters");
      return;
    }

    const res = await auth.createUserWithEmailAndPassword(
      email.value.trim(),
      password.value
    );

    await db.collection("users").doc(res.user.uid).set({
      email: email.value.trim(),
      role: roleSelect.value || "buyer",
      verified: false,
      created: new Date()
    });

    alert("Account created");

  } catch (e) {
    alert(e.message);
  }
}

function login() {
  if (!email.value || !password.value) {
    alert("Enter email and password");
    return;
  }

  auth.signInWithEmailAndPassword(email.value.trim(), password.value)
    .catch(e => alert(e.message));
}

function logout() {
  auth.signOut();
}

/* ================= AUTH STATE ================= */

auth.onAuthStateChanged(async user => {

  if (!user) {
    nav.classList.add("hidden");
    show("auth");
    return;
  }

  nav.classList.remove("hidden");
  document.getElementById("auth").classList.add("hidden");

  const snap = await db.collection("users").doc(user.uid).get();

  if (!snap.exists) return;

  const data = snap.data() || {};
  const role = (data.role || "").toLowerCase().trim();

  /* RESET BUTTONS */
  sellBtn.classList.add("hidden");
  adminBtn.classList.add("hidden");

  /* ADMIN */
  if (role === "admin") {
    adminBtn.classList.remove("hidden");
    show("admin");
    loadAdmin();
    return;
  }

  /* SELLER */
  if (data.role === "seller" && data.verified) {
    sellBtn.classList.remove("hidden");
  }

  show("risk");
});

/* ================= UI ================= */

function show(id) {
  document.querySelectorAll("section").forEach(s => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

/* ================= RISK ================= */

function acceptRisk() {
  if (!document.getElementById("agreeRisk").checked) {
    alert("Accept risk first");
    return;
  }
  show("home");
  loadListings();
}

/* ================= IMAGE UPLOAD (SUPABASE) ================= */

async function uploadImage(file, folder = "images") {
  if (!file) return null;

  const uid = auth.currentUser.uid;
  const path = `${folder}/${uid}_${Date.now()}.jpg`;

  const { error } = await supabaseClient.storage
    .from("images")
    .upload(path, file);

  if (error) {
    alert(error.message);
    return null;
  }

  const { data } = supabaseClient.storage
    .from("images")
    .getPublicUrl(path);

  return data.publicUrl;
}

/* ================= LISTINGS ================= */

function loadListings() {
  db.collection("listings")
    .where("status", "==", "active")
    .onSnapshot(snap => {
      listings.innerHTML = "";

      snap.forEach(doc => {
        const d = doc.data();

        listings.innerHTML += `
          <div class="card">
            <b>${d.game}</b> - $${d.price}<br>
            ${d.screenshot ? `<img src="${d.screenshot}" style="max-width:100%">` : ""}
            <br>
            <button onclick="buy('${doc.id}')">Buy</button>
          </div>
        `;
      });
    });
}

/* ================= CREATE LISTING ================= */

async function createListing() {
  const game = document.getElementById("game").value.trim();
  const details = document.getElementById("details").value.trim();
  const price = parseFloat(document.getElementById("price").value);

  if (!game || !price) {
    alert("Enter game and price");
    return;
  }

  const file = document.getElementById("listingScreenshotFile").files[0];
  const screenshot = file ? await uploadImage(file, "listings") : null;

  await db.collection("listings").add({
    game,
    details,
    price,
    screenshot,
    seller: auth.currentUser.uid,
    status: "active",
    created: new Date()
  });

  alert("Listing created");
}

/* ================= BUY ================= */

async function buy(id) {
  await db.collection("orders").add({
    listingId: id,
    buyer: auth.currentUser.uid,
    status: "pending",
    created: new Date()
  });

  alert("Order created");
  openOrders();
}

/* ================= ORDERS ================= */

function openOrders() {
  show("orders");
  loadOrders();
}

function loadOrders() {
  db.collection("orders")
    .where("buyer", "==", auth.currentUser.uid)
    .onSnapshot(snap => {
      ordersList.innerHTML = "";

      snap.forEach(doc => {
        const d = doc.data();

        ordersList.innerHTML += `
          <div class="card">
            Order: ${doc.id}<br>
            Status: ${d.status}
          </div>
        `;
      });
    });
}

/* ================= ADMIN ================= */

function loadAdmin() {

  /* VERIFICATIONS */
  db.collection("verifications")
    .where("status", "==", "pending")
    .onSnapshot(snap => {
      adminUsers.innerHTML = "";

      snap.forEach(doc => {
        const v = doc.data();

        adminUsers.innerHTML += `
          <div class="card">
            Seller: ${doc.id}<br>
            <a href="${v.idPhotoUrl}" target="_blank">View ID</a><br>
            <button onclick="approveSeller('${doc.id}')">Approve</button>
          </div>
        `;
      });
    });

  /* LISTINGS */
  db.collection("listings")
    .onSnapshot(snap => {
      adminOrders.innerHTML = "";

      snap.forEach(doc => {
        const d = doc.data();

        adminOrders.innerHTML += `
          <div class="card">
            ${d.game} - $${d.price}<br>
            Status: ${d.status}<br>
            <button onclick="removeListing('${doc.id}')">Remove</button>
          </div>
        `;
      });
    });
}

async function approveSeller(uid) {
  await db.collection("users").doc(uid).update({
    verified: true
  });

  await db.collection("verifications").doc(uid).update({
    status: "approved"
  });

  alert("Seller approved");
}

async function removeListing(id) {
  await db.collection("listings").doc(id).update({
    status: "removed"
  });
}