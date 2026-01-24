const firebaseConfig = {
  apiKey: "AIzaSyBfGXL6lKmBTZ9FIxsmsP_-40_-MZ33zBw",
  authDomain: "gamevaultmarket-5e494.firebaseapp.com",
  projectId: "gamevaultmarket-5e494"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

/* ELEMENTS */
const authDiv = auth;
const nav = document.getElementById("nav");
const listingsDiv = document.getElementById("listings");
const adminListings = document.getElementById("adminListings");
const adminUsers = document.getElementById("adminUsers");
const adminEscrows = document.getElementById("adminEscrows");
const sellBtn = document.getElementById("sellBtn");
const adminBtn = document.getElementById("adminBtn");

const sections = ["home","sell","admin","chat"];

function show(id){
  sections.forEach(s=>document.getElementById(s).classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

/* AUTH */
function signup(){
  auth.createUserWithEmailAndPassword(email.value,password.value)
  .then(c=>{
    return db.collection("users").doc(c.user.uid).set({
      email: email.value,
      role: role.value,
      status: "active",
      verified: false,
      created: new Date()
    });
  })
  .catch(e=>alert(e.message));
}

function login(){
  auth.signInWithEmailAndPassword(email.value,password.value)
  .catch(e=>alert(e.message));
}

function logout(){ auth.signOut(); }

/* SELL */
function postListing(){
  db.collection("users").doc(auth.currentUser.uid).get().then(u=>{
    if(!u.data().verified) return alert("Seller not verified");
    db.collection("listings").add({
      game: game.value,
      details: details.value,
      price: price.value,
      owner: auth.currentUser.uid,
      status: "pending",
      created: new Date()
    });
    alert("Submitted");
  });
}

/* ESCROW */
function startEscrow(listingId, sellerId, amount){
  db.collection("escrows").add({
    listingId,
    buyer: auth.currentUser.uid,
    seller: sellerId,
    amount,
    status: "holding",
    created: new Date()
  });
  alert("Payment held in escrow (demo)");
}

/* CHAT */
function openChat(id){
  window.chatId=id;
  show("chat");
  db.collection("chats").doc(id).collection("messages")
  .orderBy("created")
  .onSnapshot(s=>{
    chatBox.innerHTML="";
    s.forEach(m=>{
      chatBox.innerHTML+=`<div class="chat-msg">${m.data().text}</div>`;
    });
  });
}

function sendMsg(){
  db.collection("chats").doc(chatId).collection("messages").add({
    text: chatMsg.value,
    created: new Date()
  });
  chatMsg.value="";
}

/* ADMIN */
function openAdmin(){
  show("admin");

  db.collection("listings").where("status","==","pending")
  .onSnapshot(s=>{
    adminListings.innerHTML="";
    s.forEach(doc=>{
      const d=doc.data();
      adminListings.innerHTML+=`
      <div class="card">
        ${d.game} - GHS ${d.price}
        <button onclick="approveListing('${doc.id}')">Approve</button>
      </div>`;
    });
  });

  db.collection("escrows").onSnapshot(s=>{
    adminEscrows.innerHTML="";
    s.forEach(doc=>{
      const e=doc.data();
      adminEscrows.innerHTML+=`
      <div class="card">
        GHS ${e.amount} - <span class="badge holding">ESCROW</span>
        <button onclick="releaseEscrow('${doc.id}')">Release</button>
      </div>`;
    });
  });

  db.collection("users").onSnapshot(s=>{
    adminUsers.innerHTML="";
    s.forEach(doc=>{
      const u=doc.data();
      adminUsers.innerHTML+=`
      <div class="card">
        ${u.email} (${u.role})
        <button onclick="verifyUser('${doc.id}')">Verify</button>
        <button onclick="banUser('${doc.id}')">Ban</button>
      </div>`;
    });
  });
}

function approveListing(id){
  db.collection("listings").doc(id).update({status:"approved"});
}
function releaseEscrow(id){
  db.collection("escrows").doc(id).update({status:"completed"});
}
function verifyUser(id){
  db.collection("users").doc(id).update({verified:true});
}
function banUser(id){
  db.collection("users").doc(id).update({status:"banned"});
}