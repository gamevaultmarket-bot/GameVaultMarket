firebase.initializeApp({
  apiKey: "AIzaSyBfGXL6lKmBTZ9FIxsmsP_-40_-MZ33zBw",
  authDomain: "gamevaultmarket-5e494.firebaseapp.com",
  projectId: "gamevaultmarket-5e494",
  storageBucket: "gamevaultmarket-5e494.appspot.com"
});

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

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
  auth.signOut();
}

/* AUTH STATE */
auth.onAuthStateChanged(async user => {
  if (!user) return;

  document.getElementById("auth").classList.add("hidden");
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
    paymentDetails.innerHTML = `
      Skrill: ${PAYMENTS.skrill}<br>
      USDT: ${PAYMENTS.usdt}<br>
      Grey ACH: ${PAYMENTS.grey}
    `;
    return;
  }

  if (data.role === "seller" && data.verified) {
    if (!data.payout) {
      show("payout");
      return;
    }
    sellBtn.classList.remove("hidden");
  }

  show("risk");
});

/* UI */
function show(id) {
  document.querySelectorAll("section").forEach(s => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

/* RISK */
function acceptRisk() {
  if (!agreeRisk.checked) return alert("Accept risk first");
  show("home");
  loadListings();
}

/* VERIFICATION */
async function submitVerification() {
  const uid = auth.currentUser.uid;
  await db.collection("verifications").doc(uid).set({
    status: "pending",
    created: new Date()
  });
  alert("Verification submitted");
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
      snap.forEach(d => {
        listings.innerHTML += `
          <div class="card">
            <b>${d.data().game}</b> - $${d.data().price}
            <button onclick="buy('${d.id}')">Buy</button>
          </div>
        `;
      });
    });
}

/* SELL */
function createListing() {
  db.collection("listings").add({
    game: game.value,
    details: details.value,
    price: price.value,
    seller: auth.currentUser.uid,
    status: "approved",
    created: new Date()
  });
  alert("Listing created");
}

/* BUY */
function buy(listingId) {
  db.collection("orders").add({
    listingId,
    buyer: auth.currentUser.uid,
    status: "waiting_platform_fee",
    created: new Date()
  });
  alert("Order created. Pay platform fee to unlock chat.");
}

/* CHAT */
function openChat(orderId) {
  currentChat = orderId;
  show("chat");
  db.collection("chats").doc(orderId).collection("messages")
    .orderBy("time")
    .onSnapshot(s => {
      messages.innerHTML = "";
      s.forEach(m => messages.innerHTML += `<p>${m.data().text}</p>`);
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
      adminUsers.innerHTML += `
        <div class="card">
          Seller: ${doc.id}
          <button onclick="approveSeller('${doc.id}')">Approve</button>
        </div>
      `;
    });
  });

  db.collection("orders").onSnapshot(snap => {
    adminOrders.innerHTML = "";
    snap.forEach(doc => {
      adminOrders.innerHTML += `
        <div class="card">
          Order: ${doc.id} | ${doc.data().status}
        </div>
      `;
    });
  });
}

function approveSeller(uid) {
  db.collection("users").doc(uid).update({ verified: true });
  db.collection("verifications").doc(uid).update({ status: "approved" });
  alert("Seller verified");
}