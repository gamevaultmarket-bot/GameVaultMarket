/* ===============================
   FIREBASE INIT (UNCHANGED)
=============================== */
firebase.initializeApp({
  apiKey: "AIzaSyBfGXL6lKmBTZ9FIxsmsP_-40_-MZ33zBw",
  authDomain: "gamevaultmarket-5e494.firebaseapp.com",
  projectId: "gamevaultmarket-5e494"
});

const auth = firebase.auth();
const db = firebase.firestore();

/* ===============================
   SUPABASE STORAGE CONFIG
=============================== */

const SUPABASE_URL = "https://pmgmbpwscyrsyrgyqsyy.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtZ21icHdzY3lyc3lyZ3lxc3l5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MjAxMTQsImV4cCI6MjA4NTk5NjExNH0.PKF5Rc9LRZLKO7FuALPdSF4kiourN5NgZP6IUgk1BJ0";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* STORAGE BUCKET NAME */
const BUCKET = "uploads";

/* ===============================
   PAYMENT DESTINATIONS
=============================== */
const PAYMENTS = {
  skrill: "gamevaultmarket@gmail.com",
  usdt: "0x992d0E36A7409F0c9228B51C6bB8F875b1A4Af3B",
  grey: "212286724510"
};

let currentChat = null;

/* ===============================
   AUTH
=============================== */
async function signup() {
  try {
    const r = await auth.createUserWithEmailAndPassword(email.value, password.value);

    await db.collection("users").doc(r.user.uid).set({
      email: email.value,
      role: role.value,
      verified: false,
      payout: null,
      created: firebase.firestore.FieldValue.serverTimestamp()
    });

    alert("Signup successful");
  } catch (e) {
    alert(e.message);
  }
}

async function login() {
  try {
    await auth.signInWithEmailAndPassword(email.value, password.value);
  } catch (e) {
    alert(e.message);
  }
}

function logout() {
  auth.signOut();
}

/* ===============================
   AUTH STATE
=============================== */
auth.onAuthStateChanged(async user => {
  if (!user) {
    show("auth");
    return;
  }

  const snap = await db.collection("users").doc(user.uid).get();
  if (!snap.exists) return;

  const data = snap.data();

  sellBtn.classList.add("hidden");
  adminBtn.classList.add("hidden");

  /* ADMIN */
  if (data.role === "admin") {
    adminBtn.classList.remove("hidden");
    show("admin");
    loadAdmin();
    return;
  }

  /* SELLER NOT VERIFIED */
  if (data.role === "seller" && !data.verified) {
    show("verification");
    return;
  }

  /* PAYOUT REQUIRED */
  if (data.role === "seller" && data.verified && !data.payout) {
    show("payout");
    return;
  }

  if (data.role === "seller") sellBtn.classList.remove("hidden");

  show("risk");
});

/* ===============================
   SHOW PAGE
=============================== */
function show(id) {
  document.querySelectorAll("section").forEach(s => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

/* ===============================
   VERIFICATION (ONCE ONLY)
=============================== */
async function submitVerification() {

  const userDoc = await db.collection("users").doc(auth.currentUser.uid).get();
  const user = userDoc.data();

  if (user.role !== "seller") {
    alert("Only sellers can verify");
    return;
  }

  const uid = auth.currentUser.uid;
  const ref = db.collection("verifications").doc(uid);

  if ((await ref.get()).exists) {
    alert("Verification already submitted");
    return;
  }

  const idFile = idPhoto.files[0];
  const selfieFile = selfiePhoto.files[0];
  const payFile = paymentProof.files[0];

  if (!idFile || !selfieFile || !payFile) {
    alert("Upload ID, Selfie and Payment Proof");
    return;
  }

  alert("Uploading ID...");
  const idUrl = await uploadFile(idFile, "verification");

  alert("Uploading Selfie...");
  const selfieUrl = await uploadFile(selfieFile, "verification");

  alert("Uploading Payment Proof...");
  const payUrl = await uploadFile(payFile, "verification");

  await ref.set({
    seller: uid,
    idPhotoUrl: idUrl,
    selfiePhotoUrl: selfieUrl,
    paymentProofUrl: payUrl,
    status: "pending",
    created: firebase.firestore.FieldValue.serverTimestamp()
  });

  alert("Verification submitted");
}
/* ===============================
   LISTINGS CONTROL (ADMIN)
================================ */

db.collection("listings")
.onSnapshot(snap => {

  adminListings.innerHTML = "<h3>All Listings</h3>";

  if (snap.empty) {
    adminListings.innerHTML += "<p>No listings</p>";
    return;
  }

  snap.forEach(doc => {
    const d = doc.data();

    adminListings.innerHTML += `
      <div class="card">
        <b>${d.game}</b><br>
        Price: $${d.price}<br>
        Seller: ${d.seller}<br>
        Status: ${d.status}<br><br>

        <button onclick="activateListing('${doc.id}')">✅ Activate</button>
        <button onclick="removeListing('${doc.id}')">❌ Remove</button>
      </div>
    `;
  });

});

/* ===============================
   PAYOUT SAVE
=============================== */
async function savePayout() {
  await db.collection("users").doc(auth.currentUser.uid).update({
    payout: {
      method: payoutMethod.value,
      address: payoutAddress.value
    }
  });

  alert("Payout saved");
  show("risk");
}

/* ===============================
   LISTINGS
=============================== */
function loadListings() {
  db.collection("listings").where("status","==","active")
  .onSnapshot(snap => {
    listings.innerHTML = "";
    snap.forEach(doc => {
      const d = doc.data();

      listings.innerHTML += `
        <div class="card">
          <b>${d.game}</b> - $${d.price}<br>
          <button onclick="buy('${doc.id}')">Buy</button>
        </div>
      `;
    });
  });
}

async function createListing() {

  const shotFile = document.getElementById("screenshotFile").files[0];
  let screenshotUrl = null;

  if (shotFile) {
    alert("Uploading screenshot...");
    screenshotUrl = await uploadFile(shotFile, "listings");
  }

  await db.collection("listings").add({
    game: game.value,
    price: Number(price.value),
    seller: auth.currentUser.uid,
    screenshot: screenshotUrl,
    status: "active",
    created: firebase.firestore.FieldValue.serverTimestamp()
  });

  alert("Listing created");
}

/* ===============================
   BUY → REQUIRE $2 FEE
=============================== */
async function buy(id) {
  const ref = await db.collection("orders").add({
    listingId: id,
    buyer: auth.currentUser.uid,
    status: "awaiting_fee",
    created: firebase.firestore.FieldValue.serverTimestamp()
  });

  alert("Order created. Pay $2 to unlock seller details.");
}

/* ===============================
   CHAT FILTER (AUTO REMOVE DETAILS)
=============================== */
function cleanMessage(text) {
  const banned = /(whatsapp|telegram|@|http|www|\+233|\d{8,})/gi;
  return text.replace(banned, "[removed]");
}

async function sendMessage() {
  if (!currentChat) return;

  const msg = msgInput.value.trim();
  const files = chatImages.files;

  const userDoc = await db.collection("users").doc(auth.currentUser.uid).get();
  const role = userDoc.data().role;

  let imageUrls = [];

  // SELLER CAN SEND MAX 2 IMAGES
  if (role === "seller" && files.length > 0) {

    if (files.length > 2) {
      alert("Max 2 images allowed");
      return;
    }

    for (let file of files) {
      const url = await uploadFile(file, "chat");
      if (url) imageUrls.push(url);
    }
  }

  // BUYER CANNOT SEND IMAGES
  if (role === "buyer" && files.length > 0) {
    alert("Buyers cannot send images in chat");
    return;
  }

  await db.collection("chats")
    .doc(currentChat)
    .collection("messages")
    .add({
      sender: auth.currentUser.uid,
      text: msg,
      images: imageUrls,
      time: new Date()
    });

  msgInput.value = "";
  chatImages.value = "";
}

/* ===============================
   ADMIN PANEL
=============================== */
function loadAdmin() {

  /* VERIFICATIONS */
  db.collection("verifications")
  .where("status","==","pending")
  .onSnapshot(snap => {
    adminUsers.innerHTML = "";

    snap.forEach(doc => {
      const v = doc.data();

      adminUsers.innerHTML += `
        <div class="card">
          Seller: ${doc.id}<br>
          <a href="${v.idPhotoUrl}" target="_blank">View ID</a><br>
          <a href="${v.selfiePhotoUrl}" target="_blank">View Selfie</a><br>
          <button onclick="approveSeller('${doc.id}')">Approve</button>
        </div>
      `;
    });
  });

  /* CHAT SPY */
  db.collection("chats").onSnapshot(snap => {
    adminChats.innerHTML = "<h3>Live Chats</h3>";
    snap.forEach(doc => {
      adminChats.innerHTML += `<div>${doc.id}</div>`;
    });
  });
}

async function approveSeller(uid) {
  await db.collection("users").doc(uid).update({ verified:true });
  await db.collection("verifications").doc(uid).update({ status:"approved" });
  alert("Seller approved");
}

/* ===============================
   UPLOAD FILE TO SUPABASE STORAGE
=============================== */
async function uploadFile(file, folder = "general") {
  if (!file) return null;

  const fileExt = file.name.split(".").pop();
  const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
  const filePath = `${folder}/${fileName}`;

  const { error } = await supabaseClient.storage
    .from(BUCKET)
    .upload(filePath, file);

  if (error) {
    alert("Upload failed: " + error.message);
    return null;
  }

  const { data } = supabaseClient.storage
    .from(BUCKET)
    .getPublicUrl(filePath);

  return data.publicUrl;
}

async function submitServiceFee(orderId) {

  const userDoc = await db.collection("users").doc(auth.currentUser.uid).get();
  const role = userDoc.data().role;

  if (role !== "buyer") {
    alert("Only buyer can upload service payment proof");
    return;
  }

  const file = serviceProof.files[0];
  if (!file) {
    alert("Upload payment proof");
    return;
  }

  const proofUrl = await uploadFile(file, "payments");

  await db.collection("orders").doc(orderId).update({
    serviceProof: proofUrl,
    status: "paid_waiting_seller",
    paidAt: new Date()
  });

  alert("Payment proof submitted");
}
async function activateListing(id) {
  await db.collection("listings").doc(id).update({
    status: "active",
    approvedAt: new Date()
  });
  alert("Listing activated");
}