/* Sign-up rules, shared by the web page (demo mode) and the Google Apps Script backend.
   Times are plain "YYYY-MM-DDTHH:mm" strings in the studio's local time, compared as text. */
var PilatesCore = (function () {
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function addDays(stamp, days) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(stamp || '');
    if (!m) return '';
    var d = new Date(Date.UTC(+m[1], m[2] - 1, +m[3] + days, +m[4], +m[5]));
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) +
      'T' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
  }

  function isStamp(s) { return typeof s === 'string' && addDays(s, 0) === s; }
  function emptyState() { return { classes: [], nextId: 1 }; }
  function fail(msg) { var e = new Error(msg); e.friendly = true; throw e; }
  function cleanName(n) { return String(n || '').replace(/\s+/g, ' ').trim().slice(0, 30); }

  function findClass(state, id) {
    for (var i = 0; i < state.classes.length; i++) if (state.classes[i].id === id) return state.classes[i];
    fail('That class is no longer on the schedule.');
  }

  function addSignup(state, c, name, token) {
    name = cleanName(name);
    if (!name) fail('Add your name first.');
    for (var i = 0; i < c.signups.length; i++) {
      var s = c.signups[i];
      if (token && s.token === token) fail('You are already on the list for this class.');
      if (s.name.toLowerCase() === name.toLowerCase())
        fail('There is already a ' + s.name + ' on this list. Add a last initial so we can tell you apart.');
    }
    c.signups.push({ id: state.nextId++, name: name, token: token || '' });
  }

  function view(state, token, now) {
    var today = now.slice(0, 10);
    var list = state.classes.filter(function (c) { return c.start.slice(0, 10) >= today; });
    list.sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : a.id - b.id; });
    return {
      now: now,
      classes: list.map(function (c) {
        return {
          id: c.id, title: c.title, start: c.start, spots: c.spots, opensAt: c.opensAt || '',
          signups: c.signups.map(function (s) {
            return { id: s.id, name: s.name, mine: !!token && s.token === token };
          })
        };
      })
    };
  }

  function apply(state, req, now, adminPin) {
    var a = req.action, c, i;
    var admin = { checkPin: 1, addClass: 1, deleteClass: 1, removeSignup: 1, addName: 1, copyWeek: 1 };
    if (admin[a] && String(req.pin || '') !== String(adminPin)) fail('That PIN is not right.');

    if (a === 'list' || a === 'checkPin') return false;

    if (a === 'signup') {
      if (!req.token || String(req.token).length < 8) fail('Please reload the page and try again.');
      c = findClass(state, req.classId);
      if (c.start <= now) fail('This class has already started.');
      if (c.opensAt && c.opensAt > now) fail('Sign-up for this class is not open yet.');
      addSignup(state, c, req.name, String(req.token));
      return true;
    }
    if (a === 'cancel') {
      c = findClass(state, req.classId);
      for (i = 0; i < c.signups.length; i++) {
        if (req.token && c.signups[i].token === req.token) { c.signups.splice(i, 1); return true; }
      }
      fail('You are not on the list for this class.');
    }
    if (a === 'addClass') {
      var spots = parseInt(req.spots, 10);
      if (!isStamp(req.start)) fail('Pick a date and time for the class.');
      if (!(spots >= 1 && spots <= 50)) fail('Spots should be a number from 1 to 50.');
      if (req.opensAt && !isStamp(req.opensAt)) fail('Pick the date and time sign-up opens.');
      state.classes.push({
        id: state.nextId++, title: cleanName(req.title) || 'Pilates', start: req.start,
        spots: spots, opensAt: req.opensAt || '', signups: []
      });
      return true;
    }
    if (a === 'deleteClass') {
      c = findClass(state, req.classId);
      state.classes.splice(state.classes.indexOf(c), 1);
      return true;
    }
    if (a === 'removeSignup') {
      c = findClass(state, req.classId);
      for (i = 0; i < c.signups.length; i++) {
        if (c.signups[i].id === req.signupId) { c.signups.splice(i, 1); return true; }
      }
      fail('That name is already off the list.');
    }
    if (a === 'addName') {
      addSignup(state, findClass(state, req.classId), req.name, '');
      return true;
    }
    if (a === 'copyWeek') {
      if (req.opensAt && !isStamp(req.opensAt)) fail('Pick the date and time sign-up opens.');
      if (!state.classes.length) fail('There are no classes to repeat yet. Add one first.');
      var latest = state.classes.reduce(function (m, k) { return k.start > m ? k.start : m; }, '');
      var from = addDays(latest, -7).slice(0, 10);
      var source = state.classes.filter(function (k) { return k.start.slice(0, 10) > from; });
      source.forEach(function (k) {
        state.classes.push({
          id: state.nextId++, title: k.title, start: addDays(k.start, 7), spots: k.spots,
          opensAt: req.opensAt || '', signups: []
        });
      });
      return true;
    }
    fail('Unknown request.');
  }

  /* Runs one request against the state (mutating it). Returns { ok, changed, data | error }. */
  function handle(state, req, now, adminPin) {
    try {
      var changed = apply(state, req || {}, now, adminPin);
      if (changed) {
        var cutoff = addDays(now, -21);
        state.classes = state.classes.filter(function (c) { return c.start >= cutoff; });
      }
      return { ok: true, changed: changed, data: view(state, req && req.token, now) };
    } catch (e) {
      if (!e.friendly) throw e;
      return { ok: false, changed: false, error: e.message, data: view(state, req && req.token, now) };
    }
  }

  return { handle: handle, emptyState: emptyState, addDays: addDays };
})();
if (typeof module !== 'undefined') module.exports = PilatesCore;
