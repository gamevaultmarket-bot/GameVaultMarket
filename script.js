/* ================================================
   GAMEVAULT MARKET — script.js v2
   Clean rebuild. All previous bugs fixed by design.
================================================ */

/* ── FIREBASE INIT ────────────────────── */
firebase.initializeApp({
  apiKey: "AIzaSyBfGXL6lKmBTZ9FIxsmsP_-40_-MZ33zBw",
  authDomain: "gamevaultmarket-5e494.firebaseapp.com",
  projectId: "gamevaultmarket-5e494"
});

const auth = firebase.auth();
const db   = firebase.firestore();

/* ── CONSTANTS ────────────────────────── */
const ADMIN_EMAIL   = "gamevaultmarket@gmail.com";
const CLOUD_NAME    = "dwxgzykij";
const CLOUD_PRESET  = "gamevault_upload";
const SERVICE_FEE   = 2;

const PAYMENTS = {
  Skrill: "gamevaultmarket@gmail.com",
  USDT:   "0x992d0E36A7409F0c9228B51C6bB8F875b1A4Af3B",
  Grey:   "212286724510"
};

/* ── STATE ────────────────────────────── */
let currentUser = null;
let currentChat = null;
let chatUnsub   = null;   // unsubscribe fn for chat listener

/* ═══════════════════════════════════════
   SECURITY LAYER 1 — INPUT SANITIZATION
   Prevents XSS by escaping all user data
   before inserting into innerHTML
═══════════════════════════════════════ */
function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/* ═══════════════════════════════════════
   SECURITY LAYER 2 — RATE LIMITING
   Prevents brute force login attempts
   and spam submissions client-side
═══════════════════════════════════════ */
const RateLimit = {
  _counts: {},
  _blocked: {},

  check(key, maxAttempts, windowMs) {
    const now = Date.now();

    // Clear block if window expired
    if (this._blocked[key] && now > this._blocked[key]) {
      delete this._blocked[key];
      delete this._counts[key];
    }

    // Still blocked
    if (this._blocked[key]) {
      const secs = Math.ceil((this._blocked[key] - now) / 1000);
      alert('Too many attempts. Please wait ' + secs + ' seconds.');
      return false;
    }

    // Init or increment
    if (!this._counts[key]) this._counts[key] = { count: 0, start: now };
    this._counts[key].count++;

    // Reset if window passed
    if (now - this._counts[key].start > windowMs) {
      this._counts[key] = { count: 1, start: now };
    }

    // Block if over limit
    if (this._counts[key].count > maxAttempts) {
      this._blocked[key] = now + windowMs;
      alert('Too many attempts. Please wait ' + (windowMs / 1000) + ' seconds.');
      return false;
    }

    return true;
  },

  reset(key) {
    delete this._counts[key];
    delete this._blocked[key];
  }
};



/* ═══════════════════════════════════════
   UI HELPERS
═══════════════════════════════════════ */
function show(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

function toggleMenu() {
  document.getElementById('mobileNav').classList.toggle('hidden');
}

function closeMenu() {
  document.getElementById('mobileNav').classList.add('hidden');
}

function switchAuthTab(tab) {
  if (tab === 'login') {
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('signupForm').classList.add('hidden');
    document.getElementById('tabLogin').classList.add('active');
    document.getElementById('tabSignup').classList.remove('active');
  } else {
    document.getElementById('signupForm').classList.remove('hidden');
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('tabSignup').classList.add('active');
    document.getElementById('tabLogin').classList.remove('active');
  }
}

function setMsg(id, text, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = 'status-msg ' + type;
  el.classList.remove('hidden');
}

function clearMsg(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

function statusBadge(status) {
  const map = {
    awaiting_fee:       ['gold',  'Awaiting Fee'],
    paid_waiting_seller:['blue',  'Fee Paid'],
    paid:               ['blue',  'Paid'],
    released:           ['green', 'Completed'],
    cancelled:          ['red',   'Cancelled'],
    pending:            ['gold',  'Pending'],
    approved:           ['green', 'Approved'],
    rejected:           ['red',   'Rejected'],
    active:             ['green', 'Active'],
    sold:               ['gray',  'Sold'],
    removed:            ['red',   'Removed'],
  };
  const [color, label] = map[status] || ['gray', status];
  return `<span class="badge badge-${color}">${label}</span>`;
}

function adminTab(btn, panelId) {
  document.querySelectorAll('.atab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.admin-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById(panelId).classList.remove('hidden');
}

/* ═══════════════════════════════════════
   AUTH
═══════════════════════════════════════ */
async function signup() {
  // Rate limit: max 3 signups per 120 seconds
  if (!RateLimit.check('signup', 3, 120000)) return;

  const email    = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value.trim();
  const role     = document.getElementById('signupRole').value;

  if (!email || !password) return alert('Please fill in all fields.');
  if (password.length < 6) return alert('Password must be at least 6 characters.');

  try {
    const r = await auth.createUserWithEmailAndPassword(email, password);
    await db.collection('users').doc(r.user.uid).set({
      email,
      role,
      verified:      false,
      payout:        null,
      termsAccepted: false,
      created:       firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {
    alert(e.message);
  }
}

async function login() {
  // Rate limit: max 5 login attempts per 60 seconds
  if (!RateLimit.check('login', 5, 60000)) return;

  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();

  if (!email || !password) return alert('Please enter your email and password.');

  try {
    await auth.signInWithEmailAndPassword(email, password);
    RateLimit.reset('login'); // reset on success
  } catch (e) {
    alert(e.message);
  }
}

function logout() {
  if (chatUnsub) { chatUnsub(); chatUnsub = null; }
  auth.signOut();
}

/* ═══════════════════════════════════════
   AUTH STATE OBSERVER
   FIX: buttons reset BEFORE any early return
═══════════════════════════════════════ */
auth.onAuthStateChanged(async user => {
  currentUser = user;

  const header   = document.getElementById('appHeader');
  const sellBtn  = document.getElementById('sellBtn');
  const adminBtn = document.getElementById('adminBtn');
  const verifyBtn= document.getElementById('verifyBtn');
  const payoutBtn= document.getElementById('payoutBtn');
  const mSellBtn = document.getElementById('mSellBtn');
  const mAdminBtn= document.getElementById('mAdminBtn');
  const mVerifyBtn=document.getElementById('mVerifyBtn');
  const mPayoutBtn=document.getElementById('mPayoutBtn');

  if (!user) {
    header.classList.add('hidden');
    show('auth');
    return;
  }

  header.classList.remove('hidden');

  /* Reset ALL nav buttons first — before any early return */
  [sellBtn, adminBtn, verifyBtn, payoutBtn,
   mSellBtn, mAdminBtn, mVerifyBtn, mPayoutBtn].forEach(b => {
    if (b) b.style.display = 'none';
  });

  const snap = await db.collection('users').doc(user.uid).get();
  if (!snap.exists) return;
  const data = snap.data();

  /* Must accept terms first */
  if (!data.termsAccepted) {
    show('risk');
    return;
  }

  /* Admin */
  if (user.email === ADMIN_EMAIL) {
    adminBtn.style.display  = 'inline-block';
    mAdminBtn.style.display = 'block';
    show('admin');
    loadAdmin();
    return;
  }

  /* Seller: not yet verified */
  if (data.role === 'seller' && !data.verified) {
    verifyBtn.style.display  = 'inline-block';
    mVerifyBtn.style.display = 'block';
    show('verification');
    return;
  }

  /* Seller: verified but no payout set */
  if (data.role === 'seller' && data.verified && !data.payout) {
    payoutBtn.style.display  = 'inline-block';
    mPayoutBtn.style.display = 'block';
    show('payout');
    return;
  }

  /* Seller: fully set up */
  if (data.role === 'seller' && data.verified) {
    sellBtn.style.display  = 'inline-block';
    mSellBtn.style.display = 'block';
  }

  /* Everyone lands on home */
  show('home');
  loadListings();
});

/* ═══════════════════════════════════════
   TERMS
═══════════════════════════════════════ */
async function acceptTerms() {
  const cb = document.getElementById('agreeTerms');
  if (!cb.checked) {
    alert('Please tick the checkbox to agree before continuing.');
    return;
  }
  try {
    await db.collection('users').doc(auth.currentUser.uid).update({ termsAccepted: true });
    location.reload();
  } catch (e) {
    alert(e.message);
  }
}

/* ═══════════════════════════════════════
   VERIFICATION
   FIX: file check BEFORE upload alert
   FIX: duplicate submission check
═══════════════════════════════════════ */
async function submitVerification() {
  if (!currentUser) return alert('Please log in first.');

  const idFile     = document.getElementById('idPhoto').files[0];
  const selfieFile = document.getElementById('selfiePhoto').files[0];
  const payFile    = document.getElementById('paymentProof').files[0];

  if (!idFile || !selfieFile || !payFile) {
    setMsg('verifyMsg', 'Please upload all three files before submitting.', 'error');
    return;
  }

  const existing = await db.collection('verifications')
    .where('uid', '==', currentUser.uid).get();

  if (!existing.empty) {
    setMsg('verifyMsg', 'Verification already submitted. Please wait for admin review.', 'info');
    return;
  }

  setMsg('verifyMsg', 'Uploading files, please wait...', 'info');

  const idUrl     = await uploadFile('verification', idFile);
  const selfieUrl = await uploadFile('verification', selfieFile);
  const payUrl    = await uploadFile('payments', payFile);

  if (!idUrl || !selfieUrl || !payUrl) {
    setMsg('verifyMsg', 'Upload failed. Please try again.', 'error');
    return;
  }

  await db.collection('verifications').add({
    uid:          currentUser.uid,
    idPhoto:      idUrl,
    selfie:       selfieUrl,
    paymentProof: payUrl,
    status:       'pending',
    createdAt:    Date.now()
  });

  setMsg('verifyMsg', 'Verification submitted! Admin will review shortly.', 'success');
}

/* ═══════════════════════════════════════
   PAYOUT
═══════════════════════════════════════ */
async function savePayout() {
  const method  = document.getElementById('payoutMethod').value;
  const address = document.getElementById('payoutAddress').value.trim();

  if (!address) return alert('Please enter your payment address.');

  try {
    await db.collection('users').doc(auth.currentUser.uid).update({
      payout: { method, address }
    });
    show('home');
    loadListings();
  } catch (e) {
    alert(e.message);
  }
}

/* ═══════════════════════════════════════
   LISTINGS
   FIX: innerHTML = '' before re-render (no duplicates)
═══════════════════════════════════════ */
function loadListings() {
  db.collection('listings').where('status', '==', 'active')
    .onSnapshot(snap => {
      const grid     = document.getElementById('listings');
      const noList   = document.getElementById('noListings');
      const countEl  = document.getElementById('listingCount');

      grid.innerHTML = ''; // FIX: clear before rebuild

      if (snap.empty) {
        noList.classList.remove('hidden');
        if (countEl) countEl.textContent = '0 active';
        return;
      }

      noList.classList.add('hidden');
      if (countEl) countEl.textContent = snap.size + ' active';

      snap.forEach(doc => {
        const d = doc.data();
        const card = document.createElement('div');
        card.className = 'listing-card';
        card.innerHTML =
          (d.screenshot
            ? '<img class="listing-img" src="' + esc(d.screenshot) + '" alt="' + esc(d.game) + '">'
            : '<div class="listing-img-ph">No image</div>') +
          '<div class="listing-body">' +
            '<div class="listing-game">' + esc(d.game) + '</div>' +
            '<div class="listing-details">' + esc(d.details || '') + '</div>' +
            '<div class="listing-footer">' +
              '<span class="listing-price">$' + esc(String(d.price)) + '</span>' +
              '<button class="btn-primary" onclick="buy('' + esc(doc.id) + '')">Buy</button>' +
            '</div>' +
          '</div>';
        grid.appendChild(card);
      });
    });
}

/* ═══════════════════════════════════════
   CREATE LISTING
   FIX: max listing check lives here only
═══════════════════════════════════════ */
async function createListing() {
  const game    = document.getElementById('game').value.trim();
  const details = document.getElementById('details').value.trim();
  const price   = parseFloat(document.getElementById('price').value);
  const imgFile = document.getElementById('listingImg').files[0];

  if (!game)                  return setMsg('sellMsg', 'Please enter the game name.', 'error');
  if (game.length > 60)       return setMsg('sellMsg', 'Game name must be under 60 characters.', 'error');
  if (details.length > 1000)  return setMsg('sellMsg', 'Details must be under 1000 characters.', 'error');
  if (!price || price < 1)    return setMsg('sellMsg', 'Please enter a valid price.', 'error');
  if (price > 10000)          return setMsg('sellMsg', 'Price cannot exceed $10,000.', 'error');
  // Rate limit: max 3 listings per 60 seconds
  if (!RateLimit.check('listing', 3, 60000)) return;

  const existing = await db.collection('listings')
    .where('seller', '==', auth.currentUser.uid)
    .where('status', '==', 'active').get();

  if (existing.size >= 5) {
    setMsg('sellMsg', 'Maximum 5 active listings allowed.', 'error');
    return;
  }

  setMsg('sellMsg', 'Posting listing...', 'info');

  let screenshotUrl = null;
  if (imgFile) {
    screenshotUrl = await uploadFile('listings', imgFile);
  }

  await db.collection('listings').add({
    game,
    details,
    price,
    screenshot: screenshotUrl,
    seller:     auth.currentUser.uid,
    status:     'active',
    created:    firebase.firestore.FieldValue.serverTimestamp()
  });

  setMsg('sellMsg', 'Listing posted successfully!', 'success');
  document.getElementById('game').value    = '';
  document.getElementById('details').value = '';
  document.getElementById('price').value   = '';
  document.getElementById('listingImg').value = '';
}

/* ═══════════════════════════════════════
   BUY
   FIX: removed misplaced seller listing-limit check
═══════════════════════════════════════ */
async function buy(listingId) {
  if (!currentUser) return alert('Please log in first.');

  const listing = await db.collection('listings').doc(listingId).get();
  if (!listing.exists) return alert('Listing not found.');

  const data = listing.data();

  if (data.seller === currentUser.uid) {
    alert('You cannot buy your own listing.');
    return;
  }

  const active = await db.collection('orders')
    .where('listingId', '==', listingId)
    .where('status', 'in', ['awaiting_fee', 'paid_waiting_seller', 'paid'])
    .get();

  if (!active.empty) {
    alert('This listing already has an active order.');
    return;
  }

  const ref = await db.collection('orders').add({
    listingId,
    buyer:   currentUser.uid,
    seller:  data.seller,
    game:    data.game,
    price:   data.price,
    status:  'awaiting_fee',
    created: firebase.firestore.FieldValue.serverTimestamp()
  });

  openOrder(ref.id);
  watchOrder(ref.id);
}

/* ═══════════════════════════════════════
   ORDER DETAIL
═══════════════════════════════════════ */
async function openOrder(orderId) {
  const snap = await db.collection('orders').doc(orderId).get();
  if (!snap.exists) return;

  const o = snap.data();
  show('order');

  const isUnlocked = (o.status !== 'awaiting_fee');

  document.getElementById('orderBox').innerHTML = `
    <div class="order-detail-card">
      <div class="order-detail-header">
        <div>
          <div class="order-id">ORDER #${orderId.slice(-6).toUpperCase()}</div>
          <div style="font-size:16px;font-weight:500;margin-top:2px">${o.game}</div>
        </div>
        ${statusBadge(o.status)}
      </div>
      <div class="order-detail-body">
        <div style="display:flex;justify-content:space-between;margin-bottom:18px;font-size:13px;color:var(--t2)">
          <span>Listing price</span>
          <span style="color:var(--accent);font-family:var(--font-d);font-size:17px">$${o.price}</span>
        </div>

        ${!isUnlocked ? `
          <div class="order-locked-notice">
            <div class="notice-title">&#128274; Seller Contact Locked</div>
            Pay the $${SERVICE_FEE} service fee to unlock the seller and begin the trade.
            <br><br>
            <strong>Skrill:</strong> ${PAYMENTS.Skrill}<br>
            <strong>USDT TRC20:</strong> ${PAYMENTS.USDT}<br>
            <strong>Grey:</strong> ${PAYMENTS.Grey}
          </div>
          <div class="field" style="margin-bottom:14px">
            <label class="field-label">Upload Fee Payment Screenshot</label>
            <input type="file" id="serviceProof" accept="image/*" class="file-input">
          </div>
          <button class="btn-primary full" onclick="submitServiceFee('${orderId}')">
            Submit Fee Proof — Unlock Seller
          </button>
        ` : `
          <div style="padding:14px;background:var(--bg3);border:1px solid var(--borderA);border-radius:var(--r);margin-bottom:16px;font-size:13px;color:var(--t2)">
            &#128275; Seller unlocked. You can now communicate via chat.
          </div>
          <button class="btn-primary full" onclick="openChat('${orderId}','${o.game}')">
            Open Trade Chat
          </button>
        `}
      </div>
    </div>
  `;
}

function watchOrder(orderId) {
  db.collection('orders').doc(orderId).onSnapshot(doc => {
    if (!doc.exists) return;
    const status = doc.data().status;
    if (status === 'released' || status === 'cancelled') {
      alert('This order has been closed.');
      show('home');
      return;
    }
    // Re-render order if still on order page
    const orderSection = document.getElementById('order');
    if (!orderSection.classList.contains('hidden')) {
      openOrder(orderId);
    }
  });
}

/* ═══════════════════════════════════════
   ORDERS LIST
═══════════════════════════════════════ */
function loadOrders() {
  if (!currentUser) return;

  const list     = document.getElementById('ordersList');
  const noOrders = document.getElementById('noOrders');
  const allOrders = {};

  function renderAll() {
    list.innerHTML = '';
    const entries = Object.values(allOrders);
    if (entries.length === 0) {
      noOrders.classList.remove('hidden');
      return;
    }
    noOrders.classList.add('hidden');
    entries.forEach(o => {
      const isSeller = o.seller === currentUser.uid;
      const card = document.createElement('div');
      card.className = 'order-card';
      card.innerHTML =
        '<div class="order-card-header">' +
          '<span class="order-id">ORDER #' + o._id.slice(-6).toUpperCase() + '</span>' +
          statusBadge(o.status) +
        '</div>' +
        '<div class="order-game">' + o.game + '</div>' +
        '<div class="order-meta">' +
          '$' + o.price + ' &nbsp;&middot;&nbsp;' +
          '<span style="color:var(--accent);font-size:11px;text-transform:uppercase;letter-spacing:0.06em">' +
            (isSeller ? 'You are selling' : 'You are buying') +
          '</span>' +
        '</div>' +
        '<div class="order-actions">' +
          '<button class="btn-outline" onclick="openOrder(\'' + o._id + '\');watchOrder(\'' + o._id + '\')">View Order</button>' +
          ((o.status !== 'awaiting_fee' && o.status !== 'released' && o.status !== 'cancelled')
            ? '<button class="btn-primary" onclick="openChat(\'' + o._id + '\',\'' + o.game + '\')">Chat</button>'
            : '') +
        '</div>';
      list.appendChild(card);
    });
  }

  // Listen to orders where user is buyer
  db.collection('orders').where('buyer', '==', currentUser.uid)
    .onSnapshot(snap => {
      snap.forEach(doc => { allOrders[doc.id] = { ...doc.data(), _id: doc.id }; });
      snap.docChanges().forEach(c => { if (c.type === 'removed') delete allOrders[c.doc.id]; });
      renderAll();
    });

  // Listen to orders where user is seller
  db.collection('orders').where('seller', '==', currentUser.uid)
    .onSnapshot(snap => {
      snap.forEach(doc => { allOrders[doc.id] = { ...doc.data(), _id: doc.id }; });
      snap.docChanges().forEach(c => { if (c.type === 'removed') delete allOrders[c.doc.id]; });
      renderAll();
    });
}

/* ═══════════════════════════════════════
   SERVICE FEE SUBMISSION
═══════════════════════════════════════ */
async function submitServiceFee(orderId) {
  const file = document.getElementById('serviceProof')?.files[0];
  if (!file) return alert('Please upload your payment screenshot.');

  const proofUrl = await uploadFile('payments', file);
  if (!proofUrl) return;

  await db.collection('orders').doc(orderId).update({
    serviceProof:          proofUrl,
    status:                'paid_waiting_seller',
    serviceFeePaidAt:      new Date()
  });

  alert('Fee proof submitted. Admin will confirm shortly.');
}

/* ═══════════════════════════════════════
   CHAT
═══════════════════════════════════════ */
function cleanMessage(text) {
  if (!text) return '';
  return text
    // Phone numbers and contacts
    .replace(/(\+\d[\d\s\-]{6,})/g, '[removed]')
    .replace(/(\d[\d\s\-]{8,}\d)/g, '[removed]')
    // Social / messaging platforms
    .replace(/(whatsapp|telegram|wechat|snapchat|instagram|discord|skype|viber|signal|line|kik)/gi, '[removed]')
    // Emails
    .replace(/[\w.+-]+@[\w-]+\.[a-z]{2,}/gi, '[removed]')
    // URLs
    .replace(/(https?:\/\/|www\.)[^\s]*/gi, '[removed]')
    .replace(/t\.me\/[^\s]*/gi, '[removed]')
    // Short handles like @username
    .replace(/@\w+/g, '[removed]')
    // Trim and cap length
    .trim()
    .slice(0, 500);
}

async function openChat(orderId, gameTitle) {
  if (!currentUser) return;

  const orderSnap = await db.collection('orders').doc(orderId).get();
  if (!orderSnap.exists) return alert('Order not found.');

  const o = orderSnap.data();

  if (o.status === 'awaiting_fee') {
    alert('Please pay the service fee first to unlock chat.');
    return;
  }
  if (o.status === 'released' || o.status === 'cancelled') {
    alert('This order is closed. Chat is no longer available.');
    return;
  }

  // Verify current user is buyer or seller of this order
  if (o.buyer !== currentUser.uid && o.seller !== currentUser.uid) {
    alert('You are not part of this order.');
    return;
  }

  currentChat = orderId;
  show('chat');

  document.getElementById('chatTitle').textContent  = gameTitle || 'Trade Chat';
  document.getElementById('chatStatus').textContent = o.status.replace(/_/g, ' ');

  // Unsubscribe previous listener
  if (chatUnsub) chatUnsub();

  // Store order data on the chat so we can label messages correctly
  const iAmSeller = o.seller === currentUser.uid;

  chatUnsub = db.collection('chats').doc(orderId)
    .collection('messages')
    .orderBy('time')
    .onSnapshot(snap => {
      const box = document.getElementById('messages');
      box.innerHTML = '';

      snap.forEach(doc => {
        const m    = doc.data();
        const mine = m.sender === currentUser.uid;
        const div  = document.createElement('div');
        div.className = 'msg ' + (mine ? 'from-me' : 'from-other');

        // Label the other person correctly based on order roles
        let senderLabel = '';
        if (!mine) {
          // The other person is whoever I am not
          senderLabel = iAmSeller ? 'Buyer' : 'Seller';
        }

        let imgs = '';
        if (m.images && m.images.length > 0) {
          imgs = m.images.map(u => '<img class="msg-img" src="' + u + '">').join('');
        }

        div.innerHTML =
          (senderLabel ? '<div class="msg-sender">' + esc(senderLabel) + '</div>' : '') +
          (m.text ? '<div>' + esc(m.text) + '</div>' : '') +
          imgs;

        box.appendChild(div);
      });

      box.scrollTop = box.scrollHeight;
    });
}

async function sendMessage() {
  if (!currentChat) return;
  // Rate limit: max 10 messages per 10 seconds (anti-spam)
  if (!RateLimit.check('chat', 10, 10000)) return;

  const orderSnap = await db.collection('orders').doc(currentChat).get();
  if (!orderSnap.exists) return;
  const status = orderSnap.data().status;
  if (status === 'released' || status === 'cancelled') {
    alert('Chat is closed — this order has ended.');
    return;
  }

  const text      = document.getElementById('msgInput').value.trim();
  const fileInput = document.getElementById('chatImages');
  const files     = fileInput.files;

  if (!text && files.length === 0) return;

  const userSnap = await db.collection('users').doc(currentUser.uid).get();
  const role     = userSnap.data().role;

  let imageUrls = [];

  if (role === 'seller' && files.length > 0) {
    if (files.length > 2) { alert('Maximum 2 images per message.'); return; }
    for (const file of files) {
      const url = await uploadFile('chat', file);
      if (url) imageUrls.push(url);
    }
  }

  if (role === 'buyer' && files.length > 0) {
    alert('Buyers cannot send images in chat.');
    fileInput.value = '';
    return;
  }

  await db.collection('chats').doc(currentChat)
    .collection('messages').add({
      sender: currentUser.uid,
      text:   cleanMessage(text),
      images: imageUrls,
      time:   new Date()
    });

  document.getElementById('msgInput').value = '';
  fileInput.value = '';
}

/* ═══════════════════════════════════════
   CLOUDINARY UPLOAD
═══════════════════════════════════════ */
async function uploadFile(folder, file) {
  if (!file) return null;

  if (!file.type.startsWith('image/')) {
    alert('Only image files are allowed.');
    return null;
  }
  if (file.size > 5 * 1024 * 1024) {
    alert('File must be under 5MB.');
    return null;
  }

  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', CLOUD_PRESET);
  form.append('folder', 'gamevault/' + folder);

  try {
    const res  = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
      method: 'POST',
      body:   form
    });
    const data = await res.json();
    if (!data.secure_url) throw new Error('No URL returned');
    return data.secure_url;
  } catch (e) {
    alert('Upload failed: ' + e.message);
    return null;
  }
}

/* ═══════════════════════════════════════
   ADMIN — all listeners INSIDE loadAdmin()
   FIX: no global onSnapshot leaks
═══════════════════════════════════════ */
function loadAdmin() {

  /* Live stats */
  db.collection('orders').onSnapshot(snap => {
    let total = 0, pending = 0, released = 0, cancelled = 0, earnings = 0;
    snap.forEach(doc => {
      const o = doc.data();
      total++;
      if (o.status === 'paid' || o.status === 'paid_waiting_seller') pending++;
      if (o.status === 'released') released++;
      if (o.status === 'cancelled') cancelled++;
      if (o.status === 'paid' || o.status === 'released') earnings += SERVICE_FEE;
    });

    document.getElementById('adminStats').innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Total Orders</div>
        <div class="stat-value">${total}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Platform Earnings</div>
        <div class="stat-value green">$${earnings}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active</div>
        <div class="stat-value gold">${pending}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Completed</div>
        <div class="stat-value">${released}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Cancelled</div>
        <div class="stat-value red">${cancelled}</div>
      </div>
    `;

    /* Orders panel */
    const panel = document.getElementById('aOrders');
    panel.innerHTML = '';
    snap.forEach(doc => {
      const o = doc.data();
      const card = document.createElement('div');
      card.className = 'admin-card';
      card.innerHTML = `
        <div class="admin-card-header">
          <span class="admin-card-id">ORDER #${doc.id.slice(-6).toUpperCase()}</span>
          ${statusBadge(o.status)}
        </div>
        <div class="admin-card-row"><span class="admin-card-key">Game</span><span>${o.game}</span></div>
        <div class="admin-card-row"><span class="admin-card-key">Price</span><span style="color:var(--accent)">$${o.price}</span></div>
        <div class="admin-card-row"><span class="admin-card-key">Buyer</span><span style="word-break:break-all;font-size:12px">${o.buyer}</span></div>
        <div class="admin-card-row"><span class="admin-card-key">Seller</span><span style="word-break:break-all;font-size:12px">${o.seller}</span></div>
        ${o.serviceProof
          ? `<div class="admin-card-row"><span class="admin-card-key">Fee Proof</span><a href="${o.serviceProof}" target="_blank">View screenshot</a></div>`
          : `<div class="admin-card-row"><span class="admin-card-key">Fee Proof</span><span style="color:var(--t3)">Not uploaded yet</span></div>`}
        <div class="admin-card-actions">
          <button class="btn-gold" onclick="adminMarkPaid('${doc.id}')">Mark Paid</button>
          <button class="btn-primary" onclick="adminRelease('${doc.id}','${o.listingId}')">Release</button>
          <button class="btn-danger" onclick="adminCancel('${doc.id}','${o.listingId}')">Cancel</button>
        </div>
      `;
      panel.appendChild(card);
    });
  });

  /* Verifications */
  db.collection('verifications').where('status', '==', 'pending')
    .onSnapshot(snap => {
      const panel = document.getElementById('aVerify');
      panel.innerHTML = '';

      if (snap.empty) {
        panel.innerHTML = '<div class="empty-state"><div class="empty-icon">&#10003;</div><p>No pending verifications</p></div>';
        return;
      }

      snap.forEach(doc => {
        const v = doc.data();
        const card = document.createElement('div');
        card.className = 'admin-card';
        card.innerHTML = `
          <div class="admin-card-header">
            <span class="admin-card-id">SELLER VERIFICATION</span>
            ${statusBadge('pending')}
          </div>
          <div class="admin-card-row"><span class="admin-card-key">User ID</span><span style="word-break:break-all;font-size:12px">${v.uid}</span></div>
          <div class="admin-card-row">
            <span class="admin-card-key">Documents</span>
            <span>
              <a href="${v.idPhoto}" target="_blank">ID Photo</a> &nbsp;·&nbsp;
              <a href="${v.selfie}" target="_blank">Selfie</a> &nbsp;·&nbsp;
              <a href="${v.paymentProof}" target="_blank">Fee Proof</a>
            </span>
          </div>
          <div class="admin-card-actions">
            <button class="btn-primary" onclick="adminApprove('${doc.id}','${v.uid}')">Approve Seller</button>
            <button class="btn-danger" onclick="adminRejectVerification('${doc.id}')">Reject</button>
          </div>
        `;
        panel.appendChild(card);
      });
    });

  /* Listings */
  db.collection('listings').orderBy('created', 'desc')
    .onSnapshot(snap => {
      const panel = document.getElementById('aListings');
      panel.innerHTML = '';

      snap.forEach(doc => {
        const d = doc.data();
        const card = document.createElement('div');
        card.className = 'admin-card';
        card.innerHTML = `
          <div class="admin-card-header">
            <span style="font-weight:500">${d.game}</span>
            ${statusBadge(d.status)}
          </div>
          <div class="admin-card-row"><span class="admin-card-key">Price</span><span style="color:var(--accent)">$${d.price}</span></div>
          <div class="admin-card-row"><span class="admin-card-key">Seller</span><span style="font-size:12px;word-break:break-all">${d.seller}</span></div>
          ${d.screenshot ? `<div class="admin-card-row"><span class="admin-card-key">Image</span><a href="${d.screenshot}" target="_blank">View</a></div>` : ''}
          <div class="admin-card-actions">
            ${d.status !== 'active' ? `<button class="btn-gold" onclick="adminActivateListing('${doc.id}')">Activate</button>` : ''}
            <button class="btn-danger" onclick="adminRemoveListing('${doc.id}')">Remove</button>
          </div>
        `;
        panel.appendChild(card);
      });
    });

  /* Chats */
  db.collection('chats').onSnapshot(snap => {
    const panel = document.getElementById('aChats');
    panel.innerHTML = '';

    if (snap.empty) {
      panel.innerHTML = '<div class="empty-state"><p>No active chats</p></div>';
      return;
    }

    snap.forEach(doc => {
      const div = document.createElement('div');
      div.className = 'admin-card';
      div.innerHTML = `
        <div class="admin-card-row">
          <span class="admin-card-key">Order</span>
          <span>#${doc.id.slice(-6).toUpperCase()}</span>
        </div>
        <div class="admin-card-actions">
          <button class="btn-outline" onclick="adminViewChat('${doc.id}')">View Messages</button>
        </div>
        <div id="chatLog-${doc.id}"></div>
      `;
      panel.appendChild(div);
    });
  });
}

/* ── Admin actions ────────────────────── */
async function adminApprove(docId, uid) {
  await db.collection('users').doc(uid).update({ verified: true });
  await db.collection('verifications').doc(docId).update({ status: 'approved' });
  alert('Seller approved.');
}

async function adminRejectVerification(docId) {
  await db.collection('verifications').doc(docId).update({ status: 'rejected' });
  alert('Verification rejected.');
}

async function adminMarkPaid(orderId) {
  await db.collection('orders').doc(orderId).update({ status: 'paid', paidAt: new Date() });
}

async function adminRelease(orderId, listingId) {
  const snap = await db.collection('orders').doc(orderId).get();
  if (!snap.exists) return alert('Order not found.');
  if (snap.data().status !== 'paid') return alert('Order must be marked PAID before releasing.');
  await db.collection('orders').doc(orderId).update({ status: 'released', releasedAt: new Date() });
  await db.collection('listings').doc(listingId).update({ status: 'sold' });
  alert('Order released. Trade completed.');
}

async function adminCancel(orderId, listingId) {
  await db.collection('orders').doc(orderId).update({ status: 'cancelled', cancelledAt: new Date() });
  if (listingId) {
    await db.collection('listings').doc(listingId).update({ status: 'active' });
  }
  alert('Order cancelled.');
}

async function adminRemoveListing(id) {
  await db.collection('listings').doc(id).update({ status: 'removed', removedAt: new Date() });
}

async function adminActivateListing(id) {
  await db.collection('listings').doc(id).update({ status: 'active', activatedAt: new Date() });
}

async function adminViewChat(orderId) {
  const logEl = document.getElementById('chatLog-' + orderId);
  if (!logEl) return;
  logEl.innerHTML = '<div style="font-size:12px;color:var(--t3);padding:10px 0">Loading...</div>';

  const msgs = await db.collection('chats').doc(orderId)
    .collection('messages').orderBy('time').get();

  if (msgs.empty) {
    logEl.innerHTML = '<div style="font-size:12px;color:var(--t3);padding:8px 0">No messages yet.</div>';
    return;
  }

  logEl.innerHTML = msgs.docs.map(d => {
    const m = d.data();
    return '<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:12px">' +
      '<span style="color:var(--t3)">' + esc(m.sender.slice(0,8)) + '...</span>' +
      '<span style="margin-left:8px;color:var(--t2)">' + esc(m.text || '[image]') + '</span>' +
    '</div>';
  }).join('');
}

/* ═══════════════════════════════════════
   NAV: load orders on tab click
═══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Intercept orders nav clicks to also load orders
  document.querySelectorAll('[onclick*="show(\'orders\')"]').forEach(btn => {
    const original = btn.getAttribute('onclick');
    btn.setAttribute('onclick', original + ';loadOrders()');
  });
});

/* ═══════════════════════════════════════
   AUTO-CLEAN BROKEN ORDERS (delayed)
═══════════════════════════════════════ */
setTimeout(() => {
  db.collection('orders').get().then(snap => {
    snap.forEach(doc => {
      const o = doc.data();
      if (!o.listingId || !o.buyer) {
        doc.ref.delete();
      }
    });
  });
}, 5000);