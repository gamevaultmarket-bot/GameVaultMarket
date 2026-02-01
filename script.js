// FIREBASE INIT
firebase.initializeApp({
  apiKey: "AIzaSyBfGXL6lKmBTZ9FIxsmsP_-40_-MZ33zBw",
  authDomain: "gamevaultmarket-5e494.firebaseapp.com",
  projectId: "gamevaultmarket-5e494",
  storageBucket: "gamevaultmarket-5e494.appspot.com"
});

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

let currentOrder = null;

// AUTH
function signup() {
  auth.createUserWithEmailAndPassword(email.value, password.value)
    .then(res => {
      return db.collection("users").doc(res.user.uid).set({
        email: email.value,
        role: role.value,
        verified: false,
        created: new Date()
      });
    })
    .catch(e => alert(e.message));
}

function login() {
  auth.signInWithEmailAndPassword(email.value, password.value)
    .catch(e => alert(e.message));
}

function logout() {
  auth.signOut();
}

// AUTH STATE
auth.onAuthStateChanged(async user => {
  if (!user) return;

  authDivHide();
  nav.classList.remove("hidden");

  const snap = await db.collection("users").doc(user.uid).get();
  const data = snap.data();

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
  loadListings();
});

// UI HELPERS
function show(id) {
  document.querySelectorAll("section").forEach(s => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

function authDivHide() {
  document.getElementById("auth").classList.add("hidden");
}

// VERIFICATION
async function submitVerification() {
  const uid = auth.currentUser.uid;

  async function upload(file, path) {
    const ref = storage.ref(path);
    await ref.put(file);
    return ref.getDownloadURL();
  }

  const idUrl = await upload(idFile.files[0], `verifications/${uid}/id`);
  const selfieUrl = await upload(selfieFile.files[0], `verifications/${uid}/selfie`);
  const paymentUrl = await upload(paymentFile.files[0], `verifications/${uid}/payment`);

  const gameUrls = [];
  for (let f of gameFiles.files) {
    gameUrls.push(await upload(f, `verifications/${uid}/game_${f.name}`));
  }

  await db.collection("verifications").doc(uid).set({
    idUrl,
    selfieUrl,
    paymentUrl,
    gameUrls,
    status: "pending",
    created: new Date()
  });

  alert("Verification submitted. Await admin approval.");
}

// LISTINGS
function loadListings() {
  db.collection("listings").where("status", "==", "approved")
    .onSnapshot(snap => {
      listings.innerHTML = "";
      snap.forEach(doc => {
        const d = doc.data();
        listings.innerHTML += `
          <div class="card">
            <b>${d.game}</b> - $${d.price}
            <button onclick="buy('${doc.id}')">Buy</button>
          </div>
        `;
      });
    });
}

async function createListing() {
  const uid = auth.currentUser.uid;
  const file = screenshot.files[0];
  const ref = storage.ref(`listings/${Date.now()}_${file.name}`);
  await ref.put(file);
  const url = await ref.getDownloadURL();

  await db.collection("listings").add({
    game: game.value,
    details: details.value,
    price: price.value,
    screenshot: url,
    seller: uid,
    status: "pending",
    created: new Date()
  });

  alert("Listing submitted for approval");
}

// BUY + CHAT
async function buy(listingId) {
  const listing = await db.collection("listings").doc(listingId).get();
  const seller = listing.data().seller;

  const order = await db.collection("orders").add({
    listingId,
    buyer: auth.currentUser.uid,
    seller,
    status: "waiting_platform_fee",
    created: new Date()
  });

  openChat(order.id);
}

function openChat(orderId) {
  currentOrder = orderId;
  show("chat");

  db.collection("chats").doc(orderId).collection("messages")
    .orderBy("time")
    .onSnapshot(snap => {
      messages.innerHTML = "";
      snap.forEach(m => {
        messages.innerHTML += `<p>${m.data().text}</p>`;
      });
    });
}

function sendMessage() {
  if (!currentOrder) return;
  db.collection("chats").doc(currentOrder).collection("messages").add({
    sender: auth.currentUser.uid,
    text: msgInput.value,
    time: new Date()
  });
  msgInput.value = "";
}

// ADMIN
function loadAdmin() {
  db.collection("verifications").where("status", "==", "pending")
    .onSnapshot(snap => {
      adminVerifications.innerHTML = "";
      snap.forEach(doc => {
        adminVerifications.innerHTML += `
          <div class="card">
            Seller: ${doc.id}
            <button onclick="approveSeller('${doc.id}')">Approve</button>
          </div>
        `;
      });
    });
}

async function approveSeller(uid) {
  await db.collection("users").doc(uid).update({ verified: true });
  await db.collection("verifications").doc(uid).update({ status: "approved" });
  alert("Seller approved");
}