// FIREBASE
firebase.initializeApp({
  apiKey: "YOUR_KEY",
  authDomain: "gamevaultmarket-5e494.firebaseapp.com",
  projectId: "gamevaultmarket-5e494",
  storageBucket: "gamevaultmarket-5e494.appspot.com"
});

const auth = firebase.auth();
const db = firebase.firestore();

let currentOrder = null;

// AUTH
function signup() {
  auth.createUserWithEmailAndPassword(email.value, password.value)
    .then(r => db.collection("users").doc(r.user.uid).set({
      role: role.value,
      verified:false,
      created:new Date()
    }));
}

function login() {
  auth.signInWithEmailAndPassword(email.value, password.value);
}

function logout() { auth.signOut(); }

auth.onAuthStateChanged(u => {
  if (!u) return;
  auth.style.display="none";
  nav.classList.remove("hidden");
  show("risk");
});

// NAV
function show(id) {
  document.querySelectorAll("section").forEach(s=>s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

// RISK
function acceptRisk() { show("home"); loadListings(); }

// LISTINGS
function loadListings() {
  db.collection("listings").where("status","==","approved")
  .onSnapshot(s=>{
    listings.innerHTML="";
    s.forEach(d=>{
      listings.innerHTML+=`
        <div class="card">
          <b>${d.data().game}</b> - $${d.data().price}
          <button onclick="buy('${d.id}')">Buy</button>
        </div>`;
    });
  });
}

// BUY FLOW
function buy(listingId) {
  db.collection("orders").add({
    listingId,
    buyer: auth.currentUser.uid,
    status:"waiting_platform_fee",
    created:new Date()
  });
  alert("Pay platform fee first. Chat locked.");
}

// CHAT
function openChat(orderId) {
  currentOrder = orderId;
  show("chat");
  db.collection("chats").doc(orderId).collection("messages")
    .orderBy("time")
    .onSnapshot(s=>{
      messages.innerHTML="";
      s.forEach(m=>{
        messages.innerHTML+=`<p>${m.data().text}</p>`;
      });
    });
}

function sendMessage() {
  if (!currentOrder) return;
  db.collection("chats").doc(currentOrder)
    .collection("messages").add({
      text: msgInput.value,
      sender: auth.currentUser.uid,
      time:new Date()
    });
  msgInput.value="";
}