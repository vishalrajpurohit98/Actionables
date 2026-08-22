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
  var uid = null, unlocked = false;
  var readyCbs = [];
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

  /* ---- Biometric unlock (APK only) ----
     Only meaningful for a returning user whose Firebase session is still valid;
     it unlocks the app's local lock screen instead of retyping the password.
     Enabled flag is stored in localStorage so it's readable here independently. */
  function biometricEnabled(){ try { return localStorage.getItem('actionables.biometric') === '1'; } catch(e){ return false; } }
  function biometricSupported(){ try { return !!(window.Android && window.Android.authenticateBiometric && window.Android.biometricAvailable && window.Android.biometricAvailable()); } catch(e){ return false; } }
  function doBiometricUnlock(g){
    if (!biometricSupported()) return;
    window.onBiometricResult = function(ok){
      if (ok) {
        unlocked = true;
        gate(false);
        subscribe();
      } else {
        // fell back or errored — leave the password field available
        if (g) { var sub = g.querySelector('#cgSub'); if (sub) sub.textContent = 'Enter your password to unlock your workspace'; }
      }
    };
    try { window.Android.authenticateBiometric('Unlock Actionables', 'Use your fingerprint or screen lock'); } catch(e){}
  }
  function maybeOfferBiometric(g){
    if (!g || !biometricEnabled() || !biometricSupported()) return;
    // Add a "Use fingerprint" button once.
    if (!g.querySelector('#cgBio')) {
      var btns = g.querySelector('.cg-btns');
      if (btns) {
        var b = document.createElement('button');
        b.className = 'btn ghost lock-bio'; b.id = 'cgBio';
        b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px"><path d="M12 4.5c-3.6 0-6.5 2.6-6.5 6v3"/><path d="M12 4.5c3.6 0 6.5 2.6 6.5 6v5.5"/><path d="M8.5 11.5v2.5a3.5 3.5 0 0 0 7 0v-2.5a3.5 3.5 0 0 0-7 0z"/><path d="M12 12v3"/></svg>Use fingerprint';
        b.addEventListener('click', function(){ doBiometricUnlock(g); });
        btns.appendChild(b);
      }
    }
    var sub = g.querySelector('#cgSub'); if (sub) sub.textContent = 'Unlock with fingerprint, or enter your password';
    // Auto-prompt shortly after the lock screen appears.
    setTimeout(function(){ doBiometricUnlock(g); }, 350);
  }

  /* ---- Actionables lock/login screen ---- */
  function gate(show, msg) {
    var g = document.getElementById('cloudgate');
    document.body.classList.toggle('auth-locked', !!show);
    if (!show) {
      if (g && g.__clockTimer) clearInterval(g.__clockTimer);
      if (g && g.parentNode) g.parentNode.removeChild(g);
      return;
    }
    if (g) { if (msg) setGateErr(g, msg); return; }

    g = document.createElement('div');
    g.id = 'cloudgate';
    g.className = 'cloudgate';
    g.innerHTML =
      '<div class="lock-bg"></div>' +
      '<div class="cloudcard lock-card">' +
        '<div class="lock-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="10" width="13" height="10" rx="2"/><path d="M8 10V7.8a4 4 0 0 1 8 0V10"/></svg></div>' +
        '<div class="cg-h">Actionables</div>' +
        '<div class="lock-user" id="cgUserLabel">Personal workspace</div>' +
        '<div class="cg-s" id="cgSub">Enter your password to continue</div>' +
        '<div class="cg-err" id="cgErr"></div>' +
        '<label class="cg-l">Email</label>' +
        '<div class="lock-field"><input id="cgEmail" type="email" autocomplete="username" placeholder="you@example.com"></div>' +
        '<label class="cg-l">Password</label>' +
        '<div class="lock-field"><input id="cgPass" type="password" autocomplete="current-password" placeholder="Enter your password">' +
          '<button type="button" class="lock-pass-toggle" id="cgEye" aria-label="Show password">' +
            '<svg id="cgEyeSvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12s3.5-5.2 9.5-5.2 9.5 5.2 9.5 5.2-3.5 5.2-9.5 5.2S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.2"/></svg>' +
          '</button></div>' +
        '<div class="cg-btns"><button class="btn pri lock-unlock" id="cgIn">Unlock</button></div>' +
        '<div class="lock-links"><button class="cg-skip" id="cgReset">Forgot password?</button><button class="cg-skip lock-create" id="cgUp">Create account</button></div>' +
        '<div class="lock-secure">Protected by Firebase Authentication</div>' +
      '</div>' +
      '<div class="lock-footer">Developed by <b>Vishal</b> · Personal workspace</div>';
    document.body.appendChild(g);

    function busy(b) {
      g.querySelector('#cgIn').disabled = b;
      g.querySelector('#cgUp').disabled = b;
    }
    function creds() {
      return { e: (g.querySelector('#cgEmail').value || '').trim(), p: g.querySelector('#cgPass').value || '' };
    }
    function togglePassword(){
      var p=g.querySelector('#cgPass'), eye=g.querySelector('#cgEye');
      if(!p||!eye)return;
      var showing=p.type==='text';
      p.type=showing?'password':'text';
      eye.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
      eye.innerHTML=showing
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12s3.5-5.2 9.5-5.2 9.5 5.2 9.5 5.2-3.5 5.2-9.5 5.2S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.2"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3 3 18 18"/><path d="M10.6 5.1A10.5 10.5 0 0 1 12 5c6 0 9.5 7 9.5 7a16 16 0 0 1-3.1 3.7"/><path d="M6.2 6.3C3.9 8 2.5 12 2.5 12s3.5 7 9.5 7c1.2 0 2.3-.2 3.3-.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
    }
    g.querySelector('#cgEye').addEventListener('click', togglePassword);

    g.querySelector('#cgIn').addEventListener('click', function () {
      var c = creds();
      if (!c.e || !c.p) { setGateErr(g, 'Enter your email and password'); return; }
      busy(true); setGateErr(g, '');
      var current = auth && auth.currentUser;
      var action = current && current.email === c.e
        ? current.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(c.e, c.p))
        : auth.signInWithEmailAndPassword(c.e, c.p);
      action.then(function () {
        unlocked = true;
        busy(false);
        gate(false);
        subscribe();
      }).catch(function (err) { busy(false); setGateErr(g, pretty(err)); });
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
      if (!c.e) { setGateErr(g, 'Enter your email above, then choose Forgot password.'); return; }
      auth.sendPasswordResetEmail(c.e)
        .then(function () { setGateErr(g, 'Password reset email sent to ' + c.e + '.'); })
        .catch(function (err) { setGateErr(g, pretty(err)); });
    });
    setTimeout(function () { var i = g.querySelector('#cgEmail'); if (i) i.focus(); }, 120);
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
      var st = window.__getState();
      if (!st || !st.actionables || st.actionables.length === 0) return; /* never upload a blank state that would wipe the other device */
      var json = JSON.stringify(st);
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
    /* First-run silent-login helper for the APK: sign in once to activate sync.
       After this, Firebase persists the session, so future launches are silent. */
    hasSession: function () { return !!(auth && auth.currentUser); },
    signInOnce: function (email, pass) {
      if (!auth) return Promise.reject(new Error('not-ready'));
      return auth.signInWithEmailAndPassword((email||'').trim(), pass||'')
        .then(function () { unlocked = true; subscribe(); setLabel('Synced'); return 'ok'; });
    },
    onReady: function (cb) { readyCbs.push(cb); if (auth) cb(); },
    /* Biometric unlock controls (APK only). */
    biometricSupported: function () { return biometricSupported(); },
    biometricEnabled: function () { return biometricEnabled(); },
    isUnlocked: function () { return unlocked; },
    setBiometric: function (on) {
      try {
        if (on) {
          if (!biometricSupported()) return 'unsupported';
          if (!(auth && auth.currentUser)) return 'signin';   // must be logged in first
          localStorage.setItem('actionables.biometric', '1');
          return 'ok';
        } else {
          localStorage.removeItem('actionables.biometric');
          return 'ok';
        }
      } catch (e) { return 'error'; }
    },
    /* Manual "Sync now": probe the server, push local up, and flip to Synced.
       Forces the round-trip instead of waiting for Firestore's passive confirm. */
    syncNow: function () {
      if (!ref) return Promise.resolve('signin');
      setLabel('Syncing\u2026');
      return new Promise(function (resolve) {
        var done = false;
        var to = setTimeout(function () {
          if (done) return; done = true;
          setLabel('Offline (cached)'); resolve('offline');
        }, 12000);
        ref.get({ source: 'server' }).then(function () {
          if (done) return; done = true; clearTimeout(to);
          pushNow();                 // upload this device's data (guarded: non-empty)
          setLabel('Synced'); resolve('ok');
        }).catch(function () {
          if (done) return; done = true; clearTimeout(to);
          setLabel('Offline (cached)'); resolve('offline');
        });
      });
    },
    init: function () {
      if (started) return; started = true;
      notify();
      if (!configured()) { setLabel('Local only'); return; }
      setLabel('Loading\u2026');
      loadSDK().then(function () {
        firebase.initializeApp(cfg);
        auth = firebase.auth();
        try { readyCbs.forEach(function (cb) { try { cb(); } catch (e) {} }); readyCbs = []; } catch (e) {}
        db = firebase.firestore();
        try { db.enablePersistence({ synchronizeTabs: true }).catch(function () {}); } catch (e) {}
        auth.onAuthStateChanged(function (user) {
          var isApk = !!(window.Android);
          if (user) {
            uid = user.uid;
            status.signedIn = true; status.email = user.email || '';
            if (isApk) {
              /* APK: Firebase session is silent — no Firebase login screen ever.
                 The local PIN/fingerprint lock (in app.js) is the only gate.
                 Just start syncing in the background. */
              unlocked = true;
              subscribe();
              setLabel('Synced');
            } else {
              /* WEB: keep the Firebase password lock each launch. */
              unlocked = false;
              gate(true);
              var g = document.getElementById('cloudgate');
              if (g) {
                var email = g.querySelector('#cgEmail');
                var sub = g.querySelector('#cgSub');
                var up = g.querySelector('#cgUp');
                var reset = g.querySelector('#cgReset');
                if (email) { email.value = user.email || ''; email.readOnly = true; email.setAttribute('aria-readonly','true'); }
                if (sub) sub.textContent = 'Enter your password to unlock your workspace';
                if (up) up.style.display = 'none';
                if (reset) reset.style.display = 'inline-block';
              }
              setLabel('Locked');
            }
          } else {
            uid = null; status.signedIn = false; status.email = ''; unlocked = false;
            if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
            ref = null;
            if (isApk) {
              /* APK, no Firebase session yet: don't show the Firebase gate here.
                 app.js first-run flow will collect email+password via signInOnce()
                 to activate sync, then set the local PIN. */
              setLabel('Sign in to sync');
            } else {
              gate(true); setLabel('Signed out');
              var g = document.getElementById('cloudgate');
              if (g) {
                var email = g.querySelector('#cgEmail');
                var sub = g.querySelector('#cgSub');
                var up = g.querySelector('#cgUp');
                if (email) { email.readOnly = false; email.removeAttribute('aria-readonly'); }
                if (sub) sub.textContent = 'Sign in to access your workspace';
                if (up) up.style.display = '';
              }
            }
          }
        });
      }).catch(function () {
        // On the APK we don't block on Firebase — sync just stays off until next load.
        if (window.Android) { setLabel('Sync offline'); }
        else {
          setLabel('Authentication unavailable');
          gate(true, 'Unable to load authentication. Check your internet connection and reload.');
        }
      });
    }
  };

  window.Cloud = Cloud;
})();
