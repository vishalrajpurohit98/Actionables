/* Empty starting data — safe for a PUBLIC GitHub Pages site.
   Your real data is NOT stored here. Bring it in either by:
     • turning on Firebase sync (Settings shows a sign-in) — data is protected by login, or
     • Settings -> Import backup (paste/select a JSON backup).
   See FIREBASE-SYNC.md. */
'use strict';
window.buildSeed = function (nowTs) {
  return {
    version: 3,
    projects: [],
    people: [],
    actionables: [],
    settings: {
      userName: 'Me',
      notifEnabled: false, notifHour: 9, notifMinute: 0, notifSeenDate: '',
      theme: 'dark', accent: 'blue', font: 'default'
    }
  };
};
