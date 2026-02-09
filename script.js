/* ================= SUPABASE STORAGE ================= */

const SUPABASE_URL = "https://pmgmbpwscyrsyrgyqsyy.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtZ21icHdzY3lyc3lyZ3lxc3l5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MjAxMTQsImV4cCI6MjA4NTk5NjExNH0.PKF5Rc9LRZLKO7FuALPdSF4kiourN5NgZP6IUgk1BJ0";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
firebase.initializeApp({
  apiKey: "AIzaSyBfGXL6lKmBTZ9FIxsmsP_-40_-MZ33zBw",
  authDomain: "gamevaultmarket-5e494.firebaseapp.com",
  projectId: "gamevaultmarket-5e494"
});
// Listen for login
firebase.auth().onAuthStateChanged(async (user) => {

  if (!user) {
    console.log("No user logged in");
    return;
  }

  console.log("User logged in:", user.uid);

  try {
    const doc = await firebase.firestore()
      .collection("users")
      .doc(user.uid)
      .get();

    if (!doc.exists) {
      console.log("User document not found");
      return;
    }

    const data = doc.data();
    console.log("User data:", data);

    // ✅ Check ADMIN
    if (data.role === "admin") {
      console.log("ADMIN DETECTED");

      const adminPanel = document.getElementById("adminPanel");
      if (adminPanel) {
        adminPanel.style.display = "block";
      }

    } else {
      console.log("Not admin");
    }

    // ✅ Check verification
    if (data.verified === false) {
      console.log("User NOT verified");
      // block app here if you want
    }

  } catch (err) {
    console.error("FIRESTORE ERROR:", err);
  }

});

const auth = firebase.auth();
const db = firebase.firestore();
const ordersList = document.getElementById("ordersList");
const email = document.getElementById("email");
const password = document.getElementById("password");
const role = document.getElementById("role");
const nav = document.getElementById("nav");
const sellBtn = document.getElementById("sellBtn");
const adminBtn = document.getElementById("adminBtn");
const paymentDetails = document.getElementById("paymentDetails");
const listings = document.getElementById("listings");
const agreeRisk = document.getElementById("agreeRisk");
const game = document.getElementById("game");
const details = document.getElementById("details");
const price = document.getElementById("price");
const players = document.getElementById("players");
const messages = document.getElementById("messages");
const msgInput = document.getElementById("msgInput");
const payoutMethod = document.getElementById("payoutMethod");
const payoutAddress = document.getElementById("payoutAddress");
const adminUsers = document.getElementById("adminUsers");
const adminOrders = document.getElementById("adminOrders");

const PAYMENTS = {
  skrill: "gamevaultmarket@gmail.com",
  usdt: "0x992d0E36A7409F0c9228B51C6bB8F875b1A4Af3B",
  grey: "212286724510"
};

let currentChat = null;

/* AUTH */
async function signup() {
  try {
    if (await isSystemLocked()) {
      alert("System temporarily locked for security");
      return;
    }
    
   if (password.value.length < 6) {
  alert("Password must be at least 6 characters");
  return;
}
    const r = await auth.createUserWithEmailAndPassword(
      email.value.trim(),
      password.value
    );

    await securityHeartbeat(r.user.uid);

    await db.collection("users").doc(r.user.uid).set({
      email: email.value.trim(),
      role: role.value || "buyer",
      verified: false,
      verificationLocked: false,
      created: new Date()
    });

    const fingerprint = getDeviceFingerprint();

    await db.collection("device_fingerprints").doc(r.user.uid).set({
      fingerprint: fingerprint,
      created: new Date()
    });

    try {
      const res = await fetch("https://api.ipify.org?format=json");
      const ipData = await res.json();

      await db.collection("user_security").doc(r.user.uid).set({
        ip: ipData.ip,
        created: new Date()
      });
    } catch {
      console.log("IP fetch failed");
    }

  } catch (e) {
    alert(e.message);
  }
}
    
function login() {
  const e = email.value.trim();
  const p = password.value;

  if (!e || !p) {
    alert("Enter email and password");
    return;
  }

  auth.signInWithEmailAndPassword(e, p)
    .catch(err => alert(err.message));
}

function logout() {
  auth.signOut()
    .then(() => {
      // Reset UI to login page
      document.getElementById("auth").classList.remove("hidden");
      nav.classList.add("hidden");
      show("auth"); // show login/signup section
    })
    .catch(err => alert(err.message));
}

/* AUTH STATE */
auth.onAuthStateChanged(async user => {
  if (!user) {
  nav.classList.add("hidden");
  show("auth");
  return;
}

  // Hide login/signup section
  document.getElementById("auth").classList.add("hidden");
  nav.classList.remove("hidden");

  // Fetch user data
  const snap = await db.collection("users").doc(user.uid).get();

if (!snap.exists) {
  console.log("User doc missing");
  return;
}

  const data = snap.data() || {};
  await checkDuplicateAccount();
  await detectScamBehavior(user.uid);
  if (data.banned) {
  alert("Account banned: " + (data.bannedReason || "Security violation"));
  await auth.signOut();
  return;
}

const fraudScore = await advancedFraudScan(user.uid);

if (fraudScore >= 120) {
  await shadowBan(user.uid);
}

  // Reset buttons
  sellBtn.classList.add("hidden");
  adminBtn.classList.add("hidden");

  // ===== ADMIN CHECK (FIXED) =====
const role = (data.role || "").toString().toLowerCase().trim();
console.log("ROLE:", role);

if (role === "admin") {
  console.log("ADMIN DETECTED");

  nav.classList.remove("hidden");          // make sure nav is visible
  adminBtn.classList.remove("hidden");     // show admin button

  show("admin");                           // open admin panel
  loadAdmin();                             // load admin data
  return;
}

  // Seller not verified — LOCK the app
if (data.role === "seller" && !data.verified) {
  show("verification");

  // Hide everything else
  nav.classList.add("hidden");

  paymentDetails.innerHTML = `
    Skrill: ${PAYMENTS.skrill}<br>
    USDT: ${PAYMENTS.usdt}<br>
    Grey ACH: ${PAYMENTS.grey}
  `;
  return;
}

  // Seller verified but payout missing
  if (data.role === "seller" && data.verified && !data.payout) {
    show("payout");
    return;
  }

  // Verified seller or buyer
  if (data.role === "seller" && data.verified) sellBtn.classList.remove("hidden");

  // Finally, show risk page
  show("risk");
});

/* UI */
function authSection() {
  document.getElementById("auth").classList.add("hidden");
}

function show(id) {
  document.querySelectorAll("section").forEach(s => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}
function blockIfNotVerified() {
  const user = auth.currentUser;
  if (!user) return;

  db.collection("users").doc(user.uid).get().then(doc => {
    const d = doc.data();
    if (d.role === "seller" && !d.verified) {
      show("verification");
    }
  });
}

/* RISK */
function acceptRisk() {
  blockIfNotVerified();
  if (!agreeRisk.checked) return alert("Accept risk");
  show("home");
  loadListings();
}

/* VERIFICATION */
async function submitVerification() {
  const uid = auth.currentUser.uid;

  const existing = await db.collection("verifications").doc(uid).get();
  if (existing.exists) {
    alert("Verification already submitted");
    return;
  }

  const idFile = document.getElementById("idPhotoFile").files[0];
  const selfieFile = document.getElementById("selfiePhotoFile").files[0];
  const paymentFile = document.getElementById("paymentScreenshotFile").files[0];

  if (!idFile || !selfieFile || !paymentFile) {
    alert("Upload ALL 3 images");
    return;
  }

  if (await isVerificationLocked()) {
  alert("Verification locked. You cannot edit or resubmit.");
  return;
}
  alert("Uploading images...");

  const idUrl = await uploadImage(idFile, "verification");
  const selfieUrl = await uploadImage(selfieFile, "verification");
  const paymentUrl = await uploadImage(paymentFile, "verification");
if (
  basicImageFraudCheck(idUrl) ||
  basicImageFraudCheck(selfieUrl)
) {
  await db.collection("activity_logs").add({
    uid: uid,
    action: "fake_id_detected",
    time: new Date()
  });
}
  if (!idUrl || !selfieUrl || !paymentUrl) {
    alert("Upload failed");
    return;
  }
if (await isSystemLocked()) {
  alert("System temporarily locked for security");
  return;
}
  await db.collection("verifications").doc(uid).set({
    seller: uid,
    idPhotoUrl: idUrl,
    selfiePhotoUrl: selfieUrl,
    paymentScreenshotUrl: paymentUrl,
    status: "pending",
    created: new Date()
  });
await db.collection("users").doc(uid).update({
  verificationLocked: true
});
await db.collection("payment_links").add({
  uid: uid,
  wallet: PAYMENTS.usdt,
  email: PAYMENTS.skrill,
  time: new Date()
});
  alert("Verification submitted — wait for admin approval");

  document.getElementById("idPhotoFile").value = "";
  document.getElementById("selfiePhotoFile").value = "";
  document.getElementById("paymentScreenshotFile").value = "";
}

function basicImageFraudCheck(url) {
  const suspiciousWords = ["fake", "edit", "template", "sample"];
  const lower = url.toLowerCase();
  return suspiciousWords.some(w => lower.includes(w));
}

/* PAYOUT */
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

/* LISTINGS */
function loadListings() {
  db.collection("listings").where("status","==","active")
    .onSnapshot(snap => {
      listings.innerHTML = "";
      snap.forEach(doc => {
        const d = doc.data();
        const playersHTML = d.players?.map(p=>`<span class="tag">${p}</span>`).join(" ") || "";

        listings.innerHTML += `
          <div class="card">
            <b>${d.game}</b> - $${Number(d.price || 0).toFixed(2)}<br>
            ${playersHTML}<br>
            ${d.screenshot ? `<img src="${d.screenshot}" style="max-width:100%">` : ""}
            <br><button onclick="buy('${doc.id}')">Buy</button>
          </div>
        `;
      });
    });
}
async function activeListing(id) {
  try {
    db.collection("listings").doc(id).update({
      status: "active",
      approvedAt: new Date()
    });
    alert("Listing active");
  } catch (e) {
    alert(e.message);
  }
}

/* SELL */
async function createListing() {
  const list = parsePlayers(players.value);
  if (!list) return;
  
  const uDoc = await db.collection("users").doc(auth.currentUser.uid).get();
if (uDoc.data()?.shadowBanned) return;
  const priceNum = parseFloat(price.value);
  if (isNaN(priceNum) || priceNum <= 0) {
    alert("Enter valid price");
    return;
  }
if (!game.value.trim()) {
  alert("Enter game name");
  return;
}
if (await isSystemLocked()) {
  alert("System temporarily locked for security");
  return;
}
  const file = document.getElementById("listingScreenshotFile").files[0];

  let screenshotUrl = null;

  if (file) {
    alert("Uploading screenshot...");
    screenshotUrl = await uploadImage(file, "listings");
    if (!screenshotUrl) {
      alert("Screenshot upload failed");
      return;
    }
  }

  await db.collection("listings").add({
    game: game.value.trim(),
    details: details.value.trim(),
    price: priceNum,
    players: list,
    screenshot: screenshotUrl,
    seller: auth.currentUser.uid,
    status: "active",
    created: new Date()
  })
  .then(() => {
    alert("Listing submitted");
    price.value = "";
    details.value = "";
    players.value = "";
    document.getElementById("listingScreenshotFile").value = "";
  })
  .catch(err => alert(err.message));
}
/* BUY */
async function buy(id) {

  if (await isSystemLocked()) {
    alert("System temporarily locked for security");
    return;
  }

  const uDoc = await db.collection("users").doc(auth.currentUser.uid).get();
  if (uDoc.data()?.shadowBanned) return;

  await db.collection("orders").add({
    listingId: id,
    buyer: auth.currentUser.uid,
    status: "waiting_platform_fee",
    created: new Date()
  });

  alert("Order created");
  openOrders();
}
function loadOrders() {
  const uid = auth.currentUser.uid;

  db.collection("orders")
    .where("buyer", "==", uid)
    .onSnapshot(snap => {
      ordersList.innerHTML = "<h3>My Orders</h3>";

      if (snap.empty) {
        ordersList.innerHTML += "<p>No orders yet</p>";
        return;
      }

      snap.forEach(doc => {
        const o = doc.data();

        ordersList.innerHTML += `
          <div class="card">
            <b>Order ID:</b> ${doc.id}<br>
            Status: ${o.status}<br>
            Created: ${o.created?.toDate().toLocaleString() || ""}<br><br>
            <button onclick="openChat('${doc.id}')">Open Chat</button>
          </div>
        `;
      });
    });
}
function openOrders() {
  blockIfNotVerified();
  show("orders");
  loadOrders();
}

/* CHAT */
function openChat(orderId) {
  currentChat = orderId;
  show("chat");

  db.collection("chats").doc(orderId).collection("messages")
    .orderBy("time")
    .onSnapshot(snap => {
      messages.innerHTML = "";
      snap.forEach(m => messages.innerHTML += `<p>${m.data().text}</p>`);
    });
}

async function sendMessage() {
  if (!currentChat) return;

  const ok = await rateLimit(auth.currentUser.uid, "chat", 5, 10);
  if (!ok) return alert("Slow down (spam protection)");

  const uDoc = await db.collection("users").doc(auth.currentUser.uid).get();
  if (uDoc.data()?.shadowBanned) return;

  await db.collection("chats").doc(currentChat).collection("messages").add({
    sender: auth.currentUser.uid,
    text: msgInput.value,
    time: new Date()
  });

  msgInput.value = "";
}

/* ADMIN */
function loadAdmin() {

  /* ===============================
     SELLER VERIFICATIONS
  ================================ */
db.collection("verifications")
  .where("status", "==", "pending")
  .onSnapshot(snap => {
    adminUsers.innerHTML = "";

    if (snap.empty) {
      adminUsers.innerHTML = "<p>No seller verifications</p>";
      return;
    }

    snap.forEach(doc => {
      const v = doc.data();

      adminUsers.innerHTML += `
        <div class="card">
          <b>Seller UID:</b> ${doc.id}<br><br>
          
<button onclick="banUser('${doc.id}')">🚫 Ban</button>
<button onclick="unbanUser('${doc.id}')">♻ Unban</button>

          <a href="${v.idPhotoUrl}" target="_blank">🪪 View ID</a><br>
<a href="${v.selfiePhotoUrl}" target="_blank">🤳 View Selfie Holding ID</a><br>
<a href="${v.paymentScreenshotUrl}" target="_blank">💳 View Payment Screenshot</a><br><br>

          <b>Status:</b> ${v.status}<br><br>

          ${
            v.status === "approved"
              ? `<span style="color:lightgreen">✔ Approved</span>`
              : `<button onclick="approveSeller('${doc.id}')">Approve Seller</button>`
          }
        </div>
      `;
    });
  });


  /* ===============================
     Active LISTINGS
  ================================ */
  db.collection("listings")
  .onSnapshot(snap => {
    adminOrders.innerHTML = "<h3>All Listings</h3>";

    if (snap.empty) {
      adminOrders.innerHTML += "<p>No listings</p>";
      return;
    }

    snap.forEach(doc => {
      const d = doc.data();

      adminOrders.innerHTML += `
        <div class="card">
          <b>${d.game}</b><br>
          Price: $${d.price}<br>
          Seller: ${d.seller}<br>
          Status: ${d.status}<br><br>

          <button onclick="removeListing('${doc.id}')">
            ❌ Remove Listing
          </button>
        </div>
      `;
    });
  });

}
async function removeListing(id) {
  if (!confirm("Remove this listing from buyers?")) return;

  const docSnap = await db.collection("listings").doc(id).get();
  const data = docSnap.data();

  if (data?.screenshot) {
    await deleteImageFromUrl(data.screenshot);
  }

  await db.collection("listings").doc(id).update({
    status: "removed",
    removedAt: new Date()
  });

  alert("Listing removed");
}
async function approveSeller(uid) {
  try {
    await db.collection("users").doc(uid).update({
      verified: true
    });

    await db.collection("verifications").doc(uid).update({
      status: "approved",
      approvedAt: new Date()
    });

    alert("Seller verified successfully");
  } catch (err) {
    alert("Error verifying seller: " + err.message);
  }
}

async function deleteImageFromUrl(url) {
  try {
    const parts = url.split("/object/public/images/");
    if (parts.length < 2) return;

    const path = parts[1];
    await supabaseClient.storage.from("images").remove([path]);
  } catch (e) {
    console.log("Delete failed", e);
  }
}

/* HELPERS */
function parsePlayers(text) {
  const arr = text.split(",").map(p=>p.trim()).filter(Boolean);
  if (arr.length > 12) {
    alert("Max 12 players");
    return null;
  }
  return arr;
}

async function isSystemLocked() {
  try {
    const doc = await db.collection("system").doc("lockdown").get();
    return doc.exists && doc.data()?.active === true;
  } catch {
    return false;
  }
}
function isValidImageLink(url) {
  if (!url) return false;

  // Must start with http or https
  if (!url.startsWith("http://") && !url.startsWith("https://")) return false;

  // Must look like image link
  const validExtensions = [".jpg", ".jpeg", ".png", ".webp"];
  const lower = url.toLowerCase();
  if (!validExtensions.some(ext => lower.includes(ext))) return false;

  // Block common fake sites
  const blocked = ["google.com", "facebook.com", "instagram.com"];
  if (blocked.some(site => lower.includes(site))) return false;

  return true;
}

/* ================= IMAGE UPLOAD ================= */
async function uploadImage(file, folder="images") {
  if (!file.type.startsWith("image/")) {
    alert("Only real images allowed");
    return null;
  }
  
  const uDoc = await db.collection("users").doc(auth.currentUser.uid).get();
if (uDoc.data()?.shadowBanned) return null;

  if (file.size > 5 * 1024 * 1024) {
    alert("Max 5MB");
    return null;
  }
  
  if (file.size < 1000) {
  alert("Invalid image");
  return null;
}
  if (await isSystemLocked()) {
  alert("System temporarily locked for security");
  return null;
}

  const user = auth.currentUser;
  if (!user) return null;

  const allowed = await rateLimit(auth.currentUser.uid, "upload", 5, 60);
if (!allowed) {
  alert("Upload limit reached. Try later.");
  return null;
}
await db.collection("upload_logs").add({
  uid: user.uid,
  size: file.size,
  time: new Date()
});
  // Add watermark
  const img = new Image();
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const reader = new FileReader();

  return new Promise(resolve => {
    reader.onload = e => {
      img.onload = async () => {
        const MAX = 1600;
let w = img.width;
let h = img.height;

if (w > MAX || h > MAX) {
  const scale = Math.min(MAX / w, MAX / h);
  w *= scale;
  h *= scale;
}

canvas.width = w;
canvas.height = h;
ctx.drawImage(img, 0, 0, w, h);

        ctx.font = "20px Arial";
        ctx.fillStyle = "rgba(255,0,0,0.6)";
        ctx.fillText("GameVaultMarket • " + user.uid, 20, canvas.height - 20);

        canvas.toBlob(async blob => {
          const ext = "jpg";
          const path = `${folder}/${user.uid}_${Date.now()}.${ext}`;

          const { error } = await supabaseClient.storage
            .from("images")
            .upload(path, blob);

          if (error) {
            alert(error.message);
            resolve(null);
            return;
          }

          const { data } = supabaseClient.storage
            .from("images")
            .getPublicUrl(path);

          resolve(data.publicUrl);
        }, "image/jpeg", 0.9);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function isVerificationLocked() {
  const uid = auth.currentUser.uid;
  const doc = await db.collection("users").doc(uid).get();
  return doc.data()?.verificationLocked === true;
}

async function rejectSeller(uid) {
  const vDoc = await db.collection("verifications").doc(uid).get();
  const v = vDoc.data();

  if (v?.idPhotoUrl) await deleteImageFromUrl(v.idPhotoUrl);
  if (v?.selfiePhotoUrl) await deleteImageFromUrl(v.selfiePhotoUrl);
  if (v?.paymentScreenshotUrl) await deleteImageFromUrl(v.paymentScreenshotUrl);

  await db.collection("verifications").doc(uid).update({
    status: "rejected",
    rejectedAt: new Date()
  });

  await db.collection("users").doc(uid).update({
    verificationLocked: false
  });

  alert("Seller rejected + images deleted");
}
async function checkDuplicateAccount() {
  const uid = auth.currentUser.uid;

  const mySec = await db.collection("user_security").doc(uid).get();
if (!mySec.exists) return;

const myIP = mySec.data().ip;

  if (!myIP) return;

  const snap = await db.collection("user_security")
    .where("ip", "==", myIP)
    .get();

  const myFP = getDeviceFingerprint();

const fpSnap = await db.collection("device_fingerprints")
  .where("fingerprint", "==", myFP)
  .get();

if (fpSnap.size > 2) {
  await db.collection("activity_logs").add({
    uid: uid,
    action: "multiple_devices",
    time: new Date()
  });
  logout();
}

  if (snap.size > 2) {
    await db.collection("activity_logs").add({
  uid: uid,
  action: "multiple_accounts",
  time: new Date()
});
    alert("Multiple accounts detected. Contact admin.");
    logout();
  }
}
async function detectScamBehavior(uid) {
  const logs = await db.collection("activity_logs")
    .where("uid", "==", uid)
    .orderBy("time", "desc")
    .limit(10)
    .get();

  let risk = 0;

  logs.forEach(doc => {
    const a = doc.data().action;

    if (a === "failed_payment") risk += 30;
    if (a === "fake_proof") risk += 40;
    if (a === "multiple_accounts") risk += 50;
    if (a === "chargeback") risk += 60;
  });
    if (risk >= 60 && risk < 80) {
  const orders = await db.collection("orders")
    .where("buyer", "==", uid)
    .where("status", "!=", "completed")
    .get();

  orders.forEach(doc => freezeOrder(doc.id, "High risk user"));
}
  if (risk >= 80) {
    await db.collection("users").doc(uid).update({
      banned: true,
      bannedReason: "Fraud detected",
      bannedAt: new Date()
    });

    alert("Account banned for suspicious activity");
  }
}
async function updateRiskScore(uid, score) {
  await db.collection("fraud_scores").doc(uid).set({
    score: score,
    updated: new Date()
  }, { merge: true });
}
async function checkPaymentProof(hash) {
  const snap = await db.collection("payment_hashes")
    .where("hash", "==", hash)
    .get();

  if (!snap.empty) {
    return false; // already used (fraud)
  }

  return true;
}
async function freezeOrder(orderId, reason="Suspicious activity") {
  await db.collection("orders").doc(orderId).update({
    frozen: true,
    freezeReason: reason,
    frozenAt: new Date()
  });
}

function getDeviceFingerprint() {
  return btoa(
    navigator.userAgent +
    (window.screen?.width || 0) +
    (window.screen?.height || 0) +
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
}

async function banUser(uid, reason="Violation") {
  await db.collection("users").doc(uid).update({
    banned: true,
    bannedReason: reason,
    bannedAt: new Date()
  });
}

async function unbanUser(uid) {
  await db.collection("users").doc(uid).update({
    banned: false,
    bannedReason: null
  });
}

async function rateLimit(uid, action, limit=10, seconds=60) {
  const now = Date.now();
  const ref = db.collection("rate_limits").doc(uid + "_" + action);
  const docSnap = await ref.get();

  if (!docSnap.exists) {
    await ref.set({ count: 1, time: now });
    return true;
  }

  const data = docSnap.data();

  if (now - data.time > seconds * 1000) {
    await ref.set({ count: 1, time: now });
    return true;
  }

  if (data.count >= limit) return false;

  await ref.update({ count: data.count + 1 });
  return true;
}

async function advancedFraudScan(uid) {
  const logs = await db.collection("activity_logs")
    .where("uid", "==", uid)
    .orderBy("time", "desc")
    .limit(20)
    .get();

  let score = 0;

  logs.forEach(doc => {
    const a = doc.data().action;

    if (a === "fake_proof") score += 40;
    if (a === "multiple_accounts") score += 50;
    if (a === "multiple_devices") score += 40;
    if (a === "failed_payment") score += 20;
    if (a === "chargeback") score += 60;
    if (a === "fake_id_detected") score += 50;
  });
  await systemLockdownCheck();
  await db.collection("fraud_scores").doc(uid).set({
    score: score,
    updated: new Date()
  }, { merge: true });
  await detectFraudNetwork(uid);
  return score;
}

async function shadowBan(uid) {
  await db.collection("users").doc(uid).update({
    shadowBanned: true,
    shadowBanAt: new Date()
  });
}

async function systemLockdownCheck() {
  const recent = await db.collection("activity_logs")
    .where("action", "in", ["fake_proof", "multiple_accounts"])
    .get();

  if (recent.size > 50) {
    await db.collection("system").doc("lockdown").set({
      active: true,
      time: new Date()
    });
  }
}
function fraudColor(score) {
  if (score >= 120) return "red";
  if (score >= 80) return "orange";
  if (score >= 40) return "yellow";
  return "lightgreen";
}
async function securityHeartbeat(uid) {
  await db.collection("security_heartbeat").doc(uid).set({
    lastSeen: new Date(),
    online: true
  }, { merge: true });
}

async function detectFraudNetwork(uid) {
  const my = await db.collection("payment_links")
    .where("uid", "==", uid)
    .limit(1)
    .get();

  if (my.empty) return;

  const d = my.docs[0].data();

  const network = await db.collection("payment_links")
    .where("wallet", "==", d.wallet)
    .get();

  if (network.size > 5) {
    await db.collection("activity_logs").add({
      uid: uid,
      action: "fraud_network_detected",
      time: new Date()
    });
  }
}