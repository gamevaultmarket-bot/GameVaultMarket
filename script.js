/***********************
 * FIREBASE INIT
 ***********************/
firebase.initializeApp({
  apiKey: "AIzaSyBfGXL6lKmBTZ9FIxsmsP_-40_-MZ33zBw",
  authDomain: "gamevaultmarket-5e494.firebaseapp.com",
  projectId: "gamevaultmarket-5e494",
  storageBucket: "gamevaultmarket-5e494.appspot.com"
});

const auth = firebase.auth();
const db = firebase.firestore();

/***********************
 * DOM ELEMENTS
 ***********************/
const authSection = document.getElementById("auth");
const nav = document.getElementById("nav");
const sellBtn = document.getElementById("sellBtn");
const adminBtn = document.getElementById("adminBtn");
const adminUsers = document.getElementById("adminUsers");
const adminOrders = document.getElementById("adminOrders");

/***********************
 * AUTH
 ***********************/
function signup() {
  auth.createUserWithEmailAndPassword(email.value, password.value)
    .then(res => {
      return db.collection("users").doc(res.user.uid).set({
        email: email.value,
        role: role.value,
        verified: false,
        created: firebase.firestore.FieldValue.serverTimestamp()
      });
    })
    .catch(err => alert(err.message));
}

function login() {
  auth.signInWithEmailAndPassword(email.value, password.value)
    .catch(err => alert(err.message));
}

function logout() {
  auth.signOut();
}

/***********************
 * AUTH STATE (ONLY ONE)
 ***********************/
auth.onAuthStateChanged(async user => {
  if (!user) {
    authSection.classList.remove("hidden");
    nav.classList.add("hidden");
    return;
  }

  authSection.classList.add("hidden");
  nav.classList.remove("hidden");

  // reset buttons
  sellBtn.classList.add("hidden");
  adminBtn.classList.add("hidden");

  const snap = await db.collection("users").doc(user.uid).get();
  if (!snap.exists) return;

  const data = snap.data();

  // ✅ ADMIN
  if (data.role === "admin") {
    adminBtn.classList.remove("hidden");
    show("admin");
    loadAdminPanel();
    return;
  }

  // SELLER (NOT VERIFIED)
  if (data.role === "seller" && data.verified === false) {
    show("risk");
    return;
  }

  // SELLER (VERIFIED)
  if (data.role === "seller" && data.verified === true) {
    sellBtn.classList.remove("hidden");
  }

  // BUYER
  show("home");
});

/***********************
 * NAV
 ***********************/
function show(id) {
  document.querySelectorAll("section").forEach(s => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

/***********************
 * ADMIN PANEL
 ***********************/
function loadAdminPanel() {
  // Sellers
  db.collection("users")
    .where("role", "==", "seller")
    .onSnapshot(snap => {
      adminUsers.innerHTML = "";
      snap.forEach(doc => {
        const u = doc.data();
        adminUsers.innerHTML += `
          <div class="card">
            ${u.email || doc.id}<br>
            Verified: ${u.verified ? "✅" : "❌"}
            <br>
            <button onclick="verifySeller('${doc.id}')">Verify</button>
          </div>
        `;
      });
    });

  // Orders
  db.collection("orders").onSnapshot(snap => {
    adminOrders.innerHTML = "";
    snap.forEach(doc => {
      adminOrders.innerHTML += `
        <div class="card">
          Order ID: ${doc.id}<br>
          Status: ${doc.data().status}
        </div>
      `;
    });
  });
}

function verifySeller(uid) {
  db.collection("users").doc(uid).update({ verified: true });
  alert("Seller verified");
}