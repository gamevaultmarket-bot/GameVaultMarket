/* ===============================
   FIREBASE INIT
=============================== */
firebase.initializeApp({
  apiKey: "AIzaSyBfGXL6lKmBTZ9FIxsmsP_-40_-MZ33zBw",
  authDomain: "gamevaultmarket-5e494.firebaseapp.com",
  projectId: "gamevaultmarket-5e494"
});

const auth = firebase.auth();
const db = firebase.firestore();

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
      termsAccepted: false,
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

  if (!data.termsAccepted) {
    show("risk");
    return;
  }

  sellBtn.style.display = "none";
  adminBtn.style.display = "none";
  verifyBtn.style.display = "none";
  payoutBtn.style.display = "none";

  if (user.email === "gamevaultmarket@gmail.com") {
    adminBtn.style.display = "inline-block";
    show("admin");
    loadAdmin();
    return;
  }

  if (data.role === "seller" && !data.verified) {
    verifyBtn.style.display = "inline-block";
    show("verification");
    return;
  }

  if (data.role === "seller" && data.verified && !data.payout) {
    payoutBtn.style.display = "inline-block";
    show("payout");
    return;
  }

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
   TERMS
=============================== */
async function acceptTerms() {
  if (!document.getElementById("agreeTerms").checked) {
    alert("You must agree before continuing");
    return;
  }
  await db.collection("users").doc(auth.currentUser.uid).update({
    termsAccepted: true
  });
  location.reload();
}

/* ===============================
   VERIFICATION — BUG FIXES:
   1. Removed duplicate alert("Uploading...")
   2. File check now happens BEFORE any alert/upload
=============================== */
async function submitVerification() {
  if (!currentUser) return alert("Login first");

  const check = await db.collection("verifications")
    .where("uid", "==", currentUser.uid)
    .get();

  if (!check.empty) {
    alert("Verification already submitted");
    return;
  }

  const idFile = document.getElementById("idPhoto").files[0];
  const selfieFile = document.getElementById("selfiePhoto").files[0];
  const payFile = document.getElementById("paymentProof").files[0];

  // FIX 5: file check before showing any upload alert
  if (!idFile || !selfieFile || !payFile) {
    alert("Upload all files");
    return;
  }

  // FIX 1: single alert, shown only once after validation passes
  alert("Uploading...");

  const idUrl = await uploadFile("verification", idFile);
  const selfieUrl = await uploadFile("verification", selfieFile);
  const payUrl = await uploadFile("payments", payFile);

  if (!idUrl || !selfieUrl || !payUrl) {
    alert("Upload failed");
    return;
  }

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

/* ===============================
   PAYOUT
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

/* ===============================
   CREATE LISTING
   (listing limit check stays here — correct context)
=============================== */
async function createListing() {
  if (!game.value || !price.value) {
    alert("Enter game and price");
    return;
  }

  const existing = await db.collection("listings")
    .where("seller", "==", auth.currentUser.uid)
    .where("status", "==", "active")
    .get();

  if (existing.size >= 5) {
    alert("Max 5 active listings allowed");
    return;
  }

  const shotFile = document.getElementById("listingImg").files[0];
  let screenshotUrl = null;

  if (shotFile) {
    alert("Uploading screenshot...");
    screenshotUrl = await uploadFile("listings", shotFile);
  }

  await db.collection("listings").add({
    game: game.value,
    price: Math.max(1, parseFloat(price.value) || 0),
    seller: auth.currentUser.uid,
    screenshot: screenshotUrl,
    status: "active",
    created: firebase.firestore.FieldValue.serverTimestamp()
  });

  alert("Listing created");
}

/* ===============================
   BUY — BUG FIX 2:
   Removed misplaced listing-limit check that
   ran in buyer context using seller query
=============================== */
async function buy(id) {
  const check = await db.collection("orders")
    .where("listingId", "==", id)
    .where("status", "in", ["awaiting_fee", "paid", "paid_waiting_seller"])
    .get();

  if (!check.empty) {
    alert("This listing already has an active order");
    return;
  }

  const listing = await db.collection("listings").doc(id).get();
  if (!listing.exists) return alert("Listing not found");

  const data = listing.data();
  if (auth.currentUser.uid === data.seller) {
    alert("You cannot buy your own listing");
    return;
  }

  const ref = await db.collection("orders").add({
    listingId: id,
    buyer: auth.currentUser.uid,
    seller: data.seller,
    price: data.price,
    status: "awaiting_fee",
    created: firebase.firestore.FieldValue.serverTimestamp()
  });

  openOrder(ref.id);
  watchOrder(ref.id);
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
          Seller locked<br><br>
          Pay $2:<br>
          Skrill: ${PAYMENTS.skrill}<br>
          USDT: ${PAYMENTS.usdt}<br>
          Grey: ${PAYMENTS.grey}<br><br>
          <input type="file" id="serviceProof"><br><br>
          <button onclick="submitServiceFee('${orderId}')">Upload Payment Proof</button>
        `
        : `
          Seller unlocked<br><br>
          <button onclick="openChat('${orderId}')">Open Chat</button>
        `
      }
    </div>
  `;
}

function watchOrder(orderId) {
  db.collection("orders").doc(orderId).onSnapshot(doc => {
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
   CHAT
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

  if (!msg && files.length === 0) {
    alert("Message cannot be empty");
    return;
  }

  const userDoc = await db.collection("users").doc(auth.currentUser.uid).get();
  const role = userDoc.data().role;

  let imageUrls = [];

  if (role === "seller" && files.length > 0) {
    if (files.length > 2) {
      alert("Max 2 images allowed");
      return;
    }
    for (let file of files) {
      const url = await uploadFile("chat", file);
      if (url) imageUrls.push(url);
    }
  }

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
   LISTINGS — BUG FIX 6:
   innerHTML reset to "" at top of snapshot
   to prevent duplicate appending on updates
=============================== */
function loadListings() {
  db.collection("listings").where("status", "==", "active")
    .onSnapshot(snap => {
      listings.innerHTML = ""; // FIX: clear before re-render
      snap.forEach(doc => {
        const d = doc.data();
        listings.innerHTML += `
          <div class="listing">
            <b>${d.game}</b> - $${d.price}<br>
            ${d.screenshot ? `<img src="${d.screenshot}">` : ""}
            <button onclick="buy('${doc.id}')">Buy</button>
          </div>
        `;
      });
    });
}

/* ===============================
   ADMIN — BUG FIXES 3 & 4:
   All onSnapshot listeners moved inside loadAdmin()
   so they only run for admin users
=============================== */
function loadAdmin() {

  // FIX 3 & 4: stats, earnings, and orders listeners now inside loadAdmin()
  db.collection("orders").onSnapshot(snap => {
    let total = 0, paid = 0, released = 0, cancelled = 0, earnings = 0;

    snap.forEach(doc => {
      const o = doc.data();
      total++;
      if (o.status === "paid") paid++;
      if (o.status === "released") released++;
      if (o.status === "cancelled") cancelled++;
      if (o.status === "paid" || o.status === "released") earnings += 2;
    });

    adminStats.innerHTML = `
      <div class="card">
        <b>Orders:</b> ${total} |
        <span style="color:lightgreen">Paid: ${paid}</span> |
        <span style="color:cyan">Released: ${released}</span> |
        <span style="color:red">Cancelled: ${cancelled}</span>
      </div>
    `;

    adminEarnings.innerHTML = `
      <div class="card">
        Platform Earnings: <b>$${earnings}</b>
      </div>
    `;

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
            ? `<a href="${o.serviceProof}" target="_blank">View Buyer Proof</a><br><br>`
            : `<span style="color:red">No proof uploaded</span><br><br>`
          }
          <button onclick="markPaid('${doc.id}')">Mark Paid</button>
          <button onclick="releaseOrder('${doc.id}','${o.listingId}')">Release</button>
          <button onclick="cancelOrder('${doc.id}','${o.listingId}')">Cancel</button>
        </div>
      `;
    });
  });

  db.collection("verifications").where("status", "==", "pending")
    .onSnapshot(snap => {
      adminUsers.innerHTML = "";
      snap.forEach(doc => {
        const v = doc.data();
        adminUsers.innerHTML += `
          <div class="card">
            Seller: ${v.uid}<br>
            <a href="${v.idPhoto}" target="_blank">View ID</a><br>
            <a href="${v.selfie}" target="_blank">View Selfie</a><br>
            <button onclick="approveSeller('${doc.id}','${v.uid}')">Approve</button>
          </div>
        `;
      });
    });

  db.collection("chats").onSnapshot(snap => {
    adminChats.innerHTML = "<h3>Live Chats</h3>";
    snap.forEach(doc => {
      adminChats.innerHTML += `<div>${doc.id}</div>`;
    });
  });
}

async function approveSeller(docId, uid) {
  await db.collection("users").doc(uid).update({ verified: true });
  await db.collection("verifications").doc(docId).update({ status: "approved" });
  alert("Seller approved");
}

async function removeListing(id) {
  await db.collection("listings").doc(id).update({
    status: "removed",
    removedAt: new Date()
  });
  alert("Listing removed");
}

async function activateListing(id) {
  await db.collection("listings").doc(id).update({
    status: "active",
    approvedAt: new Date()
  });
  alert("Listing activated");
}

async function markPaid(orderId) {
  await db.collection("orders").doc(orderId).update({
    status: "paid",
    paidAt: new Date()
  });
  alert("Order marked as PAID");
}

async function releaseOrder(orderId, listingId) {
  const orderRef = db.collection("orders").doc(orderId);
  const order = await orderRef.get();

  if (!order.exists) return alert("Order missing");

  const data = order.data();
  if (data.status !== "paid") {
    alert("Order must be PAID before release");
    return;
  }

  await orderRef.update({ status: "released", releasedAt: new Date() });
  await db.collection("listings").doc(listingId).update({ status: "sold" });
  alert("Order released — Trade completed");
}

async function cancelOrder(orderId, listingId) {
  await db.collection("orders").doc(orderId).update({
    status: "cancelled",
    cancelledAt: new Date()
  });
  await db.collection("listings").doc(listingId).update({ status: "active" });
  alert("Order cancelled");
}

/* ===============================
   UPLOAD FILE
=============================== */
async function uploadFile(type, file) {
  if (!file || !file.type.startsWith("image/")) {
    alert("Only images allowed");
    return null;
  }
  if (file.size > 5 * 1024 * 1024) {
    alert("Max file size is 5MB");
    return null;
  }

  const CLOUD_NAME = "dwxgzykij";
  const PRESET = "gamevault_upload";

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", PRESET);
  formData.append("folder", "gamevault/" + type);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    { method: "POST", body: formData }
  );

  const data = await res.json();
  if (!data.secure_url) {
    alert("Upload failed");
    console.log(data);
    return null;
  }
  return data.secure_url;
}

async function submitServiceFee(orderId) {
  const userDoc = await db.collection("users").doc(auth.currentUser.uid).get();
  const role = userDoc.data().role;

  if (role !== "buyer") {
    alert("Only buyer can upload service payment proof");
    return;
  }

  const fileInput = document.getElementById("serviceProof");
  if (!fileInput || !fileInput.files.length) {
    alert("Upload payment proof");
    return;
  }

  const file = fileInput.files[0];
  const proofUrl = await uploadFile("payments", file);

  await db.collection("orders").doc(orderId).update({
    serviceProof: proofUrl,
    status: "paid_waiting_seller",
    paidAt: new Date()
  });

  alert("Payment proof submitted");
}

async function isChatLocked(orderId) {
  const doc = await db.collection("orders").doc(orderId).get();
  if (!doc.exists) return true;
  const status = doc.data().status;
  return (status === "released" || status === "cancelled");
}

async function openChat(orderId) {
  const orderRef = await db.collection("orders").doc(orderId).get();
  if (!orderRef.exists) {
    alert("Order not found");
    return;
  }

  const order = orderRef.data();

  if (order.status === "awaiting_fee") {
    alert("Pay $2 service fee first to unlock chat");
    return;
  }

  if (order.status === "released" || order.status === "cancelled") {
    alert("Chat closed — Order finished");
    return;
  }

  currentChat = orderId;
  show("chat");

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
      messages.scrollTop = messages.scrollHeight;
    });
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