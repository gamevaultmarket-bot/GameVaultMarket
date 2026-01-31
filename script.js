// FIREBASE
firebase.initializeApp({
  apiKey: "AIzaSyBfGXL6lKmBTZ9FIxsmsP_-40_-MZ33zBw",
  authDomain: "gamevaultmarket-5e494.firebaseapp.com",
  projectId: "gamevaultmarket-5e494",
  storageBucket: "gamevaultmarket-5e494.appspot.com"
});

const firebaseAuth = firebase.auth();
const db = firebase.firestore();

let currentOrder = null;

// AUTH
function signup() {
  firebaseAuth.createUserWithEmailAndPassword(email.value, password.value)
    .then(r => {
      return db.collection("users").doc(r.user.uid).set({
        role: role.value,
        verified: false,
        created: new Date()
      });
    })
    .catch(err => alert(err.message));
}

function login() {
  firebaseAuth.signInWithEmailAndPassword(email.value, password.value)
    .catch(err => alert(err.message));
}

function logout() {
  firebaseAuth.signOut();
}

// SINGLE AUTH LISTENER (ONLY ONE)
firebaseAuth.onAuthStateChanged(user => {
  if (!user) return;

  document.getElementById("auth").classList.add("hidden");
  document.getElementById("nav").classList.remove("hidden");

  show("risk");
});

// NAV
function show(id) {
  document.querySelectorAll("section").forEach(s => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

// RISK
function acceptRisk() {
  show("home");
  loadListings();
}

// BUY FLOW
function buy(listingId) {
  db.collection("orders").add({
    listingId,
    buyer: firebaseAuth.currentUser.uid,
    status: "waiting_platform_fee",
    created: new Date()
  });

  alert("Pay platform fee first. Chat locked.");
}

// CHAT
function openChat(orderId) {
  currentOrder = orderId;
  show("chat");

  db.collection("chats").doc(orderId)
    .collection("messages")
    .orderBy("time")
    .onSnapshot(s => {
      messages.innerHTML = "";
      s.forEach(m => {
        messages.innerHTML += `<p>${m.data().text}</p>`;
      });
    });
}

function sendMessage() {
  if (!currentOrder) return;

  db.collection("chats").doc(currentOrder)
    .collection("messages").add({
      text: msgInput.value,
      sender: firebaseAuth.currentUser.uid,
      time: new Date()
    });

  msgInput.value = "";
}