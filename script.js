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

const SUPABASE_URL = "https://ztzdwkyqfffzorwuxbrb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0emR3a3lxZmZmem9yd3V4YnJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExOTQ4NjYsImV4cCI6MjA4Njc3MDg2Nn0.Yf8CiuUkFcnd3VGLyf8XaEIp_Lfx7PG0yP9bJv5pkdg";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* STORAGE BUCKET NAMES */
const BUCKETS = {
  verification: "verification",   // ID + selfie
  listings: "listings",
  chat: "chat",
  payments: "payments"            // ALL payment proofs here
};

/* ===============================
   PAYMENT DESTINATIONS
=============================== */
const PAYMENTS = {
  skrill: "gamevaultmarket@gmail.com",
  usdt: "0x992d0E36A7409F0c9228B51C6bB8F875b1A4Af3B",
  grey: "212286724510"
};
let currentUser = null;
let currentChat = null;

/* ===============================
   AUTH
=============================== */
async function signup() {
  try {

    if (!email.value || !password.value || !role.value) {
      alert("Fill all fields");
      return;
    }

    if (password.value.length < 6) {
      alert("Password must be at least 6 characters");
      return;
    }

    const r = await auth.createUserWithEmailAndPassword(
      email.value.trim(),
      password.value.trim()
    );
  await db.collection("users").doc(r.user.uid).set({
    email: email.value.trim(),
    role: role.value,
    verified: false,
    payout: null,
    termsAccepted: false,   // 👈 IMPORTANT
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
  auth.signOut().then(() => {
    document.getElementById("nav").classList.add("hidden");
    show("auth");
  });
}

/* ===============================
   AUTH STATE
=============================== */
auth.onAuthStateChanged(async user => {

  currentUser = user;

  const nav = document.getElementById("nav");
  const sellBtn = document.getElementById("sellBtn");
  const adminBtn = document.getElementById("adminBtn");
  const verifyBtn = document.getElementById("verifyBtn");
  const payoutBtn = document.getElementById("payoutBtn");

  if (!user) {
    nav.classList.add("hidden");
    show("auth");
    return;
  }

  nav.classList.remove("hidden");

  const snap = await db.collection("users").doc(user.uid).get();
  if (!snap.exists) return;

  const data = snap.data();

  /* TERMS CHECK */
  if (!data.termsAccepted) {
    show("risk");
    return;
  }

  /* RESET BUTTONS */
  sellBtn.style.display = "none";
  adminBtn.style.display = "none";
  verifyBtn.style.display = "none";
  payoutBtn.style.display = "none";

  /* ADMIN */
  if (data.role === "admin" || data.admin === true) {
    adminBtn.style.display = "inline-block";
    show("admin");
    loadAdmin();
    return;
  }

  /* SELLER NOT VERIFIED */
  if (data.role === "seller" && !data.verified) {
    verifyBtn.style.display = "inline-block";
    show("verification");
    return;
  }

  /* PAYOUT REQUIRED */
  if (data.role === "seller" && data.verified && !data.payout) {
    payoutBtn.style.display = "inline-block";
    show("payout");
    return;
  }

  /* SELLER VERIFIED */
  if (data.role === "seller" && data.verified) {
    sellBtn.style.display = "inline-block";
  }

  show("home");
  loadListings();
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

  if (!currentUser) return alert("Login first");

  // ❗ CHECK BEFORE SAVING
  const check = await db.collection("verifications")
    .where("uid","==",currentUser.uid)
    .get();

  if (!check.empty) {
    alert("Verification already submitted");
    return;
  }

  alert("Uploading...");

  const idFile = document.getElementById("idPhoto").files[0];
  const selfieFile = document.getElementById("selfiePhoto").files[0];
  const payFile = document.getElementById("paymentProof").files[0];

  if (!idFile || !selfieFile || !payFile) {
    alert("Upload all files");
    return;
  }

 const idUrl = await uploadFile(BUCKETS.verification, idFile);
 const selfieUrl = await uploadFile(BUCKETS.verification, selfieFile);
 const payUrl = await uploadFile(BUCKETS.payment, payFile);

  await db.collection("verifications").add({
    uid: currentUser.uid,
    idPhoto: idUrl,
    selfie: selfieUrl,
    paymentProof: payUrl,
    status: "pending",
    createdAt: Date.now()
  });

  alert("Verification submitted");
}
/* =============================== */

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
  show("home");
}

async function createListing() {

  const shotFile = document.getElementById("listingImg").files[0];
  let screenshotUrl = null;

  if (shotFile) {
    alert("Uploading screenshot...");
    screenshotUrl = await uploadFile(BUCKETS.listings, shotFile);
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

  const listing = await db.collection("listings").doc(id).get();
  if (!listing.exists) return alert("Listing not found");

  const data = listing.data();

  const ref = await db.collection("orders").add({
    listingId: id,
    buyer: auth.currentUser.uid,
    seller: data.seller,
    price: data.price,
    status: "awaiting_fee",
    created: firebase.firestore.FieldValue.serverTimestamp()
  });

  openOrder(ref.id);     // OPEN LOCKED PAGE
  watchOrder(ref.id);    // REALTIME UPDATE
}
async function openOrder(orderId) {

  const ref = await db.collection("orders").doc(orderId).get();
  if (!ref.exists) return;

  const o = ref.data();

  show("order");

  orderBox.innerHTML = `
    <div class="card">
      <b>Order:</b> ${orderId}<br>
      Status: <b>${o.status}</b><br><br>

      ${
        o.status === "awaiting_fee"
        ? `
          🔒 Seller locked<br><br>

          Pay $2:<br>
          Skrill: ${PAYMENTS.skrill}<br>
          USDT: ${PAYMENTS.usdt}<br>
          Grey: ${PAYMENTS.grey}<br><br>

          <input type="file" id="serviceProof"><br><br>
          <button onclick="submitServiceFee('${orderId}')">
            Upload Payment Proof
          </button>
        `
        : `
          🔓 Seller unlocked<br><br>
          <button onclick="openChat('${orderId}')">
            Open Chat
          </button>
        `
      }
    </div>
  `;
}

function watchOrder(orderId) {
  db.collection("orders").doc(orderId)
  .onSnapshot(doc => {
    if (!doc.exists) return;

    const status = doc.data().status;

    if (status === "released" || status === "cancelled") {
      alert("Order closed");
      show("home");
      return;
    }

    openOrder(orderId);
  });
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
  
  if (await isChatLocked(currentChat)) {
  alert("Chat closed — Order finished");
  return;
}

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
      const url = await uploadFile(BUCKETS.chat, file);
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
      text: cleanMessage(msg),
      images: imageUrls,
      time: new Date()
    });

  msgInput.value = "";
  chatImages.value = "";
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
          ${d.screenshot ? `<img src="${d.screenshot}">` : ""}
          <button onclick="buy('${doc.id}')">Buy</button>
        </div>
      `;
    });
  });
}
/* ===============================
   ADMIN PANEL
=============================== */
function loadAdmin() {

/* ===============================
   ADMIN STATS (LIVE)
=============================== */
db.collection("orders").onSnapshot(snap => {

  let total = 0;
  let paid = 0;
  let released = 0;
  let cancelled = 0;

  snap.forEach(doc => {
    const o = doc.data();
    total++;

    if (o.status === "paid") paid++;
    if (o.status === "released") released++;
    if (o.status === "cancelled") cancelled++;
  });

  adminStats.innerHTML = `
    <div class="card">
      <b>Orders:</b> ${total} |
      <span style="color:lightgreen">Paid: ${paid}</span> |
      <span style="color:cyan">Released: ${released}</span> |
      <span style="color:red">Cancelled: ${cancelled}</span>
    </div>
  `;
});

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
          <button onclick="approveSeller('${doc.id}','${v.uid}')">Approve</button>
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

/* ===============================
   ORDERS CONTROL (ADMIN)
=============================== */
db.collection("orders")
.onSnapshot(snap => {

  adminOrders.innerHTML = "<h3>All Orders</h3>";

  if (snap.empty) {
    adminOrders.innerHTML += "<p>No orders</p>";
    return;
  }

  snap.forEach(doc => {
    const o = doc.data();

    adminOrders.innerHTML += `
      <div class="card">

        <b>Order ID:</b> ${doc.id}<br>
        Listing: ${o.listingId}<br>
        Buyer: ${o.buyer}<br>
        Seller: ${o.seller}<br>
        Price: $${o.price}<br>
        Status: <b>${o.status}</b><br><br>

        ${
          o.serviceProof
          ? `<a href="${o.serviceProof}" target="_blank">📄 View Buyer Proof</a><br><br>`
          : `<span style="color:red">No proof uploaded</span><br><br>`
        }

        <button onclick="markPaid('${doc.id}')">💰 Mark Paid</button>
        <button onclick="releaseOrder('${doc.id}','${o.listingId}')">🔓 Release</button>
        <button onclick="cancelOrder('${doc.id}','${o.listingId}')">❌ Cancel</button>

      </div>
    `;
  });
});

async function approveSeller(docId, uid) {
  await db.collection("users").doc(uid).update({ verified: true });
  await db.collection("verifications").doc(uid).update({ status: "approved" });
  alert("Seller approved");
}

async function removeListing(id) {
  await db.collection("listings").doc(id).update({
    status: "removed",
    removedAt: new Date()
  });
  alert("Listing removed");
}

/* ===============================
   UPLOAD FILE TO SUPABASE STORAGE
=============================== */
async function uploadFile(bucket, file) {
  if (!file) return null;

  const filePath = `${currentUser.uid}/${Date.now()}_${file.name}`;

  const { error } = await supabaseClient
    .storage
    .from(bucket)
    .upload(filePath, file);

  if (error) {
    alert("Upload failed: " + error.message);
    return null;
  }

  const { data } = supabaseClient
    .storage
    .from(bucket)
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

  const proofUrl = await uploadFile(BUCKETS.payments, file);

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
/* ===============================
   MARK ORDER PAID
=============================== */
async function markPaid(orderId) {
  await db.collection("orders").doc(orderId).update({
    status: "paid",
    paidAt: new Date()
  });

  alert("Order marked as PAID");
}


/* ===============================
   RELEASE ORDER (COMPLETE TRADE)
=============================== */
async function releaseOrder(orderId, listingId) {

  const orderRef = db.collection("orders").doc(orderId);
  const order = await orderRef.get();

  if (!order.exists) return alert("Order missing");

  const data = order.data();

  if (data.status !== "paid") {
    alert("Order must be PAID before release");
    return;
  }

  await orderRef.update({
    status: "released",
    releasedAt: new Date()
  });

  await db.collection("listings").doc(listingId).update({
    status: "sold"
  });

  alert("Order released — Trade completed");
}

/* ===============================
   CANCEL ORDER
=============================== */
async function cancelOrder(orderId, listingId) {

  await db.collection("orders").doc(orderId).update({
    status: "cancelled",
    cancelledAt: new Date()
  });

  await db.collection("listings").doc(listingId).update({
    status: "active"
  });

  alert("Order cancelled");
}

/* ===============================
   AUTO CLEAN BROKEN ORDERS
=============================== */
setTimeout(() => {
  db.collection("orders").onSnapshot(snap => {
    snap.forEach(doc => {
      const o = doc.data();
      if (!o.listingId || !o.buyer) {
        db.collection("orders").doc(doc.id).delete();
      }
    });
  });
}, 4000);

/* ===============================
   LOCK CHAT AFTER RELEASE / CANCEL
=============================== */
async function isChatLocked(orderId) {
  const doc = await db.collection("orders").doc(orderId).get();
  if (!doc.exists) return true;

  const status = doc.data().status;
  return (status === "released" || status === "cancelled");
}

/* ===============================
   PLATFORM EARNINGS
=============================== */
db.collection("orders").onSnapshot(snap => {

  let earnings = 0;

  snap.forEach(doc => {
    const o = doc.data();
    if (o.status === "paid" || o.status === "released") {
      earnings += 2; // platform fee
    }
  });

  adminEarnings.innerHTML = `
    <div class="card">
      Platform Earnings: <b>$${earnings}</b>
    </div>
  `;
});

async function openChat(orderId) {

  // Check order exists
  const orderRef = await db.collection("orders").doc(orderId).get();
  if (!orderRef.exists) {
    alert("Order not found");
    return;
  }

  const order = orderRef.data();

  // LOCK CHAT UNTIL $2 PAID
  if (order.status === "awaiting_fee") {
    alert("Pay $2 service fee first to unlock chat");
    return;
  }

  // LOCK CHAT AFTER FINISH
  if (order.status === "released" || order.status === "cancelled") {
    alert("Chat closed — Order finished");
    return;
  }

  currentChat = orderId;
  show("chat");

  // LIVE CHAT LISTENER
  db.collection("chats")
    .doc(orderId)
    .collection("messages")
    .orderBy("time")
    .onSnapshot(snap => {

      messages.innerHTML = "";

      snap.forEach(doc => {
        const m = doc.data();

        let imgs = "";
        if (m.images && m.images.length > 0) {
          imgs = m.images.map(i => `<img src="${i}" class="chat-img">`).join("");
        }

        messages.innerHTML += `
          <div class="msg">
            <b>${m.sender === auth.currentUser.uid ? "You" : "User"}:</b>
            ${m.text || ""}
            <div>${imgs}</div>
          </div>
        `;
      });

      // Auto scroll down
      messages.scrollTop = messages.scrollHeight;
    });
}
async function acceptTerms() {
  if (!document.getElementById("agreeTerms").checked) {
    alert("You must agree before continuing");
    return;
  }

  await db.collection("users").doc(auth.currentUser.uid).update({
    termsAccepted: true
  });

  location.reload(); // 🔁 reload app and re-run auth check
}
