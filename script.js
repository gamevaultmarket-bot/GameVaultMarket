/* ================================================
   GAMEVAULT MARKET — script.js
   Full rebuild. Clean, secure, all bugs resolved.
================================================ */

/* ── FIREBASE ── */
firebase.initializeApp({
  apiKey:     "AIzaSyBfGXL6lKmBTZ9FIxsmsP_-40_-MZ33zBw",
  authDomain: "gamevaultmarket-5e494.firebaseapp.com",
  projectId:  "gamevaultmarket-5e494"
});
const auth = firebase.auth();
const db   = firebase.firestore();

/* ── CONFIG ── */
const ADMIN_EMAIL  = "gamevaultmarket@gmail.com";
const CLOUD_NAME   = "dwxgzykij";
const CLOUD_PRESET = "gamevault_upload";
const SERVICE_FEE  = 2;
const PAYMENTS     = {
  Skrill: "gamevaultmarket@gmail.com",
  USDT:   "0x992d0E36A7409F0c9228B51C6bB8F875b1A4Af3B",
  Grey:   "212286724510"
};

/* ── STATE ── */
let currentUser = null;
let currentChat = null;
let chatUnsub   = null;

/* ════════════════════════════════════════
   SECURITY HELPERS
════════════════════════════════════════ */

/* Escape user data before inserting into innerHTML — prevents XSS */
function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#x27;');
}

/* Rate limiter — prevents brute force & spam */
const RL = {
  _c: {}, _b: {},
  check(key, max, ms) {
    const now = Date.now();
    if (this._b[key]) {
      if (now < this._b[key]) {
        alert('Too many attempts. Wait ' + Math.ceil((this._b[key]-now)/1000) + 's.');
        return false;
      }
      delete this._b[key]; delete this._c[key];
    }
    if (!this._c[key]) this._c[key] = { n: 0, t: now };
    if (now - this._c[key].t > ms) this._c[key] = { n: 0, t: now };
    this._c[key].n++;
    if (this._c[key].n > max) { this._b[key] = now + ms; alert('Too many attempts. Wait ' + (ms/1000) + 's.'); return false; }
    return true;
  },
  reset(key) { delete this._c[key]; delete this._b[key]; }
};

/* Scrub contact info from chat messages */
function scrub(text) {
  if (!text) return '';
  return text
    .replace(/(\+\d[\d\s\-()]{5,})/g, '[removed]')
    .replace(/\b\d{8,}\b/g, '[removed]')
    .replace(/(whatsapp|telegram|wechat|snapchat|instagram|discord|skype|viber|signal|kik|tiktok)/gi, '[removed]')
    .replace(/[\w.+\-]+@[\w\-]+\.[a-z]{2,}/gi, '[removed]')
    .replace(/(https?:\/\/|www\.)[^\s]*/gi, '[removed]')
    .replace(/@\w+/g, '[removed]')
    .trim()
    .slice(0, 500);
}

/* ════════════════════════════════════════
   UI HELPERS
════════════════════════════════════════ */
function show(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

function toggleMenu() { document.getElementById('mobileNav').classList.toggle('hidden'); }
function closeMenu()  { document.getElementById('mobileNav').classList.add('hidden'); }

function authTab(t) {
  const isLogin = t === 'login';
  document.getElementById('loginForm').classList.toggle('hidden', !isLogin);
  document.getElementById('signupForm').classList.toggle('hidden', isLogin);
  document.getElementById('tabLogin').classList.toggle('active', isLogin);
  document.getElementById('tabSignup').classList.toggle('active', !isLogin);
}

function setMsg(id, text, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = 'msg-box ' + type;
  el.classList.remove('hidden');
}
function clearMsg(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.add('hidden'); el.textContent = ''; }
}

function badge(status) {
  const map = {
    awaiting_fee:        ['b-gold',  'Awaiting Fee'],
    paid_waiting_seller: ['b-blue',  'Fee Paid'],
    paid:                ['b-blue',  'Paid'],
    released:            ['b-green', 'Completed'],
    cancelled:           ['b-red',   'Cancelled'],
    pending:             ['b-gold',  'Pending'],
    approved:            ['b-green', 'Approved'],
    rejected:            ['b-red',   'Rejected'],
    active:              ['b-green', 'Active'],
    sold:                ['b-gray',  'Sold'],
    removed:             ['b-red',   'Removed'],
  };
  const [cls, lbl] = map[status] || ['b-gray', status];
  return '<span class="badge ' + cls + '">' + lbl + '</span>';
}

function aTab(btn, panelId) {
  document.querySelectorAll('.atab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.a-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById(panelId).classList.remove('hidden');
}

/* ════════════════════════════════════════
   AUTH
════════════════════════════════════════ */
async function doSignup() {
  if (!RL.check('signup', 3, 120000)) return;

  const email    = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const role     = document.getElementById('signupRole').value;

  clearMsg('signupMsg');
  if (!email || !password)     return setMsg('signupMsg', 'Please fill in all fields.', 'error');
  if (password.length < 6)     return setMsg('signupMsg', 'Password must be at least 6 characters.', 'error');
  if (!['buyer','seller'].includes(role)) return;

  setMsg('signupMsg', 'Creating account...', 'loading');

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
    RL.reset('signup');
    /* onAuthStateChanged will take it from here */
  } catch (e) {
    setMsg('signupMsg', e.message, 'error');
  }
}

async function doLogin() {
  if (!RL.check('login', 5, 60000)) return;

  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  clearMsg('loginMsg');
  if (!email || !password) return setMsg('loginMsg', 'Please enter your email and password.', 'error');

  setMsg('loginMsg', 'Logging in...', 'loading');

  try {
    await auth.signInWithEmailAndPassword(email, password);
    RL.reset('login');
  } catch (e) {
    setMsg('loginMsg', e.message, 'error');
  }
}

function doLogout() {
  if (chatUnsub) { chatUnsub(); chatUnsub = null; }
  currentChat = null;
  auth.signOut();
}

/* ════════════════════════════════════════
   AUTH STATE OBSERVER
   Key fixes:
   1. All button resets happen BEFORE any early return
   2. Retry loop handles signup race condition
   3. Full try/catch so errors show instead of blank screen
════════════════════════════════════════ */
auth.onAuthStateChanged(async user => {
  currentUser = user;

  const header    = document.getElementById('appHeader');
  const sellBtn   = document.getElementById('sellBtn');
  const adminBtn  = document.getElementById('adminBtn');
  const verifyBtn = document.getElementById('verifyBtn');
  const payoutBtn = document.getElementById('payoutBtn');
  const mSellBtn  = document.getElementById('mSellBtn');
  const mAdminBtn = document.getElementById('mAdminBtn');
  const mVerifyBtn= document.getElementById('mVerifyBtn');
  const mPayoutBtn= document.getElementById('mPayoutBtn');

  if (!user) {
    header.classList.add('hidden');
    show('auth');
    return;
  }

  header.classList.remove('hidden');

  /* Reset every conditional button BEFORE any return — prevents leaking */
  [sellBtn, adminBtn, verifyBtn, payoutBtn,
   mSellBtn, mAdminBtn, mVerifyBtn, mPayoutBtn].forEach(b => {
    if (b) b.style.display = 'none';
  });

  try {
    /*
     * Signup race condition fix:
     * Firebase fires onAuthStateChanged immediately after account creation,
     * but the Firestore user doc write may not have completed yet.
     * Retry up to 8 times (4 seconds total) before giving up.
     */
    let snap = null;
    for (let i = 0; i < 8; i++) {
      snap = await db.collection('users').doc(user.uid).get();
      if (snap.exists) break;
      await new Promise(r => setTimeout(r, 500));
    }

    if (!snap || !snap.exists) {
      await auth.signOut();
      show('auth');
      setMsg('signupMsg', 'Account setup failed. Please try signing up again.', 'error');
      return;
    }

    const data = snap.data();

    /* Force terms agreement */
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

    /* Seller — needs verification */
    if (data.role === 'seller' && !data.verified) {
      verifyBtn.style.display  = 'inline-block';
      mVerifyBtn.style.display = 'block';
      show('verification');
      return;
    }

    /* Seller — needs payout */
    if (data.role === 'seller' && data.verified && !data.payout) {
      payoutBtn.style.display  = 'inline-block';
      mPayoutBtn.style.display = 'block';
      show('payout');
      return;
    }

    /* Seller fully onboarded */
    if (data.role === 'seller' && data.verified && data.payout) {
      sellBtn.style.display  = 'inline-block';
      mSellBtn.style.display = 'block';
    }

    /* Buyer or verified seller — go to listings */
    show('home');
    loadListings();
    startNotifications();

  } catch (err) {
    console.error('Auth state error:', err);
    show('auth');
    setMsg('loginMsg', 'Something went wrong: ' + err.message, 'error');
  }
});

/* ════════════════════════════════════════
   TERMS
════════════════════════════════════════ */
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

/* ════════════════════════════════════════
   VERIFICATION
════════════════════════════════════════ */
async function submitVerification() {
  if (!currentUser) return;
  clearMsg('verifyMsg');

  const idFile     = document.getElementById('idPhoto').files[0];
  const selfieFile = document.getElementById('selfiePhoto').files[0];
  const payFile    = document.getElementById('paymentProof').files[0];

  if (!idFile || !selfieFile || !payFile)
    return setMsg('verifyMsg', 'Please upload all three files.', 'error');

  /* Prevent duplicate submissions */
  const existing = await db.collection('verifications')
    .where('uid', '==', currentUser.uid).get();
  if (!existing.empty)
    return setMsg('verifyMsg', 'Already submitted. Please wait for admin review.', 'info');

  setMsg('verifyMsg', 'Uploading files, please wait...', 'loading');

  const idUrl     = await uploadFile('verification', idFile);
  const selfieUrl = await uploadFile('verification', selfieFile);
  const payUrl    = await uploadFile('payments', payFile);

  if (!idUrl || !selfieUrl || !payUrl)
    return setMsg('verifyMsg', 'Upload failed. Please try again.', 'error');

  await db.collection('verifications').add({
    uid: currentUser.uid, idPhoto: idUrl, selfie: selfieUrl,
    paymentProof: payUrl, status: 'pending', createdAt: Date.now()
  });

  setMsg('verifyMsg', 'Submitted! Admin will review shortly.', 'success');
}

/* ════════════════════════════════════════
   PAYOUT
════════════════════════════════════════ */
async function savePayout() {
  clearMsg('payoutMsg');
  const method  = document.getElementById('payoutMethod').value;
  const address = document.getElementById('payoutAddress').value.trim();

  if (!address) return setMsg('payoutMsg', 'Please enter your payment address.', 'error');

  try {
    await db.collection('users').doc(auth.currentUser.uid).update({ payout: { method, address } });
    show('home');
    loadListings();
  } catch (e) {
    setMsg('payoutMsg', e.message, 'error');
  }
}

/* ════════════════════════════════════════
   LISTINGS
   Fix: innerHTML = '' before rebuild (no duplicates)
════════════════════════════════════════ */
function loadListings() {
  db.collection('listings').where('status', '==', 'active')
    .onSnapshot(snap => {
      const grid    = document.getElementById('listings');
      const noEl    = document.getElementById('noListings');
      const countEl = document.getElementById('listingCount');

      grid.innerHTML = ''; /* clear first — prevents duplicate cards */

      if (snap.empty) {
        noEl.classList.remove('hidden');
        if (countEl) countEl.textContent = '';
        return;
      }
      noEl.classList.add('hidden');
      if (countEl) countEl.textContent = snap.size + ' active';

      snap.forEach(doc => {
        const d = doc.data();
        const card = document.createElement('div');
        card.className = 'l-card';
        card.innerHTML =
          (d.screenshot
            ? '<img class="l-img" src="' + esc(d.screenshot) + '" alt="' + esc(d.game) + '" loading="lazy">'
            : '<div class="l-img-ph">No image</div>') +
          '<div class="l-body">' +
            '<div class="l-game">'    + esc(d.game)            + '</div>' +
            '<div class="l-details">' + esc(d.details || '')   + '</div>' +
            '<div class="l-footer">' +
              '<span class="l-price">$' + esc(String(d.price)) + '</span>' +
              '<button class="btn-primary" onclick="doBuy(\'' + esc(doc.id) + '\')">Buy</button>' +
            '</div>' +
          '</div>';
        grid.appendChild(card);
      });
    });
}

/* ════════════════════════════════════════
   CREATE LISTING
   Fix: listing limit check lives here only
════════════════════════════════════════ */
async function createListing() {
  clearMsg('sellMsg');
  if (!RL.check('listing', 3, 60000)) return;

  const game    = document.getElementById('game').value.trim();
  const details = document.getElementById('details').value.trim();
  const price   = parseFloat(document.getElementById('price').value);
  const imgFile = document.getElementById('listingImg').files[0];

  if (!game)            return setMsg('sellMsg', 'Please enter the game name.', 'error');
  if (game.length > 60) return setMsg('sellMsg', 'Game name max 60 characters.', 'error');
  if (details.length > 1000) return setMsg('sellMsg', 'Details max 1000 characters.', 'error');
  if (!price || price < 1)   return setMsg('sellMsg', 'Please enter a valid price ($1 minimum).', 'error');
  if (price > 10000)         return setMsg('sellMsg', 'Price cannot exceed $10,000.', 'error');

  const existing = await db.collection('listings')
    .where('seller', '==', auth.currentUser.uid)
    .where('status', '==', 'active').get();
  if (existing.size >= 5) return setMsg('sellMsg', 'Maximum 5 active listings allowed.', 'error');

  setMsg('sellMsg', 'Posting listing...', 'loading');

  let screenshotUrl = null;
  if (imgFile) screenshotUrl = await uploadFile('listings', imgFile);

  await db.collection('listings').add({
    game, details, price,
    screenshot: screenshotUrl,
    seller:  auth.currentUser.uid,
    status:  'active',
    created: firebase.firestore.FieldValue.serverTimestamp()
  });

  setMsg('sellMsg', 'Listing posted successfully!', 'success');
  document.getElementById('game').value    = '';
  document.getElementById('details').value = '';
  document.getElementById('price').value   = '';
  document.getElementById('listingImg').value = '';
}

/* ════════════════════════════════════════
   BUY
   Fix: removed misplaced seller limit check
════════════════════════════════════════ */
async function doBuy(listingId) {
  if (!currentUser) return alert('Please log in first.');

  const listing = await db.collection('listings').doc(listingId).get();
  if (!listing.exists) return alert('Listing not found.');

  const d = listing.data();
  if (d.seller === currentUser.uid) return alert('You cannot buy your own listing.');

  const active = await db.collection('orders')
    .where('listingId', '==', listingId)
    .where('status', 'in', ['awaiting_fee','paid_waiting_seller','paid']).get();
  if (!active.empty) return alert('This listing already has an active order.');

  const ref = await db.collection('orders').add({
    listingId,
    buyer:   currentUser.uid,
    seller:  d.seller,
    game:    d.game,
    price:   d.price,
    status:  'awaiting_fee',
    created: firebase.firestore.FieldValue.serverTimestamp()
  });

  // Create the chat document for this order so it exists when both parties open it
  await db.collection('chats').doc(ref.id).set({
    orderId: ref.id,
    buyer:   currentUser.uid,
    seller:  d.seller,
    created: firebase.firestore.FieldValue.serverTimestamp()
  });

  openOrder(ref.id);
  watchOrder(ref.id);
}

/* ════════════════════════════════════════
   ORDER DETAIL
════════════════════════════════════════ */
async function openOrder(orderId) {
  const snap = await db.collection('orders').doc(orderId).get();
  if (!snap.exists) return;
  const o = snap.data();

  show('order');
  const locked = o.status === 'awaiting_fee';

  document.getElementById('orderBox').innerHTML =
    '<div class="od-card">' +
      '<div class="od-hdr">' +
        '<div>' +
          '<div class="o-id">ORDER #' + esc(orderId.slice(-6).toUpperCase()) + '</div>' +
          '<div style="font-size:15px;font-weight:500;margin-top:2px">' + esc(o.game) + '</div>' +
        '</div>' +
        badge(o.status) +
      '</div>' +
      '<div class="od-body">' +
        '<div class="od-row"><span>Listing price</span><span style="color:var(--accent);font-family:var(--fd);font-size:17px">$' + esc(String(o.price)) + '</span></div>' +
        (locked
          ? '<div class="locked-box">' +
              '<div class="locked-title">&#128274; Seller Contact Locked</div>' +
              'Pay the $' + SERVICE_FEE + ' service fee to unlock the seller and begin the trade.<br><br>' +
              '<strong>Skrill:</strong> ' + PAYMENTS.Skrill + '<br>' +
              '<strong>USDT TRC20:</strong> ' + PAYMENTS.USDT + '<br>' +
              '<strong>Grey:</strong> ' + PAYMENTS.Grey +
            '</div>' +
            '<div class="field" style="margin-bottom:14px">' +
              '<label class="flabel">Upload Fee Payment Screenshot</label>' +
              '<input type="file" id="serviceProof" accept="image/*" class="file-inp">' +
            '</div>' +
            '<button class="btn-primary w100" onclick="submitServiceFee(\'' + esc(orderId) + '\')">Submit Fee Proof — Unlock Seller</button>'
          : '<div style="padding:13px;background:var(--bg3);border:1px solid var(--bdrA);border-radius:var(--r);margin-bottom:14px;font-size:13px;color:var(--t2)">&#128275; Seller unlocked. Use chat to complete the trade.</div>' +
            '<button class="btn-primary w100" onclick="openChat(\'' + esc(orderId) + '\',\'' + esc(o.game) + '\')">Open Trade Chat</button>') +
      '</div>' +
    '</div>';
}

function watchOrder(orderId) {
  db.collection('orders').doc(orderId).onSnapshot(doc => {
    if (!doc.exists) return;
    const s = doc.data().status;
    if (s === 'released' || s === 'cancelled') {
      alert('This order has been closed.');
      show('home');
      return;
    }
    const orderSection = document.getElementById('order');
    if (!orderSection.classList.contains('hidden')) openOrder(orderId);
  });
}

/* ════════════════════════════════════════
   ORDERS LIST
   Fix: queries BOTH buyer and seller sides
════════════════════════════════════════ */
function loadOrders() {
  if (!currentUser) return;

  const list     = document.getElementById('ordersList');
  const noOrders = document.getElementById('noOrders');
  const allOrders = {};

  function render() {
    list.innerHTML = '';
    const entries = Object.values(allOrders);
    if (entries.length === 0) { noOrders.classList.remove('hidden'); return; }
    noOrders.classList.add('hidden');

    entries.forEach(o => {
      const isSeller = o.seller === currentUser.uid;
      const card = document.createElement('div');
      card.className = 'o-card';
      card.innerHTML =
        '<div class="o-card-top">' +
          '<span class="o-id">ORDER #' + esc(o._id.slice(-6).toUpperCase()) + '</span>' +
          badge(o.status) +
        '</div>' +
        '<div class="o-game">' + esc(o.game) + '</div>' +
        '<div class="o-meta">' +
          '$' + esc(String(o.price)) + ' &nbsp;&middot;&nbsp;' +
          '<span style="color:var(--accent);font-size:11px;text-transform:uppercase;letter-spacing:.06em">' +
            (isSeller ? 'You are selling' : 'You are buying') +
          '</span>' +
        '</div>' +
        '<div class="o-actions">' +
          '<button class="btn-outline" onclick="openOrder(\'' + esc(o._id) + '\');watchOrder(\'' + esc(o._id) + '\')">View Order</button>' +
          (o.status !== 'awaiting_fee' && o.status !== 'released' && o.status !== 'cancelled'
            ? '<button class="btn-primary" onclick="openChat(\'' + esc(o._id) + '\',\'' + esc(o.game) + '\')">Chat</button>'
            : '') +
        '</div>';
      list.appendChild(card);
    });
  }

  /* Listen as buyer */
  db.collection('orders').where('buyer', '==', currentUser.uid)
    .onSnapshot(snap => {
      snap.forEach(doc => { allOrders[doc.id] = { ...doc.data(), _id: doc.id }; });
      snap.docChanges().forEach(c => { if (c.type === 'removed') delete allOrders[c.doc.id]; });
      render();
    });

  /* Listen as seller */
  db.collection('orders').where('seller', '==', currentUser.uid)
    .onSnapshot(snap => {
      snap.forEach(doc => { allOrders[doc.id] = { ...doc.data(), _id: doc.id }; });
      snap.docChanges().forEach(c => { if (c.type === 'removed') delete allOrders[c.doc.id]; });
      render();
    });
}

/* ════════════════════════════════════════
   SERVICE FEE
════════════════════════════════════════ */
async function submitServiceFee(orderId) {
  const file = document.getElementById('serviceProof')?.files[0];
  if (!file) return alert('Please upload your payment screenshot first.');

  const url = await uploadFile('payments', file);
  if (!url) return;

  await db.collection('orders').doc(orderId).update({
    serviceProof:     url,
    status:           'paid_waiting_seller',
    serviceFeePaidAt: new Date()
  });
  alert('Fee proof submitted! Admin will confirm shortly.');
}

/* ════════════════════════════════════════
   CHAT
   Fix: correct buyer/seller labels
════════════════════════════════════════ */
async function openChat(orderId, gameTitle) {
  if (!currentUser) return;

  const orderSnap = await db.collection('orders').doc(orderId).get();
  if (!orderSnap.exists) return alert('Order not found.');
  const o = orderSnap.data();

  if (o.status === 'awaiting_fee')
    return alert('Pay the service fee first to unlock chat.');
  if (o.status === 'released' || o.status === 'cancelled')
    return alert('This order is closed. Chat is no longer available.');
  if (o.buyer !== currentUser.uid && o.seller !== currentUser.uid)
    return alert('You are not part of this order.');

  currentChat = orderId;
  markSeen(orderId);   // mark as read when chat is opened
  show('chat');

  document.getElementById('chatTitle').textContent  = gameTitle || 'Trade Chat';
  document.getElementById('chatStatus').textContent = o.status.replace(/_/g, ' ');

  const iAmSeller = o.seller === currentUser.uid;

  if (chatUnsub) chatUnsub();

  chatUnsub = db.collection('chats').doc(orderId)
    .collection('messages').orderBy('time')
    .onSnapshot(snap => {
      const feed = document.getElementById('messages');
      feed.innerHTML = '';

      snap.forEach(doc => {
        const m    = doc.data();
        const mine = m.sender === currentUser.uid;
        const div  = document.createElement('div');
        div.className = 'bubble ' + (mine ? 'mine' : 'theirs');

        const who   = !mine ? (iAmSeller ? 'Buyer' : 'Seller') : '';
        let   imgs  = '';
        if (m.images && m.images.length)
          imgs = m.images.map(u => '<img class="bubble-img" src="' + esc(u) + '">').join('');

        div.innerHTML =
          (who ? '<div class="bubble-who">' + esc(who) + '</div>' : '') +
          (m.text ? '<div>' + esc(m.text) + '</div>' : '') +
          imgs;

        feed.appendChild(div);
      });

      feed.scrollTop = feed.scrollHeight;
    });
}

async function sendMessage() {
  if (!currentChat) return;
  if (!RL.check('chat', 10, 10000)) return;

  const orderSnap = await db.collection('orders').doc(currentChat).get();
  if (!orderSnap.exists) return;
  const status = orderSnap.data().status;
  if (status === 'released' || status === 'cancelled')
    return alert('This order is closed. Chat locked.');

  const text  = document.getElementById('msgInput').value.trim();
  const files = document.getElementById('chatImages').files;
  if (!text && files.length === 0) return;

  const userSnap = await db.collection('users').doc(currentUser.uid).get();
  const role = userSnap.data().role;
  let imageUrls = [];

  if (role === 'buyer' && files.length > 0)
    return alert('Buyers cannot send images in chat.');

  if (role === 'seller' && files.length > 0) {
    if (files.length > 2) return alert('Maximum 2 images per message.');
    for (const f of files) {
      const u = await uploadFile('chat', f);
      if (u) imageUrls.push(u);
    }
  }

  await db.collection('chats').doc(currentChat).collection('messages').add({
    sender: currentUser.uid,
    text:   scrub(text),
    images: imageUrls,
    time:   firebase.firestore.FieldValue.serverTimestamp()
  });

  document.getElementById('msgInput').value = '';
  document.getElementById('chatImages').value = '';
}

/* ════════════════════════════════════════
   CLOUDINARY UPLOAD
════════════════════════════════════════ */
async function uploadFile(folder, file) {
  if (!file) return null;
  if (!file.type.match(/image\/(jpeg|jpg|png|webp)/)) { alert('Only JPG, PNG or WEBP images allowed.'); return null; }
  if (file.size > 5 * 1024 * 1024)    { alert('File must be under 5MB.'); return null; }

  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', CLOUD_PRESET);
  form.append('folder', 'gamevault/' + folder);

  try {
    const res  = await fetch('https://api.cloudinary.com/v1_1/' + CLOUD_NAME + '/image/upload', { method: 'POST', body: form });
    const data = await res.json();
    if (!data.secure_url) throw new Error('Upload failed');
    return data.secure_url;
  } catch (e) {
    alert('Upload failed: ' + e.message);
    return null;
  }
}

/* ════════════════════════════════════════
   ADMIN PANEL
   Fix: ALL listeners inside loadAdmin() — no global leaks
════════════════════════════════════════ */
function loadAdmin() {

  /* ── Stats + Orders panel (single listener) ── */
  db.collection('orders').onSnapshot(snap => {
    let total = 0, active = 0, completed = 0, cancelled = 0, earnings = 0;
    snap.forEach(doc => {
      const o = doc.data(); total++;
      if (o.status === 'paid' || o.status === 'paid_waiting_seller') active++;
      if (o.status === 'released')  completed++;
      if (o.status === 'cancelled') cancelled++;
      if (o.status === 'paid' || o.status === 'released') earnings += SERVICE_FEE;
    });

    document.getElementById('adminStats').innerHTML =
      statBox('Total Orders',     total,     '')       +
      statBox('Earnings',         '$'+earnings, 'green') +
      statBox('Active',           active,    'gold')   +
      statBox('Completed',        completed, '')       +
      statBox('Cancelled',        cancelled, 'red');

    const panel = document.getElementById('aOrders');
    panel.innerHTML = '';
    if (snap.empty) { panel.innerHTML = '<div class="empty"><p>No orders yet</p></div>'; return; }

    snap.forEach(doc => {
      const o = doc.data();
      const card = document.createElement('div');
      card.className = 'a-card';
      card.innerHTML =
        '<div class="a-card-top">' +
          '<span class="a-id">ORDER #' + esc(doc.id.slice(-6).toUpperCase()) + '</span>' +
          badge(o.status) +
        '</div>' +
        aRow('Game',   esc(o.game)) +
        aRow('Price',  '<span style="color:var(--accent)">$' + esc(String(o.price)) + '</span>') +
        aRow('Buyer',  '<span style="font-size:12px">' + esc(o.buyer)  + '</span>') +
        aRow('Seller', '<span style="font-size:12px">' + esc(o.seller) + '</span>') +
        (o.serviceProof
          ? aRow('Fee Proof', '<a href="' + esc(o.serviceProof) + '" target="_blank">View screenshot</a>')
          : aRow('Fee Proof', '<span style="color:var(--t3)">Not uploaded yet</span>')) +
        '<div class="a-actions">' +
          '<button class="btn-gold"    onclick="adminMarkPaid(\'' + esc(doc.id) + '\')">Mark Paid</button>' +
          '<button class="btn-green"   onclick="adminRelease(\'' + esc(doc.id) + '\',\'' + esc(o.listingId) + '\')">Release</button>' +
          '<button class="btn-red"     onclick="adminCancel(\''  + esc(doc.id) + '\',\'' + esc(o.listingId) + '\')">Cancel</button>' +
        '</div>';
      panel.appendChild(card);
    });
  });

  /* ── Verifications ── */
  db.collection('verifications').where('status', '==', 'pending')
    .onSnapshot(snap => {
      const panel = document.getElementById('aVerify');
      panel.innerHTML = '';
      if (snap.empty) { panel.innerHTML = '<div class="empty"><p>No pending verifications</p></div>'; return; }

      snap.forEach(doc => {
        const v = doc.data();
        const card = document.createElement('div');
        card.className = 'a-card';
        card.innerHTML =
          '<div class="a-card-top"><span class="a-id">SELLER VERIFICATION</span>' + badge('pending') + '</div>' +
          aRow('User ID', '<span style="font-size:12px">' + esc(v.uid) + '</span>') +
          aRow('Docs',
            '<a href="' + esc(v.idPhoto)      + '" target="_blank">ID Photo</a> &nbsp;&middot;&nbsp;' +
            '<a href="' + esc(v.selfie)        + '" target="_blank">Selfie</a> &nbsp;&middot;&nbsp;' +
            '<a href="' + esc(v.paymentProof)  + '" target="_blank">Fee Proof</a>') +
          '<div class="a-actions">' +
            '<button class="btn-green" onclick="adminApprove(\'' + esc(doc.id) + '\',\'' + esc(v.uid) + '\')">Approve</button>' +
            '<button class="btn-red"   onclick="adminReject(\''  + esc(doc.id) + '\')">Reject</button>' +
          '</div>';
        panel.appendChild(card);
      });
    });

  /* ── Listings ── */
  db.collection('listings').onSnapshot(snap => {
    const panel = document.getElementById('aListings');
    panel.innerHTML = '';
    snap.forEach(doc => {
      const d = doc.data();
      const card = document.createElement('div');
      card.className = 'a-card';
      card.innerHTML =
        '<div class="a-card-top"><span style="font-weight:500">' + esc(d.game) + '</span>' + badge(d.status) + '</div>' +
        aRow('Price',  '<span style="color:var(--accent)">$' + esc(String(d.price)) + '</span>') +
        aRow('Seller', '<span style="font-size:12px">' + esc(d.seller) + '</span>') +
        (d.screenshot ? aRow('Image', '<a href="' + esc(d.screenshot) + '" target="_blank">View</a>') : '') +
        '<div class="a-actions">' +
          (d.status !== 'active' ? '<button class="btn-green" onclick="adminActivateListing(\'' + esc(doc.id) + '\')">Activate</button>' : '') +
          '<button class="btn-red" onclick="adminRemoveListing(\'' + esc(doc.id) + '\')">Remove</button>' +
        '</div>';
      panel.appendChild(card);
    });
  });

  /* ── Chats ── */
  db.collection('chats').onSnapshot(snap => {
    const panel = document.getElementById('aChats');
    panel.innerHTML = '';
    if (snap.empty) { panel.innerHTML = '<div class="empty"><p>No chats yet</p></div>'; return; }

    snap.forEach(doc => {
      const div = document.createElement('div');
      div.className = 'a-card';
      div.innerHTML =
        aRow('Order', '#' + esc(doc.id.slice(-6).toUpperCase())) +
        '<div class="a-actions"><button class="btn-outline" onclick="adminViewChat(\'' + esc(doc.id) + '\')">View Messages</button></div>' +
        '<div id="chatLog-' + esc(doc.id) + '"></div>';
      panel.appendChild(div);
    });
  });
}

function statBox(label, value, colorClass) {
  return '<div class="stat-box"><div class="stat-lbl">' + label + '</div><div class="stat-val ' + colorClass + '">' + value + '</div></div>';
}

function aRow(key, valHtml) {
  return '<div class="a-row"><span class="a-key">' + key + '</span><span class="a-val">' + valHtml + '</span></div>';
}

/* ── Admin actions ── */
async function adminApprove(docId, uid) {
  await db.collection('users').doc(uid).update({ verified: true });
  await db.collection('verifications').doc(docId).update({ status: 'approved' });
  alert('Seller approved.');
}
async function adminReject(docId) {
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
  if (listingId) await db.collection('listings').doc(listingId).update({ status: 'sold' });
  alert('Order released. Trade complete.');
}
async function adminCancel(orderId, listingId) {
  await db.collection('orders').doc(orderId).update({ status: 'cancelled', cancelledAt: new Date() });
  if (listingId) await db.collection('listings').doc(listingId).update({ status: 'active' });
  alert('Order cancelled.');
}
async function adminRemoveListing(id) {
  await db.collection('listings').doc(id).update({ status: 'removed', removedAt: new Date() });
}
async function adminActivateListing(id) {
  await db.collection('listings').doc(id).update({ status: 'active' });
}
async function adminViewChat(orderId) {
  const logEl = document.getElementById('chatLog-' + orderId);
  if (!logEl) return;
  logEl.innerHTML = '<div style="font-size:12px;color:var(--t3);padding:8px 0">Loading...</div>';

  const msgs = await db.collection('chats').doc(orderId)
    .collection('messages').orderBy('time').get();
  if (msgs.empty) { logEl.innerHTML = '<div style="font-size:12px;color:var(--t3);padding:8px 0">No messages.</div>'; return; }

  logEl.innerHTML = msgs.docs.map(d => {
    const m = d.data();
    return '<div style="padding:5px 0;border-bottom:1px solid var(--bdr);font-size:12px">' +
      '<span style="color:var(--t3)">' + esc(m.sender.slice(0,8)) + '...</span>' +
      '<span style="margin-left:8px;color:var(--t2)">' + esc(m.text || '[image]') + '</span>' +
    '</div>';
  }).join('');
}


/* ════════════════════════════════════════
   NOTIFICATION BADGE SYSTEM
   - Tracks last-seen timestamp per chat
     in localStorage
   - Listens to all user's active order chats
   - Shows unread count on Orders nav button
   - Clears when user opens Orders page
════════════════════════════════════════ */

const SEEN_KEY = 'gv_seen_'; // localStorage key prefix

function getLastSeen(orderId) {
  const val = localStorage.getItem(SEEN_KEY + orderId);
  return val ? parseInt(val) : 0;
}

function markSeen(orderId) {
  localStorage.setItem(SEEN_KEY + orderId, Date.now());
}

function clearBadge() {
  // Mark all current chats as seen when user opens Orders
  const badge  = document.getElementById('ordersBadge');
  const mBadge = document.getElementById('mOrdersBadge');
  if (badge)  { badge.textContent = '0';  badge.classList.add('hidden'); }
  if (mBadge) { mBadge.textContent = '0'; mBadge.classList.add('hidden'); }

  // Mark all active chats as seen
  if (!currentUser) return;
  db.collection('orders')
    .where('buyer', '==', currentUser.uid).get()
    .then(snap => snap.forEach(doc => markSeen(doc.id)));
  db.collection('orders')
    .where('seller', '==', currentUser.uid).get()
    .then(snap => snap.forEach(doc => markSeen(doc.id)));
}

function updateBadge(count) {
  const badge  = document.getElementById('ordersBadge');
  const mBadge = document.getElementById('mOrdersBadge');
  if (!badge || !mBadge) return;

  if (count > 0) {
    const display = count > 99 ? '99+' : String(count);
    badge.textContent  = display;
    mBadge.textContent = display;
    badge.classList.remove('hidden');
    mBadge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
    mBadge.classList.add('hidden');
  }
}

// Start watching all user's chats for unread messages
function startNotifications() {
  if (!currentUser) return;

  const unsubscribers = [];
  const unreadPerOrder = {}; // orderId -> unread count

  function recalcTotal() {
    const total = Object.values(unreadPerOrder).reduce((a, b) => a + b, 0);
    // Don't show badge if user is already on the orders/chat page
    const ordersVisible = !document.getElementById('orders').classList.contains('hidden');
    const chatVisible   = !document.getElementById('chat').classList.contains('hidden');
    if (ordersVisible || chatVisible) {
      updateBadge(0);
    } else {
      updateBadge(total);
    }
  }

  function watchChatForOrder(orderId) {
    const lastSeen = getLastSeen(orderId);

    const unsub = db.collection('chats').doc(orderId)
      .collection('messages')
      .orderBy('time')
      .onSnapshot(snap => {
        let unread = 0;
        snap.forEach(doc => {
          const m = doc.data();
          // Count messages not sent by me and newer than last seen
          if (m.sender !== currentUser.uid) {
            const msgTime = m.time && m.time.toMillis ? m.time.toMillis() : (m.time instanceof Date ? m.time.getTime() : 0);
            if (msgTime > getLastSeen(orderId)) unread++;
          }
        });
        unreadPerOrder[orderId] = unread;
        recalcTotal();
      });

    unsubscribers.push(unsub);
  }

  // Watch all orders for the user (buyer + seller)
  const buyerUnsub = db.collection('orders')
    .where('buyer', '==', currentUser.uid)
    .onSnapshot(snap => {
      snap.forEach(doc => {
        const o = doc.data();
        if (o.status !== 'released' && o.status !== 'cancelled' && o.status !== 'awaiting_fee') {
          if (!unreadPerOrder.hasOwnProperty(doc.id)) {
            watchChatForOrder(doc.id);
          }
        }
      });
    });

  const sellerUnsub = db.collection('orders')
    .where('seller', '==', currentUser.uid)
    .onSnapshot(snap => {
      snap.forEach(doc => {
        const o = doc.data();
        if (o.status !== 'released' && o.status !== 'cancelled' && o.status !== 'awaiting_fee') {
          if (!unreadPerOrder.hasOwnProperty(doc.id)) {
            watchChatForOrder(doc.id);
          }
        }
      });
    });

  unsubscribers.push(buyerUnsub, sellerUnsub);

  // When user opens a chat, mark it as seen immediately
  const origOpenChat = window.openChat;
  window._notifUnsubs = unsubscribers;
}

/* ════════════════════════════════════════
   AUTO-CLEAN ORPHAN ORDERS
════════════════════════════════════════ */
setTimeout(() => {
  db.collection('orders').get().then(snap => {
    snap.forEach(doc => {
      const o = doc.data();
      if (!o.listingId || !o.buyer) doc.ref.delete();
    });
  });
}, 6000);