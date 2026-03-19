/* ================================================
   GAMEVAULT MARKET — script.js
   Phone OTP authentication. No email required.
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
/*
 * IMPORTANT: After your first login, go to Firebase Console
 * → Firestore → users collection → find your document
 * → add field: isAdmin = true (boolean)
 * Then paste your UID below.
 */
const ADMIN_UID        = "REPLACE_WITH_YOUR_UID";
const CLOUD_NAME       = "dwxgzykij";
const CLOUD_PRESET     = "gamevault_upload";
const SERVICE_FEE      = 2;
const ORDER_TIMEOUT_MS = 60 * 60 * 1000;
const MAX_BUYERS       = 5;
const PAYMENTS         = {
  Skrill: "gamevaultmarket@gmail.com",
  USDT:   "0x992d0E36A7409F0c9228B51C6bB8F875b1A4Af3B",
  Grey:   "212286724510"
};

/* ── STATE ── */
let currentUser         = null;
let currentChat         = null;
let chatUnsub           = null;
let ratingOrderId       = null;
let ratingSellerUid     = null;
let selectedStars       = 0;
let countdownTimer      = null;
let confirmationResult  = null; // holds OTP confirmation object

/* ════════════════════════════════════════
   SECURITY — XSS PREVENTION
════════════════════════════════════════ */
function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/* ════════════════════════════════════════
   SECURITY — RATE LIMITER
════════════════════════════════════════ */
const RL = {
  _c: {}, _b: {},
  check(key, max, ms) {
    const now = Date.now();
    if (this._b[key]) {
      if (now < this._b[key]) { alert('Too many attempts. Wait ' + Math.ceil((this._b[key]-now)/1000) + 's.'); return false; }
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

/* ════════════════════════════════════════
   SECURITY — MESSAGE SCRUBBER
════════════════════════════════════════ */
function scrub(text) {
  if (!text) return '';
  return text
    .replace(/(\+\d[\d\s\-()]{5,})/g, '[removed]')
    .replace(/\b\d{8,}\b/g, '[removed]')
    .replace(/(whatsapp|telegram|wechat|snapchat|instagram|discord|skype|viber|signal|kik|tiktok|facebook|twitter)/gi, '[removed]')
    .replace(/[\w.+\-]+@[\w\-]+\.[a-z]{2,}/gi, '[removed]')
    .replace(/(https?:\/\/|www\.)[^\s]*/gi, '[removed]')
    .replace(/@\w+/g, '[removed]')
    .replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine)\b/gi, '[#]')
    .replace(/(\[#\][\s\-]*){4,}/g, '[removed]')
    .replace(/\b(add me|find me|contact me|reach me|message me|dm me|hit me up)\b/gi, '[removed]')
    .trim().slice(0, 500);
}

/* ════════════════════════════════════════
   SECURITY — DEVICE CHECK
════════════════════════════════════════ */
function checkDevice(uid) {
  const key     = 'gv_dev_' + uid;
  const current = navigator.userAgent + '|' + screen.width + 'x' + screen.height;
  const stored  = localStorage.getItem(key);
  if (!stored) { localStorage.setItem(key, current); return; }
  if (stored !== current) {
    localStorage.setItem(key, current);
    db.collection('securityLog').add({
      uid, event: 'new_device_login',
      userAgent: navigator.userAgent,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(() => {});
    setTimeout(() => {
      alert('Security notice: Login detected from a new device. If this was not you, contact support immediately.');
    }, 1200);
  }
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
    paid_waiting_seller: ['b-blue',  'Awaiting Confirmation'],
    paid:                ['b-green', 'Chat Unlocked'],
    released:            ['b-green', 'Completed'],
    cancelled:           ['b-red',   'Cancelled'],
    pending:             ['b-gold',  'Pending'],
    approved:            ['b-green', 'Approved'],
    rejected:            ['b-red',   'Rejected'],
    active:              ['b-green', 'Active'],
    sold:                ['b-gray',  'Sold'],
    removed:             ['b-red',   'Removed'],
    suspended:           ['b-red',   'Suspended'],
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

function statBox(label, value, colorClass) {
  return '<div class="stat-box"><div class="stat-lbl">' + label + '</div><div class="stat-val ' + (colorClass||'') + '">' + value + '</div></div>';
}
function aRow(key, valHtml) {
  return '<div class="a-row"><span class="a-key">' + key + '</span><span class="a-val">' + valHtml + '</span></div>';
}
function starsHtml(avg, count) {
  if (!count) return '';
  const filled = Math.round(avg);
  let s = '';
  for (let i = 1; i <= 5; i++) s += i <= filled ? '&#9733;' : '&#9734;';
  return '<div class="l-rating"><span class="stars">' + s + '</span><span class="count">(' + count + ')</span></div>';
}

/* ════════════════════════════════════════
   AUTH — PHONE OTP
   Step 1: user enters phone → sendOTP()
   Step 2: user enters code → verifyOTP()
   No email, no password, no email verification
════════════════════════════════════════ */

function setupRecaptcha() {
  // Only create once — reuse on retries
  if (window.recaptchaVerifier) return;
  window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier(
    'recaptcha-container',
    { size: 'invisible', callback: () => {} }
  );
}

async function sendOTP() {
  if (!RL.check('otp', 3, 120000)) return;

  const phone = document.getElementById('phoneInput').value.trim();
  clearMsg('phoneMsg');

  if (!phone || phone.length < 8)
    return setMsg('phoneMsg', 'Please enter a valid phone number with country code. e.g. +233...', 'error');

  setMsg('phoneMsg', 'Sending verification code...', 'loading');

  try {
    setupRecaptcha();
    confirmationResult = await auth.signInWithPhoneNumber(phone, window.recaptchaVerifier);
    document.getElementById('otpPhoneDisplay').textContent = phone;
    document.getElementById('phoneStep').classList.add('hidden');
    document.getElementById('otpStep').classList.remove('hidden');
    clearMsg('phoneMsg');
  } catch (e) {
    // Reset recaptcha so user can try again
    if (window.recaptchaVerifier) {
      window.recaptchaVerifier.clear();
      window.recaptchaVerifier = null;
    }
    setMsg('phoneMsg', e.message, 'error');
  }
}

async function verifyOTP() {
  if (!confirmationResult) return setMsg('otpMsg', 'Please request a code first.', 'error');

  const code = document.getElementById('otpInput').value.trim();
  clearMsg('otpMsg');

  if (!code || code.length !== 6)
    return setMsg('otpMsg', 'Please enter the 6-digit code.', 'error');

  setMsg('otpMsg', 'Verifying...', 'loading');

  try {
    const result = await confirmationResult.confirm(code);
    const user   = result.user;

    // If new user — create their Firestore document
    const snap = await db.collection('users').doc(user.uid).get();
    if (!snap.exists) {
      const role = document.getElementById('phoneRole')?.value || 'buyer';
      await db.collection('users').doc(user.uid).set({
        phoneNumber:   user.phoneNumber,
        role,
        verified:      false,
        payout:        null,
        suspended:     false,
        termsAccepted: false,
        isAdmin:       false,
        created:       firebase.firestore.FieldValue.serverTimestamp()
      });
    }
    RL.reset('otp');
    // onAuthStateChanged picks up from here
  } catch (e) {
    setMsg('otpMsg', 'Invalid or expired code. Please try again.', 'error');
  }
}

function backToPhone() {
  confirmationResult = null;
  if (window.recaptchaVerifier) {
    window.recaptchaVerifier.clear();
    window.recaptchaVerifier = null;
  }
  document.getElementById('otpStep').classList.add('hidden');
  document.getElementById('phoneStep').classList.remove('hidden');
  document.getElementById('otpInput').value = '';
  clearMsg('otpMsg');
}

function doLogout() {
  if (chatUnsub) { chatUnsub(); chatUnsub = null; }
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  currentChat = null;
  // Reset OTP state
  confirmationResult = null;
  if (window.recaptchaVerifier) {
    window.recaptchaVerifier.clear();
    window.recaptchaVerifier = null;
  }
  auth.signOut();
}

/* ════════════════════════════════════════
   AUTH STATE OBSERVER
   Admin identified by UID or isAdmin field
   No emailVerified check anywhere
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

  // Reset all conditional buttons BEFORE any early return
  [sellBtn, adminBtn, verifyBtn, payoutBtn,
   mSellBtn, mAdminBtn, mVerifyBtn, mPayoutBtn].forEach(b => {
    if (b) b.style.display = 'none';
  });

  try {
    // Retry loop — Firestore doc may not exist yet right after first OTP login
    let snap = null;
    for (let i = 0; i < 8; i++) {
      snap = await db.collection('users').doc(user.uid).get();
      if (snap.exists) break;
      await new Promise(r => setTimeout(r, 500));
    }

    if (!snap || !snap.exists) {
      await auth.signOut();
      show('auth');
      setMsg('phoneMsg', 'Account setup failed. Please try again.', 'error');
      return;
    }

    const data = snap.data();

    // Suspended users cannot proceed
    if (data.suspended === true) {
      await auth.signOut();
      show('auth');
      setMsg('phoneMsg', 'Your account has been suspended. Contact support.', 'error');
      return;
    }

    // Device fingerprint check
    checkDevice(user.uid);

    // Terms must be accepted first
    if (!data.termsAccepted) {
      show('risk');
      return;
    }

    // Admin — identified by UID constant OR isAdmin field in Firestore
    const isAdmin = user.uid === ADMIN_UID || data.isAdmin === true;
    if (isAdmin) {
      adminBtn.style.display  = 'inline-block';
      mAdminBtn.style.display = 'block';
      show('admin');
      loadAdmin();
      return;
    }

    // Seller: needs verification
    if (data.role === 'seller' && !data.verified) {
      verifyBtn.style.display  = 'inline-block';
      mVerifyBtn.style.display = 'block';
      show('verification');
      return;
    }

    // Seller: verified but no payout set
    if (data.role === 'seller' && data.verified && !data.payout) {
      payoutBtn.style.display  = 'inline-block';
      mPayoutBtn.style.display = 'block';
      show('payout');
      return;
    }

    // Seller fully onboarded
    if (data.role === 'seller' && data.verified && data.payout) {
      sellBtn.style.display  = 'inline-block';
      mSellBtn.style.display = 'block';
    }

    show('home');
    loadListings();
    startNotifications();
    runAutoCancelCheck();

  } catch (err) {
    console.error('Auth observer error:', err);
    show('auth');
    setMsg('phoneMsg', 'Something went wrong: ' + err.message, 'error');
  }
});

/* ════════════════════════════════════════
   TERMS
════════════════════════════════════════ */
async function acceptTerms() {
  const cb = document.getElementById('agreeTerms');
  if (!cb.checked) { alert('Please tick the checkbox to agree before continuing.'); return; }
  if (!auth.currentUser) return;
  const snap = await db.collection('users').doc(auth.currentUser.uid).get();
  if (!snap.exists || snap.data().termsAccepted) return;
  try {
    await db.collection('users').doc(auth.currentUser.uid).update({ termsAccepted: true });
    location.reload();
  } catch (e) { alert(e.message); }
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

  const existing = await db.collection('verifications').where('uid','==',currentUser.uid).get();
  if (!existing.empty) return setMsg('verifyMsg', 'Already submitted. Wait for admin review.', 'info');

  setMsg('verifyMsg', 'Uploading files, please wait...', 'loading');

  const idUrl     = await uploadFile('verification', idFile);
  const selfieUrl = await uploadFile('verification', selfieFile);
  const payUrl    = await uploadFile('payments', payFile);

  if (!idUrl || !selfieUrl || !payUrl)
    return setMsg('verifyMsg', 'Upload failed. Please try again.', 'error');

  await db.collection('verifications').add({
    uid: currentUser.uid, idPhoto: idUrl, selfie: selfieUrl,
    paymentProof: payUrl, status: 'pending',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
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
    startNotifications();
  } catch (e) { setMsg('payoutMsg', e.message, 'error'); }
}

/* ════════════════════════════════════════
   LISTINGS
════════════════════════════════════════ */
function loadListings() {
  db.collection('listings').where('status','==','active')
    .onSnapshot(async snap => {
      const grid    = document.getElementById('listings');
      const noEl    = document.getElementById('noListings');
      const countEl = document.getElementById('listingCount');
      grid.innerHTML = '';

      if (snap.empty) {
        noEl.classList.remove('hidden');
        if (countEl) countEl.textContent = '';
        return;
      }
      noEl.classList.add('hidden');
      if (countEl) countEl.textContent = snap.size + ' active';

      for (const doc of snap.docs) {
        const d = doc.data();

        const ratSnap = await db.collection('ratings').where('sellerUid','==',d.seller).get();
        let avgRating = 0, ratingCount = 0;
        if (!ratSnap.empty) {
          ratingCount = ratSnap.size;
          avgRating   = ratSnap.docs.reduce((sum, r) => sum + (r.data().stars || 0), 0) / ratingCount;
        }

        const card = document.createElement('div');
        card.className = 'l-card';
        card.innerHTML =
          (d.screenshot
            ? '<img class="l-img" src="' + esc(d.screenshot) + '" alt="' + esc(d.game) + '" loading="lazy">'
            : '<div class="l-img-ph">No image</div>') +
          '<div class="l-body">' +
            '<div class="l-game">' + esc(d.game) + '</div>' +
            '<div class="l-details">' + esc(d.details || '') + '</div>' +
            starsHtml(avgRating, ratingCount) +
            '<div class="l-footer">' +
              '<span class="l-price">$' + (Number(d.price) || 0) + '</span>' +
              '<button class="btn-primary" onclick="doBuy(\'' + esc(doc.id) + '\')">Buy</button>' +
            '</div>' +
          '</div>';
        grid.appendChild(card);
      }
    });
}

/* ════════════════════════════════════════
   CREATE LISTING
════════════════════════════════════════ */
async function createListing() {
  clearMsg('sellMsg');
  if (!RL.check('listing', 3, 60000)) return;

  const game    = document.getElementById('game').value.trim();
  const details = document.getElementById('details').value.trim();
  const price   = parseFloat(document.getElementById('price').value);
  const imgFile = document.getElementById('listingImg').files[0];

  if (!game)                 return setMsg('sellMsg', 'Please enter the game name.', 'error');
  if (game.length > 60)      return setMsg('sellMsg', 'Game name max 60 characters.', 'error');
  if (details.length > 1000) return setMsg('sellMsg', 'Details max 1000 characters.', 'error');
  if (!price || price < 1)   return setMsg('sellMsg', 'Please enter a valid price ($1 minimum).', 'error');
  if (price > 10000)         return setMsg('sellMsg', 'Price cannot exceed $10,000.', 'error');

  const existing = await db.collection('listings')
    .where('seller','==',auth.currentUser.uid).where('status','==','active').get();
  if (existing.size >= 5) return setMsg('sellMsg', 'Maximum 5 active listings allowed.', 'error');

  setMsg('sellMsg', 'Posting listing...', 'loading');
  let screenshotUrl = null;
  if (imgFile) screenshotUrl = await uploadFile('listings', imgFile);

  await db.collection('listings').add({
    game, details, price, screenshot: screenshotUrl,
    seller: auth.currentUser.uid, status: 'active',
    created: firebase.firestore.FieldValue.serverTimestamp()
  });

  setMsg('sellMsg', 'Listing posted successfully!', 'success');
  document.getElementById('game').value       = '';
  document.getElementById('details').value    = '';
  document.getElementById('price').value      = '';
  document.getElementById('listingImg').value = '';
}

/* ════════════════════════════════════════
   BUY
   No composite index queries — filter client-side
════════════════════════════════════════ */
async function doBuy(listingId) {
  if (!currentUser) return alert('Please log in first.');

  try {
    const listing = await db.collection('listings').doc(listingId).get();
    if (!listing.exists) return alert('Listing not found.');

    const d = listing.data();
    if (d.seller === currentUser.uid) return alert('You cannot buy your own listing.');

    const activeStatuses = ['awaiting_fee','paid_waiting_seller','paid'];

    // Check if buyer already has an active order — no composite index needed
    const myOrderSnap = await db.collection('orders')
      .where('listingId','==', listingId)
      .where('buyer','==', currentUser.uid).get();
    const myActive = myOrderSnap.docs.filter(d => activeStatuses.includes(d.data().status));
    if (myActive.length > 0) return alert('You already have an active order for this listing.');

    // Max 5 buyers per listing
    const allOrdersSnap = await db.collection('orders')
      .where('listingId','==', listingId).get();
    const activeCount = allOrdersSnap.docs.filter(d => activeStatuses.includes(d.data().status)).length;
    if (activeCount >= MAX_BUYERS)
      return alert('This listing has reached the maximum of 5 active buyers. Try again later.');

    const ref = await db.collection('orders').add({
      listingId, buyer: currentUser.uid, seller: d.seller,
      game: d.game, price: d.price, status: 'awaiting_fee',
      created: firebase.firestore.FieldValue.serverTimestamp()
    });

    await db.collection('chats').doc(ref.id).set({
      orderId: ref.id, buyer: currentUser.uid, seller: d.seller,
      created: firebase.firestore.FieldValue.serverTimestamp()
    });

    openOrder(ref.id);
    watchOrder(ref.id);

  } catch (err) {
    console.error('Buy error:', err);
    alert('Something went wrong: ' + err.message);
  }
}

/* ════════════════════════════════════════
   AUTO-CANCEL UNPAID ORDERS AFTER 1 HOUR
════════════════════════════════════════ */
async function runAutoCancelCheck() {
  if (!currentUser) return;
  const now = Date.now();

  const snap = await db.collection('orders')
    .where('buyer','==', currentUser.uid)
    .where('status','==','awaiting_fee').get();

  for (const doc of snap.docs) {
    const o = doc.data();
    const createdMs = o.created && o.created.toMillis ? o.created.toMillis() : 0;
    if (createdMs && (now - createdMs) > ORDER_TIMEOUT_MS) {
      await doc.ref.update({ status: 'cancelled', cancelledAt: new Date(), cancelReason: 'auto_timeout' });
    }
  }
}

function startCountdown(createdMs, orderId) {
  if (countdownTimer) clearInterval(countdownTimer);
  const el = document.getElementById('countdown-' + orderId);
  if (!el) return;

  countdownTimer = setInterval(() => {
    const remaining = ORDER_TIMEOUT_MS - (Date.now() - createdMs);
    if (remaining <= 0) {
      clearInterval(countdownTimer);
      el.textContent = 'Order expired';
      runAutoCancelCheck();
      return;
    }
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    el.textContent = 'Auto-cancels in ' + mins + 'm ' + secs + 's if fee not paid';
  }, 1000);
}

/* ════════════════════════════════════════
   ORDER DETAIL
════════════════════════════════════════ */
async function openOrder(orderId) {
  const snap = await db.collection('orders').doc(orderId).get();
  if (!snap.exists) return;
  const o = snap.data();
  show('order');

  const isLocked  = o.status === 'awaiting_fee';
  const isWaiting = o.status === 'paid_waiting_seller';
  const isUnlocked= o.status === 'paid';
  const createdMs = o.created && o.created.toMillis ? o.created.toMillis() : 0;

  let bodyHtml = '';

  if (isLocked) {
    bodyHtml =
      '<div id="countdown-' + esc(orderId) + '" class="countdown-bar">&#9201; Calculating...</div>' +
      '<div class="locked-box">' +
        '<div class="locked-title">&#128274; Seller Contact Locked</div>' +
        'Pay the $' + SERVICE_FEE + ' service fee to unlock communication with the seller.<br><br>' +
        '<strong>Skrill:</strong> ' + PAYMENTS.Skrill + '<br>' +
        '<strong>USDT TRC20:</strong> ' + PAYMENTS.USDT + '<br>' +
        '<strong>Grey:</strong> ' + PAYMENTS.Grey +
      '</div>' +
      '<div class="field" style="margin-bottom:14px"><label class="flabel">Upload Fee Payment Screenshot</label>' +
      '<input type="file" id="serviceProof" accept="image/*" class="file-inp"></div>' +
      '<button class="btn-primary w100" onclick="submitServiceFee(\'' + esc(orderId) + '\')">Submit Fee Proof</button>';
  } else if (isWaiting) {
    bodyHtml =
      '<div style="padding:13px;background:var(--bg3);border:1px solid rgba(77,159,255,.3);border-radius:var(--r);margin-bottom:14px;font-size:13px;color:var(--blue)">' +
        '&#9203; Fee proof submitted. Waiting for admin to confirm. Chat unlocks once confirmed.' +
      '</div>';
  } else if (isUnlocked) {
    bodyHtml =
      '<div style="padding:13px;background:var(--bg3);border:1px solid var(--bdrA);border-radius:var(--r);margin-bottom:14px;font-size:13px;color:var(--t2)">' +
        '&#128275; Payment confirmed. Chat is unlocked. Complete your trade safely.' +
      '</div>' +
      '<button class="btn-primary w100" onclick="openChat(\'' + esc(orderId) + '\',\'' + esc(o.game) + '\')">Open Trade Chat</button>';
  } else if (o.status === 'released') {
    bodyHtml = '<div style="padding:13px;background:var(--bg3);border:1px solid var(--bdrA);border-radius:var(--r);font-size:13px;color:var(--accent)">&#10003; Trade completed successfully.</div>';
  } else if (o.status === 'cancelled') {
    bodyHtml = '<div style="padding:13px;background:var(--bg3);border:1px solid rgba(255,77,77,.3);border-radius:var(--r);font-size:13px;color:var(--red)">&#10005; Order cancelled.' + (o.cancelReason === 'auto_timeout' ? ' (Payment not received within 1 hour.)' : '') + '</div>';
  }

  document.getElementById('orderBox').innerHTML =
    '<div class="od-card">' +
      '<div class="od-hdr">' +
        '<div><div class="o-id">ORDER #' + esc(orderId.slice(-6).toUpperCase()) + '</div>' +
        '<div style="font-size:15px;font-weight:500;margin-top:2px">' + esc(o.game) + '</div></div>' +
        badge(o.status) +
      '</div>' +
      '<div class="od-body">' +
        '<div class="od-row"><span>Listing price</span><span style="color:var(--accent);font-family:var(--fd);font-size:17px">$' + esc(String(o.price)) + '</span></div>' +
        bodyHtml +
      '</div>' +
    '</div>';

  if (isLocked && createdMs) startCountdown(createdMs, orderId);
}

function watchOrder(orderId) {
  db.collection('orders').doc(orderId).onSnapshot(doc => {
    if (!doc.exists) return;
    const s = doc.data().status;
    if (s === 'released' || s === 'cancelled') {
      if (s === 'released' && doc.data().buyer === currentUser.uid) {
        showRatingModal(orderId, doc.data().seller);
      } else {
        alert('This order has been closed.');
        show('home');
      }
      return;
    }
    if (!document.getElementById('order').classList.contains('hidden')) openOrder(orderId);
  });
}

/* ════════════════════════════════════════
   ORDERS LIST
════════════════════════════════════════ */
function loadOrders() {
  if (!currentUser) return;
  runAutoCancelCheck();

  const list      = document.getElementById('ordersList');
  const noOrders  = document.getElementById('noOrders');
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
        '<div class="o-meta">$' + esc(String(o.price)) + ' &nbsp;&middot;&nbsp;' +
          '<span style="color:var(--accent);font-size:11px;text-transform:uppercase;letter-spacing:.06em">' +
            (isSeller ? 'You are selling' : 'You are buying') +
          '</span>' +
        '</div>' +
        '<div class="o-actions">' +
          '<button class="btn-outline" onclick="openOrder(\'' + esc(o._id) + '\');watchOrder(\'' + esc(o._id) + '\')">View Order</button>' +
          (o.status === 'paid'
            ? '<button class="btn-primary" onclick="openChat(\'' + esc(o._id) + '\',\'' + esc(o.game) + '\')">Chat</button>'
            : '') +
        '</div>';
      list.appendChild(card);
    });
  }

  db.collection('orders').where('buyer','==', currentUser.uid)
    .onSnapshot(snap => {
      snap.forEach(doc => { allOrders[doc.id] = { ...doc.data(), _id: doc.id }; });
      snap.docChanges().forEach(c => { if (c.type === 'removed') delete allOrders[c.doc.id]; });
      render();
    });

  db.collection('orders').where('seller','==', currentUser.uid)
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
    serviceProof: url, status: 'paid_waiting_seller',
    serviceFeePaidAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  alert('Fee proof submitted. Admin will confirm your payment shortly.');
}

/* ════════════════════════════════════════
   CHAT
   Locked until admin marks paid
════════════════════════════════════════ */
async function openChat(orderId, gameTitle) {
  if (!currentUser) return;

  const orderSnap = await db.collection('orders').doc(orderId).get();
  if (!orderSnap.exists) return alert('Order not found.');
  const o = orderSnap.data();

  if (o.status === 'awaiting_fee' || o.status === 'paid_waiting_seller')
    return alert('Chat is locked until admin confirms your payment.');
  if (o.status === 'released' || o.status === 'cancelled')
    return alert('This order is closed. Chat is no longer available.');
  if (o.status !== 'paid')
    return alert('Chat is not available for this order.');
  if (o.buyer !== currentUser.uid && o.seller !== currentUser.uid)
    return alert('You are not part of this order.');

  currentChat = orderId;
  markSeen(orderId);
  show('chat');

  document.getElementById('chatTitle').textContent  = gameTitle || 'Trade Chat';
  document.getElementById('chatStatus').textContent = 'Live';

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

        const who = !mine ? (iAmSeller ? 'Buyer' : 'Seller') : '';
        let imgs  = '';
        if (m.images && m.images.length)
          imgs = m.images.map(u => '<img class="bubble-img" src="' + esc(u) + '">').join('');

        div.innerHTML =
          (who ? '<div class="bubble-who">' + esc(who) + '</div>' : '') +
          (m.text ? '<div>' + esc(m.text) + '</div>' : '') + imgs;

        feed.appendChild(div);
      });
      feed.scrollTop = feed.scrollHeight;
      markSeen(orderId);
    });
}

async function sendMessage() {
  if (!currentChat) return;
  if (!RL.check('chat', 10, 10000)) return;

  const orderSnap = await db.collection('orders').doc(currentChat).get();
  if (!orderSnap.exists) return;
  if (orderSnap.data().status !== 'paid') return alert('Chat is locked.');

  const text  = document.getElementById('msgInput').value.trim();
  const files = document.getElementById('chatImages').files;
  if (!text && files.length === 0) return;

  const userSnap = await db.collection('users').doc(currentUser.uid).get();
  const role = userSnap.data().role;
  let imageUrls = [];

  if (role === 'buyer' && files.length > 0) {
    document.getElementById('chatImages').value = '';
    return alert('Buyers cannot send images in chat.');
  }
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

  document.getElementById('msgInput').value   = '';
  document.getElementById('chatImages').value = '';
}

/* ════════════════════════════════════════
   REPORT
════════════════════════════════════════ */
async function fileReport() {
  if (!currentChat || !currentUser) return;
  const reason = prompt('Describe the issue (max 300 chars):');
  if (!reason || !reason.trim()) return;

  const orderSnap = await db.collection('orders').doc(currentChat).get();
  if (!orderSnap.exists) return;
  const o = orderSnap.data();
  const against = o.buyer === currentUser.uid ? o.seller : o.buyer;

  await db.collection('reports').add({
    orderId: currentChat, reportedBy: currentUser.uid, against,
    reason: reason.trim().slice(0, 300), status: 'open',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  alert('Report submitted. Admin will review shortly.');
}

/* ════════════════════════════════════════
   RATING
════════════════════════════════════════ */
function showRatingModal(orderId, sellerUid) {
  ratingOrderId   = orderId;
  ratingSellerUid = sellerUid;
  selectedStars   = 0;
  document.getElementById('starPicker').querySelectorAll('.star').forEach(s => s.classList.remove('lit'));
  document.getElementById('starLabel').textContent  = 'Tap a star to rate';
  document.getElementById('ratingComment').value    = '';
  document.getElementById('ratingModal').classList.remove('hidden');
}

function closeRatingModal() {
  document.getElementById('ratingModal').classList.add('hidden');
  show('home');
}

function selectStar(n) {
  selectedStars = n;
  const labels  = ['Terrible','Poor','Okay','Good','Excellent'];
  document.getElementById('starLabel').textContent = labels[n-1];
  document.getElementById('starPicker').querySelectorAll('.star').forEach((s, i) => {
    s.classList.toggle('lit', i < n);
  });
}

async function submitRating() {
  if (!selectedStars) return alert('Please select a star rating first.');
  if (!ratingOrderId || !ratingSellerUid) return;

  const existing = await db.collection('ratings')
    .where('orderId','==', ratingOrderId)
    .where('buyerUid','==', currentUser.uid).get();
  if (!existing.empty) { closeRatingModal(); return; }

  const comment = document.getElementById('ratingComment').value.trim().slice(0, 300);
  await db.collection('ratings').add({
    orderId: ratingOrderId, sellerUid: ratingSellerUid,
    buyerUid: currentUser.uid, stars: selectedStars,
    comment, createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  closeRatingModal();
  alert('Thank you for your rating!');
}

/* ════════════════════════════════════════
   CLOUDINARY UPLOAD
════════════════════════════════════════ */
async function uploadFile(folder, file) {
  if (!file) return null;
  if (!file.type.match(/image\/(jpeg|jpg|png|webp)/)) { alert('Only JPG, PNG or WEBP images allowed.'); return null; }
  if (file.size > 5 * 1024 * 1024) { alert('File must be under 5MB.'); return null; }

  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', CLOUD_PRESET);
  form.append('folder', 'gamevault/' + folder);

  try {
    const res  = await fetch('https://api.cloudinary.com/v1_1/' + CLOUD_NAME + '/image/upload', { method:'POST', body: form });
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
════════════════════════════════════════ */
function loadAdmin() {

  db.collection('orders').onSnapshot(snap => {
    let total = 0, active = 0, completed = 0, cancelled = 0, earnings = 0;
    snap.forEach(doc => {
      const o = doc.data(); total++;
      if (o.status === 'paid' || o.status === 'paid_waiting_seller') active++;
      if (o.status === 'released')  { completed++; earnings += SERVICE_FEE; }
      if (o.status === 'paid')      earnings += SERVICE_FEE;
      if (o.status === 'cancelled') cancelled++;
    });

    document.getElementById('adminStats').innerHTML =
      statBox('Total Orders', total, '') +
      statBox('Earnings', '$'+earnings, 'green') +
      statBox('Active', active, 'gold') +
      statBox('Completed', completed, '') +
      statBox('Cancelled', cancelled, 'red');

    const panel = document.getElementById('aOrders');
    panel.innerHTML = '';
    if (snap.empty) { panel.innerHTML = '<div class="empty"><p>No orders yet</p></div>'; return; }

    snap.forEach(doc => {
      const o = doc.data();
      const card = document.createElement('div');
      card.className = 'a-card';
      card.innerHTML =
        '<div class="a-card-top"><span class="a-id">ORDER #' + esc(doc.id.slice(-6).toUpperCase()) + '</span>' + badge(o.status) + '</div>' +
        aRow('Game',   esc(o.game)) +
        aRow('Price',  '<span style="color:var(--accent)">$' + esc(String(o.price)) + '</span>') +
        aRow('Buyer',  '<span style="font-size:12px">' + esc(o.buyer)  + '</span>') +
        aRow('Seller', '<span style="font-size:12px">' + esc(o.seller) + '</span>') +
        (o.serviceProof
          ? aRow('Fee Proof', '<a href="' + esc(o.serviceProof) + '" target="_blank">View screenshot</a>')
          : aRow('Fee Proof', '<span style="color:var(--t3)">Not uploaded yet</span>')) +
        '<div class="a-actions">' +
          '<button class="btn-gold"  onclick="adminMarkPaid(\'' + esc(doc.id) + '\')">Mark Paid</button>' +
          '<button class="btn-green" onclick="adminRelease(\'' + esc(doc.id) + '\',\'' + esc(o.listingId) + '\')">Release</button>' +
          '<button class="btn-red"   onclick="adminCancel(\'' + esc(doc.id) + '\',\'' + esc(o.listingId) + '\')">Cancel</button>' +
          '<button class="btn-red"   onclick="adminSuspend(\'' + esc(o.buyer) + '\')">Suspend Buyer</button>' +
          '<button class="btn-red"   onclick="adminSuspend(\'' + esc(o.seller) + '\')">Suspend Seller</button>' +
        '</div>';
      panel.appendChild(card);
    });
  });

  db.collection('verifications').where('status','==','pending').onSnapshot(snap => {
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
        aRow('Docs', '<a href="' + esc(v.idPhoto) + '" target="_blank">ID Photo</a> &nbsp;&middot;&nbsp;<a href="' + esc(v.selfie) + '" target="_blank">Selfie</a> &nbsp;&middot;&nbsp;<a href="' + esc(v.paymentProof) + '" target="_blank">Fee Proof</a>') +
        '<div class="a-actions">' +
          '<button class="btn-green" onclick="adminApprove(\'' + esc(doc.id) + '\',\'' + esc(v.uid) + '\')">Approve</button>' +
          '<button class="btn-red"   onclick="adminReject(\'' + esc(doc.id) + '\')">Reject</button>' +
        '</div>';
      panel.appendChild(card);
    });
  });

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

  db.collection('reports').where('status','==','open').onSnapshot(snap => {
    const panel = document.getElementById('aReports');
    panel.innerHTML = '';
    if (snap.empty) { panel.innerHTML = '<div class="empty"><p>No open reports</p></div>'; return; }
    snap.forEach(doc => {
      const r = doc.data();
      const card = document.createElement('div');
      card.className = 'a-card';
      card.innerHTML =
        '<div class="a-card-top"><span class="a-id">REPORT</span><span class="badge b-red">Open</span></div>' +
        aRow('Order',       '#' + esc(r.orderId.slice(-6).toUpperCase())) +
        aRow('Reported by', '<span style="font-size:12px">' + esc(r.reportedBy) + '</span>') +
        aRow('Against',     '<span style="font-size:12px">' + esc(r.against) + '</span>') +
        aRow('Reason',      esc(r.reason)) +
        '<div class="a-actions">' +
          '<button class="btn-red"     onclick="adminSuspend(\'' + esc(r.against) + '\')">Suspend User</button>' +
          '<button class="btn-outline" onclick="adminCloseReport(\'' + esc(doc.id) + '\')">Dismiss</button>' +
        '</div>';
      panel.appendChild(card);
    });
  });

  db.collection('users').onSnapshot(snap => {
    const panel = document.getElementById('aUsers');
    panel.innerHTML = '';
    snap.forEach(doc => {
      const u = doc.data();
      const card = document.createElement('div');
      card.className = 'a-card';
      card.innerHTML =
        '<div class="a-card-top">' +
          '<span style="font-size:13px">' + esc(u.phoneNumber || u.email || doc.id) + '</span>' +
          (u.suspended ? '<span class="badge b-red">Suspended</span>' : '<span class="badge b-green">Active</span>') +
        '</div>' +
        aRow('Role',     esc(u.role)) +
        aRow('Verified', u.verified ? 'Yes' : 'No') +
        aRow('Admin',    u.isAdmin  ? 'Yes' : 'No') +
        '<div class="a-actions">' +
          (!u.suspended
            ? '<button class="btn-red"   onclick="adminSuspend(\'' + esc(doc.id) + '\')">Suspend</button>'
            : '<button class="btn-green" onclick="adminUnsuspend(\'' + esc(doc.id) + '\')">Reinstate</button>') +
        '</div>';
      panel.appendChild(card);
    });
  });
}

/* ── Admin actions ── */
async function adminApprove(docId, uid) {
  await db.collection('users').doc(uid).update({ verified: true });
  await db.collection('verifications').doc(docId).update({ status: 'approved' });
  alert('Seller approved.');
}
async function adminReject(docId) {
  await db.collection('verifications').doc(docId).update({ status: 'rejected' });
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
}
async function adminRemoveListing(id) {
  await db.collection('listings').doc(id).update({ status: 'removed', removedAt: new Date() });
}
async function adminActivateListing(id) {
  await db.collection('listings').doc(id).update({ status: 'active' });
}
async function adminSuspend(uid) {
  if (!uid) return;
  if (!confirm('Suspend this account?')) return;
  await db.collection('users').doc(uid).update({ suspended: true, suspendedAt: new Date() });
  alert('Account suspended.');
}
async function adminUnsuspend(uid) {
  if (!uid) return;
  await db.collection('users').doc(uid).update({ suspended: false, suspendedAt: null });
  alert('Account reinstated.');
}
async function adminCloseReport(docId) {
  await db.collection('reports').doc(docId).update({ status: 'closed', closedAt: new Date() });
}
async function adminViewChat(orderId) {
  const logEl = document.getElementById('chatLog-' + orderId);
  if (!logEl) return;
  logEl.innerHTML = '<div style="font-size:12px;color:var(--t3);padding:8px 0">Loading...</div>';
  const msgs = await db.collection('chats').doc(orderId).collection('messages').orderBy('time').get();
  if (msgs.empty) { logEl.innerHTML = '<div style="font-size:12px;color:var(--t3);padding:8px 0">No messages.</div>'; return; }
  logEl.innerHTML = msgs.docs.map(d => {
    const m = d.data();
    return '<div style="padding:5px 0;border-bottom:1px solid var(--bdr);font-size:12px">' +
      '<span style="color:var(--t3)">' + esc(m.sender.slice(0,8)) + '...</span>' +
      '<span style="margin-left:8px;color:var(--t2)">' + esc(m.text || '[image]') + '</span></div>';
  }).join('');
}

/* ════════════════════════════════════════
   NOTIFICATION BADGE
════════════════════════════════════════ */
const SEEN_KEY = 'gv_seen_';
function getLastSeen(orderId) { const v = localStorage.getItem(SEEN_KEY + orderId); return v ? parseInt(v) : 0; }
function markSeen(orderId)    { localStorage.setItem(SEEN_KEY + orderId, Date.now()); }

function clearBadge() {
  updateBadge(0);
  if (!currentUser) return;
  db.collection('orders').where('buyer','==', currentUser.uid).get().then(s => s.forEach(d => markSeen(d.id)));
  db.collection('orders').where('seller','==', currentUser.uid).get().then(s => s.forEach(d => markSeen(d.id)));
}

function updateBadge(count) {
  const b  = document.getElementById('ordersBadge');
  const mb = document.getElementById('mOrdersBadge');
  if (!b || !mb) return;
  if (count > 0) {
    const txt = count > 99 ? '99+' : String(count);
    b.textContent = txt; mb.textContent = txt;
    b.classList.remove('hidden'); mb.classList.remove('hidden');
  } else {
    b.classList.add('hidden'); mb.classList.add('hidden');
  }
}

function startNotifications() {
  if (!currentUser) return;
  const unread = {};

  function recalc() {
    const ordersOpen = !document.getElementById('orders').classList.contains('hidden');
    const chatOpen   = !document.getElementById('chat').classList.contains('hidden');
    updateBadge((ordersOpen || chatOpen) ? 0 : Object.values(unread).reduce((a,b) => a+b, 0));
  }

  function watchChat(orderId) {
    db.collection('chats').doc(orderId).collection('messages').orderBy('time')
      .onSnapshot(snap => {
        let count = 0;
        snap.forEach(doc => {
          const m = doc.data();
          if (m.sender !== currentUser.uid) {
            const t = m.time && m.time.toMillis ? m.time.toMillis() : 0;
            if (t > getLastSeen(orderId)) count++;
          }
        });
        unread[orderId] = count;
        recalc();
      });
  }

  function listenOrders(field) {
    db.collection('orders').where(field,'==', currentUser.uid).onSnapshot(snap => {
      snap.forEach(doc => {
        const s = doc.data().status;
        if (s === 'paid' && !unread.hasOwnProperty(doc.id)) watchChat(doc.id);
        if (s === 'released' || s === 'cancelled') { delete unread[doc.id]; recalc(); }
      });
    });
  }

  listenOrders('buyer');
  listenOrders('seller');
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