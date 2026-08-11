/* ============================================================
   sync.js — optional Firebase Firestore cloud sync.
   • If firebase-config.js has real values -> cross-device realtime sync.
   • Otherwise the app runs fully local (localStorage), unchanged.
   • Works offline: Firestore caches locally and syncs when back online.
   • The whole app state is stored as ONE JSON string in users/{uid}.
   Exposes window.Cloud, used by app.js. Loads the Firebase SDK from the
   gstatic CDN ONLY when sync is configured, so the default build makes
   no external network calls.
   ============================================================ */
(function () {
  'use strict';

  var SDK_VER = '10.12.2';
  var SDK = [
    'https://www.gstatic.com/firebasejs/' + SDK_VER + '/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/' + SDK_VER + '/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/' + SDK_VER + '/firebase-firestore-compat.js'
  ];

  var cfg = window.FIREBASE_CONFIG || null;
  var auth = null, db = null, ref = null, unsub = null;
  var uid = null;
  var status = { configured: false, signedIn: false, email: '', label: 'Local only' };
  var pushTimer = null, offlineOnly = false, started = false;

  function configured() {
    return !!(cfg && cfg.apiKey && String(cfg.apiKey).indexOf('YOUR_') !== 0 &&
      cfg.projectId && String(cfg.projectId).indexOf('YOUR_') !== 0);
  }
  function notify() {
    status.configured = configured();
    try { if (window.__cloudStatusChanged) window.__cloudStatusChanged(); } catch (e) {}
  }
  function setLabel(l) { status.label = l; notify(); }

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.async = false;
      s.onload = function () { res(); };
      s.onerror = function () { rej(new Error('load failed: ' + src)); };
      document.head.appendChild(s);
    });
  }
  function loadSDK() {
    return SDK.reduce(function (p, src) {
      return p.then(function () { return loadScript(src); });
    }, Promise.resolve());
  }

  function pretty(err) {
    var c = (err && err.code) || '';
    if (c.indexOf('wrong-password') >= 0 || c.indexOf('invalid-credential') >= 0) return 'Wrong email or password.';
    if (c.indexOf('user-not-found') >= 0) return 'No account with that email — try Create account.';
    if (c.indexOf('email-already-in-use') >= 0) return 'That email already has an account — use Sign in.';
    if (c.indexOf('weak-password') >= 0) return 'Password must be at least 6 characters.';
    if (c.indexOf('invalid-email') >= 0) return 'That email address looks invalid.';
    if (c.indexOf('network') >= 0) return 'Network error — check your connection.';
    if (c.indexOf('too-many-requests') >= 0) return 'Too many attempts — wait a moment and retry.';
    return (err && err.message) || 'Something went wrong.';
  }

  /* ---- sign-in gate overlay (self-contained) ---- */
  function gate(show, msg) {
    var g = document.getElementById('cloudgate');
    if (!show) { if (g && g.parentNode) g.parentNode.removeChild(g); return; }
    if (g) { if (msg) setGateErr(g, msg); return; }
    g = document.createElement('div');
    g.id = 'cloudgate';
    g.className = 'cloudgate';
    g.innerHTML =
      '<div class="cloudcard">' +
        '<div class="cg-h">Cloud sync</div>' +
        '<div class="cg-s">Sign in to sync your actionables across devices. Use the same account on every device.</div>' +
        '<div class="cg-err" id="cgErr"></div>' +
        '<label class="cg-l">Email</label>' +
        '<input id="cgEmail" type="email" autocomplete="username" placeholder="you@example.com">' +
        '<label class="cg-l">Password</label>' +
        '<input id="cgPass" type="password" autocomplete="current-password" placeholder="At least 6 characters">' +
        '<div class="cg-btns">' +
          '<button class="btn pri" id="cgIn">Sign in</button>' +
          '<button class="btn ghost" id="cgUp">Create account</button>' +
        '</div>' +
        '<button class="cg-skip" id="cgReset">Forgot password?</button>' +
        '<button class="cg-skip" id="cgSkip">Use offline only on this device</button>' +
      '</div>';
    document.body.appendChild(g);

    function busy(b) { g.querySelector('#cgIn').disabled = b; g.querySelector('#cgUp').disabled = b; }
    function creds() { return { e: (g.querySelector('#cgEmail').value || '').trim(), p: g.querySelector('#cgPass').value || '' }; }

    g.querySelector('#cgIn').addEventListener('click', function () {
      var c = creds();
      if (!c.e || !c.p) { setGateErr(g, 'Enter email and password'); return; }
      busy(true); setGateErr(g, '');
      auth.signInWithEmailAndPassword(c.e, c.p).catch(function (err) { busy(false); setGateErr(g, pretty(err)); });
    });
    g.querySelector('#cgUp').addEventListener('click', function () {
      var c = creds();
      if (!c.e || !c.p) { setGateErr(g, 'Enter email and password'); return; }
      if (c.p.length < 6) { setGateErr(g, 'Password must be at least 6 characters'); return; }
      busy(true); setGateErr(g, '');
      auth.createUserWithEmailAndPassword(c.e, c.p).catch(function (err) { busy(false); setGateErr(g, pretty(err)); });
    });
    g.querySelector('#cgReset').addEventListener('click', function () {
      var c = creds();
      if (!c.e) { setGateErr(g, 'Enter your email above, then tap Forgot password.'); return; }
      auth.sendPasswordResetEmail(c.e)
        .then(function () { setGateErr(g, 'Password reset email sent to ' + c.e + '.'); })
        .catch(function (err) { setGateErr(g, pretty(err)); });
    });
    g.querySelector('#cgSkip').addEventListener('click', function () {
      offlineOnly = true; gate(false); setLabel('Offline only (this device)');
    });
    if (msg) setGateErr(g, msg);
    setTimeout(function () { var i = g.querySelector('#cgEmail'); if (i) i.focus(); }, 80);
  }
  function setGateErr(g, e) {
    var el = g.querySelector('#cgErr');
    if (!el) return;
    el.textContent = e || '';
    el.style.display = e ? 'block' : 'none';
  }

  /* ---- firestore realtime sync ---- */
  function subscribe() {
    if (!uid) return;
    ref = db.collection('users').doc(uid);
    setLabel('Connecting\u2026');
    unsub = ref.onSnapshot(function (snap) {
      if (!snap.exists) { pushNow(); setLabel('Synced'); return; }
      if (snap.metadata.hasPendingWrites) return;              // our own local echo — ignore
      var data = snap.data() || {};
      var incoming = data.json || '';
      if (!incoming) { pushNow(); return; }
      var cur = '';
      try { cur = JSON.stringify(window.__getState()); } catch (e) {}
      var cached = snap.metadata.fromCache;
      if (incoming === cur) { setLabel(cached ? 'Offline (cached)' : 'Synced'); return; }
      try {
        var obj = JSON.parse(incoming);
        window.__applyCloudState(obj);                          // adopt remote change
        setLabel(cached ? 'Offline (cached)' : 'Synced');
      } catch (e) {}
    }, function () { setLabel('Sync error'); });
  }
  function pushNow() {
    if (!ref) return;
    try {
      var json = JSON.stringify(window.__getState());
      ref.set({ json: json, updatedAt: Date.now() }).catch(function () {});
    } catch (e) {}
  }

  var Cloud = {
    configured: configured,
    status: function () {
      return { configured: configured(), signedIn: status.signedIn, email: status.email, label: status.label };
    },
    /* Called by app.js saveState() on every change — debounced write. */
    push: function () {
      if (!ref) return;
      if (pushTimer) clearTimeout(pushTimer);
      pushTimer = setTimeout(function () { pushTimer = null; pushNow(); }, 450);
    },
    signOut: function () { if (auth) auth.signOut(); },
    init: function () {
      if (started) return; started = true;
      notify();
      if (!configured()) { setLabel('Local only'); return; }
      setLabel('Loading\u2026');
      loadSDK().then(function () {
        firebase.initializeApp(cfg);
        auth = firebase.auth();
        db = firebase.firestore();
        try { db.enablePersistence({ synchronizeTabs: true }).catch(function () {}); } catch (e) {}
        auth.onAuthStateChanged(function (user) {
          if (user) {
            uid = user.uid;
            status.signedIn = true; status.email = user.email || '';
            gate(false);
            subscribe();
          } else {
            uid = null; status.signedIn = false; status.email = '';
            if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
            ref = null;
            if (!offlineOnly) { gate(true); setLabel('Signed out'); }
            else setLabel('Offline only (this device)');
          }
        });
      }).catch(function () {
        // SDK could not load (offline / blocked). App keeps working locally.
        setLabel('Sync unavailable (offline)');
      });
    }
  };

  window.Cloud = Cloud;
})();
