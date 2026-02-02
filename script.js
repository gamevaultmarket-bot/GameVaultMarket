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

let currentChat = null;

/* AUTH */
function signup() {
  auth.createUserWithEmailAndPassword(email.value, password.value)
    .then(r => db.collection("users").doc(r.user.uid).set({
      email: email.value,
      role: role.value,
      verified: false,
      created: new Date()
    }))
    .catch(e => alert(e.message));
}

function login() {
  auth.signInWithEmailAndPassword(email.value, password.value)
    .catch(e => alert(e.message));
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
  if (!user) return;

  // Hide login/signup section
  document.getElementById("auth").classList.add("hidden");
  nav.classList.remove("hidden");

  // Fetch user data
  const snap = await db.collection("users").doc(user.uid).get();
  if (!snap.exists) return;

  const data = snap.data();

  // Reset buttons
  sellBtn.classList.add("hidden");
  adminBtn.classList.add("hidden");

  // Admin
  if (data.role === "admin") {
    adminBtn.classList.remove("hidden");
    show("admin");
    loadAdmin();
    return;
  }

  // Seller not verified
  if (data.role === "seller" && !data.verified) {
    show("verification");
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

/* RISK */
function acceptRisk() {
  if (!agreeRisk.checked) return alert("Accept risk");
  show("home");
  loadListings();
}

/* VERIFICATION */
async function submitVerification() {
  const idUrl = idPhotoUrl.value.trim();
  const selfieUrl = selfiePhotoUrl.value.trim();

  if (!idUrl || !selfieUrl) {
    alert("Please provide both ID and Selfie image links");
    return;
  }

  const uid = auth.currentUser.uid;

  await db.collection("verifications").doc(uid).set({
    seller: uid,
    idPhotoUrl: idUrl,
    selfiePhotoUrl: selfieUrl,
    status: "pending",
    created: new Date()
  });

  alert("Verification submitted. Await admin approval.");
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
  db.collection("listings").where("status","==","approved")
    .onSnapshot(snap => {
      listings.innerHTML = "";
      snap.forEach(doc => {
        const d = doc.data();
        const players = d.players?.map(p=>`<span class="tag">${p}</span>`).join(" ") || "";

        listings.innerHTML += `
          <div class="card">
            <b>${d.game}</b> - $${d.price}<br>
            ${players}<br>
            ${d.screenshot ? `<img src="${d.screenshot}" style="max-width:100%">` : ""}
            <br><button onclick="buy('${doc.id}')">Buy</button>
          </div>
        `;
      });
    });
}

/* SELL */
function createListing() {
  const list = parsePlayers(players.value);
  if (!list) return;

  db.collection("listings").add({
    game: game.value,
    details: details.value,
    price: Number(price.value),
    players: list,
    screenshot: screenshotUrl.value || null,
    seller: auth.currentUser.uid,
    status: "pending",
    created: new Date()
  });

  alert("Listing submitted");
}

/* BUY */
function buy(id) {
  db.collection("orders").add({
    listingId: id,
    buyer: auth.currentUser.uid,
    status: "waiting_platform_fee",
    created: new Date()
  });
  alert("Order created");
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

function sendMessage() {
  if (!currentChat) return;
  db.collection("chats").doc(currentChat).collection("messages").add({
    sender: auth.currentUser.uid,
    text: msgInput.value,
    time: new Date()
  });
  msgInput.value = "";
}

/* ADMIN */
function loadAdmin() {
  db.collection("verifications").onSnapshot(snap => {
    adminUsers.innerHTML = "";

    snap.forEach(doc => {
      const v = doc.data();

      adminUsers.innerHTML += `
        <div class="card">
          <b>Seller UID:</b> ${doc.id}<br><br>

          <a href="${v.idPhotoUrl}" target="_blank">🪪 View ID Photo</a><br>
          <a href="${v.selfiePhotoUrl}" target="_blank">🤳 View Selfie</a><br><br>

          Status: ${v.status}<br><br>

          <button onclick="approveSeller('${doc.id}')">Approve Seller</button>
        </div>
      `;
    });
  });
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

/* HELPERS */
function parsePlayers(text) {
  const arr = text.split(",").map(p=>p.trim()).filter(Boolean);
  if (arr.length > 12) {
    alert("Max 12 players");
    return null;
  }
  return arr;
}