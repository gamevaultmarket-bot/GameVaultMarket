const SUPABASE_URL = "https://pmgmbpwscyrsyrgyqsyy.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtZ21icHdzY3lyc3lyZ3lxc3l5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MjAxMTQsImV4cCI6MjA4NTk5NjExNH0.PKF5Rc9LRZLKO7FuALPdSF4kiourN5NgZP6IUgk1BJ0";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const authBox = document.getElementById("authBox");
const appBox = document.getElementById("app");
const msg = document.getElementById("authMsg");

async function signup() {
  const email = emailInput();
  const password = passInput();

  const { data, error } = await db.auth.signUp({ email, password });

  if (error) return msg.innerText = error.message;

  msg.innerText = "Signup success. Now login.";
}

async function login() {
  const email = emailInput();
  const password = passInput();

  const { data, error } = await db.auth.signInWithPassword({ email, password });

  if (error) return msg.innerText = error.message;

  checkUser();
}

async function logout() {
  await db.auth.signOut();
  location.reload();
}

function emailInput() {
  return document.getElementById("email").value.trim();
}

function passInput() {
  return document.getElementById("password").value.trim();
}

async function checkUser() {
  const { data } = await db.auth.getUser();
  if (!data.user) return;

  authBox.classList.add("hidden");
  appBox.classList.remove("hidden");

  const { data: userData } = await db
    .from("users")
    .select("*")
    .eq("id", data.user.id)
    .single();

  if (!userData) {
    await db.from("users").insert({
      id: data.user.id,
      email: data.user.email
    });
  }

  loadRole();
}

async function loadRole() {
  const { data } = await db.auth.getUser();
  const uid = data.user.id;

  const { data: user } = await db
    .from("users")
    .select("*")
    .eq("id", uid)
    .single();

  if (!user) return;

  if (user.role === "admin") {
    document.getElementById("adminBtn").classList.remove("hidden");
  }

  if (user.role === "seller" && user.verified) {
    document.getElementById("sellBtn").classList.remove("hidden");
  } else {
    document.getElementById("verifyBtn").classList.remove("hidden");
  }
}

function showPage(id) {
  document.querySelectorAll(".page").forEach(p => p.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

checkUser();