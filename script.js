const firebaseConfig = {
  apiKey: "AIzaSyBfGXL6lKmBTZ9FIxsmsP_-40_-MZ33zBw",
  authDomain: "gamevaultmarket-5e494.firebaseapp.com",
  projectId: "gamevaultmarket-5e494",
  storageBucket: "gamevaultmarket-5e494.appspot.com",
  messagingSenderId: "399928480303",
  appId: "1:399928480303:web:3640856906c7cb9eb4acda"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const authDiv = document.getElementById("auth");
const nav = document.getElementById("nav");
const listingsDiv = document.getElementById("listings");
const adminListings = document.getElementById("adminListings");
const adminUsers = document.getElementById("adminUsers");
const sections = ["home","sell","admin","chat"];

// --- NAV ---
function show(id){
  sections.forEach(s=>document.getElementById(s).classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

// --- AUTH ---
function signup(){
  auth.createUserWithEmailAndPassword(email.value,password.value)
  .then(c=>db.collection("users").doc(c.user.uid).set({
    email:email.value,
    role:role.value,
    status:"active",
    verified:false,
    created:new Date()
  }))
  .catch(e=>alert(e.message));
}

function login(){
  auth.signInWithEmailAndPassword(email.value,password.value)
  .catch(e=>alert(e.message));
}

function logout(){ auth.signOut(); }

// --- POST LISTING ---
function postListing(){
  db.collection("users").doc(auth.currentUser.uid).get().then(u=>{
    const user = u.data();
    if(user.status==="banned"){ alert("Banned user."); auth.signOut(); return; }
    if(user.role==="seller" && !user.verified){ alert("Must be verified to post."); return; }
    
    db.collection("listings").add({
      game:game.value,
      details:details.value,
      price:price.value,
      owner:auth.currentUser.uid,
      email:auth.currentUser.email,
      status:"pending",
      created:new Date()
    }).then(()=>{
      alert("Submitted for admin approval");
      game.value=details.value=price.value="";
    });
  });
}

// --- AUTH STATE & LISTINGS ---
auth.onAuthStateChanged(user=>{
  if(!user){ authDiv.classList.remove("hidden"); nav.classList.add("hidden"); return; }
  authDiv.classList.add("hidden"); nav.classList.remove("hidden"); show("home");

  db.collection("users").doc(user.uid).get().then(d=>{
    const r=d.data().role;
    if(r==="seller") sellBtn.classList.remove("hidden");
    if(r==="admin") adminBtn.classList.remove("hidden");
  });

  db.collection("listings").where("status","==","approved")
  .onSnapshot(s=>{
    listingsDiv.innerHTML="";
    s.forEach(doc=>{
      const d=doc.data();
      listingsDiv.innerHTML+=`
      <div class="card">
        <b>${d.game}</b><br>
        ${d.details}<br>
        <b>GHS ${d.price}</b><br>
        <button onclick="openChat('${doc.id}')">Chat</button>
        <button onclick="report('${doc.id}','${d.owner}')">Report</button>
      </div>`;
    });
  });
});

// --- CHAT ---
function openChat(id){
  window.chatId=id;
  show("chat");
  db.collection("chats").doc(id).collection("messages")
  .orderBy("created")
  .onSnapshot(s=>{
    chatBox.innerHTML="";
    s.forEach(m=>{
      chatBox.innerHTML+=`<div class="card">${m.data().text}</div>`;
    });
  });
}

function sendMsg(){
  db.collection("users").doc(auth.currentUser.uid).get().then(u=>{
    if(u.data().status==="banned"){ alert("Banned user."); auth.signOut(); return; }
    db.collection("chats").doc(chatId).collection("messages").add({
      text:chatMsg.value,
      created:new Date()
    });
    chatMsg.value="";
  });
}

// --- REPORT ---
function report(listing,user){
  const r=prompt("Reason?");
  if(!r) return;
  db.collection("reports").add({listing,user,reason:r,created:new Date()});
  alert("Reported");
}

// --- ADMIN DASHBOARD ---
function renderAdminListings(){
  adminListings.innerHTML="";
  db.collection("listings").where("status","==","pending").get().then(snap=>{
    snap.forEach(doc=>{
      const d=doc.data();
      adminListings.innerHTML+=`<div class="card">
        ${d.game} - GHS ${d.price} - ${d.email} 
        <button onclick="approveListing('${doc.id}')">Approve</button>
        <button onclick="rejectListing('${doc.id}')">Reject</button>
      </div>`;
    });
  });
}

function approveListing(id){ db.collection("listings").doc(id).update({status:"approved"}); renderAdminListings(); }
function rejectListing(id){ db.collection("listings").doc(id).delete(); renderAdminListings(); }

// --- ADMIN USERS ---
function renderAdminUsers(){
  adminUsers.innerHTML="";
  db.collection("users").get().then(snap=>{
    snap.forEach(doc=>{
      const u = doc.data();
      adminUsers.innerHTML+=`<div class="card">
        ${u.email} - ${u.role} - Status: ${u.status} - Verified: ${u.verified}
        <button onclick="verifyUser('${doc.id}')">Verify</button>
        <button onclick="banUser('${doc.id}')">Ban</button>
        <button onclick="unbanUser('${doc.id}')">Unban</button>
        <button onclick="deleteUser('${doc.id}')">Delete</button>
      </div>`;
    });
  });
}

function verifyUser(uid){ db.collection("users").doc(uid).update({verified:true}); renderAdminUsers(); }
function banUser(uid){ db.collection("users").doc(uid).update({status:"banned"}); renderAdminUsers(); }
function unbanUser(uid){ db.collection("users").doc(uid).update({status:"active"}); renderAdminUsers(); }
function deleteUser(uid){
  if(confirm("Delete user and all their listings?")){
    db.collection("users").doc(uid).delete();
    db.collection("listings").where("owner","==",uid).get().then(snap=>snap.forEach(d=>d.ref.delete()));
    renderAdminUsers();
  }
}

// --- ADMIN DASHBOARD OPEN ---
adminBtn.onclick = () => { show("admin"); renderAdminListings(); renderAdminUsers(); };

// Auto refresh admin dashboard every 5 sec
setInterval(()=>{
  if(!adminBtn.classList.contains("hidden") && document.getElementById("admin").classList.contains("hidden")===false){
    renderAdminListings();
    renderAdminUsers();
  }
},5000);