/* FIREBASE CONFIG */
firebase.initializeApp({
  apiKey: "AIzaSyBfGXL6lKmBTZ9FIxsmsP_-40_-MZ33zBw",
  authDomain: "gamevaultmarket-5e494.firebaseapp.com",
  projectId: "gamevaultmarket-5e494"
});

const auth = firebase.auth();
const db = firebase.firestore();

/* UI */
const nav = document.getElementById("nav");
const sellBtn = document.getElementById("sellBtn");
const adminBtn = document.getElementById("adminBtn");
const adminUsers = document.getElementById("adminUsers");

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const roleSelect = document.getElementById("role");

/* NAVIGATION */
function show(id){
document.querySelectorAll("section").forEach(s=>s.classList.add("hidden"));
document.getElementById(id).classList.remove("hidden");
}

/* SIGNUP */
async function signup(){
const email=emailInput.value.trim();
const pass=passwordInput.value;
const role=roleSelect.value;

if(pass.length<6) return alert("Password too short");

const user=await auth.createUserWithEmailAndPassword(email,pass);

await db.collection("users").doc(user.user.uid).set({
email:email,
role:role,
verified:false,
banned:false,
created:Date.now()
});

alert("Account created");
}

/* LOGIN */
async function login(){
const email=emailInput.value.trim();
const pass=passwordInput.value;
await auth.signInWithEmailAndPassword(email,pass);
}

/* LOGOUT */
function logout(){
auth.signOut();
}

/* AUTH STATE */
auth.onAuthStateChanged(async user=>{
if(!user){
nav.classList.add("hidden");
show("auth");
return;
}

nav.classList.remove("hidden");
document.getElementById("auth").classList.add("hidden");

const doc=await db.collection("users").doc(user.uid).get();
const data=doc.data();

sellBtn.classList.add("hidden");
adminBtn.classList.add("hidden");

/* ADMIN */
if(data.role==="admin"){
adminBtn.classList.remove("hidden");
show("admin");
loadAdmin();
return;
}

/* SELLER */
if(data.role==="seller" && !data.verified){
show("verify");
return;
}

if(data.role==="seller" && data.verified){
sellBtn.classList.remove("hidden");
}

/* NORMAL */
show("home");
});

/* ADMIN LOAD */
function loadAdmin(){
db.collection("users").onSnapshot(snap=>{
adminUsers.innerHTML="";
snap.forEach(doc=>{
const u=doc.data();
adminUsers.innerHTML+=`
<div style="background:#1b1f2a;padding:10px;margin:10px 0">
<b>${u.email}</b><br>
Role: ${u.role}<br>
Verified: ${u.verified}
</div>`;
});
});
}