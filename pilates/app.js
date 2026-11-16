(function () {
  var C = window.STUDIO || {};
  var Core = PilatesCore;
  var root = document.getElementById('app');
  var toastEl = document.getElementById('toast');
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var LS = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function nowStamp() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function parts(stamp) {
    var d = new Date(+stamp.slice(0, 4), stamp.slice(5, 7) - 1, +stamp.slice(8, 10));
    var h = +stamp.slice(11, 13);
    return {
      day: DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate(),
      time: (h % 12 || 12) + ':' + stamp.slice(14, 16), ampm: h < 12 ? 'AM' : 'PM'
    };
  }
  function when(stamp) { var p = parts(stamp); return p.day + ' at ' + p.time + ' ' + p.ampm; }

  var token = LS.get('pp_token');
  if (!token) {
    token = '';
    var bytes = new Uint8Array(16);
    try { crypto.getRandomValues(bytes); } catch (e) { for (var b = 0; b < 16; b++) bytes[b] = Math.random() * 256; }
    for (var t = 0; t < 16; t++) token += pad(bytes[t].toString(16)).slice(-2);
    LS.set('pp_token', token);
  }

  /* ---------- storage: the real backend if configured, otherwise a demo that lives on this device ---------- */
  var demo = !C.apiUrl;
  var demoState = null;
  function seed() {
    var n = nowStamp(), day = function (k, hm) { return Core.addDays(n.slice(0, 10) + 'T' + hm, k); };
    return {
      nextId: 20,
      classes: [
        { id: 1, title: 'Reformer', start: day(1, '09:00'), spots: 5, opensAt: '', signups: [
          { id: 10, name: 'Maya', token: '' }, { id: 11, name: 'Jo', token: '' }, { id: 12, name: 'Priya', token: '' }] },
        { id: 2, title: 'Reformer', start: day(1, '17:30'), spots: 5, opensAt: '', signups: [
          { id: 13, name: 'Dana', token: '' }, { id: 14, name: 'Maya', token: '' }, { id: 15, name: 'Renee', token: '' },
          { id: 16, name: 'Kat', token: '' }, { id: 17, name: 'Sam', token: '' }, { id: 18, name: 'Jo', token: '' }] },
        { id: 3, title: 'Mat + stretch', start: day(3, '09:00'), spots: 5, opensAt: day(1, '19:00'), signups: [] },
        { id: 4, title: 'Reformer', start: day(4, '10:00'), spots: 5, opensAt: '', signups: [] }
      ]
    };
  }
  function send(req) {
    req.token = token;
    if (ui.pin) req.pin = ui.pin;
    if (!demo) {
      return fetch(C.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(req) })
        .then(function (r) { return r.json(); });
    }
    if (!demoState) {
      try { demoState = JSON.parse(LS.get('pp_demo')); } catch (e) {}
      if (!demoState || !demoState.classes) demoState = seed();
    }
    var res = Core.handle(demoState, req, nowStamp(), C.demoPin || '1234');
    if (res.changed) LS.set('pp_demo', JSON.stringify(demoState));
    return Promise.resolve(res);
  }

  /* ---------- state ---------- */
  var tomorrow = Core.addDays(nowStamp(), 1).slice(0, 10);
  var ui = {
    name: LS.get('pp_name') || '', pin: '', pinTry: '', confirm: '', busy: false, loaded: false, failed: false,
    form: { date: tomorrow, time: '09:00', title: 'Reformer', spots: '5', opens: 'now', opensAt: tomorrow + 'T19:00' },
    addName: {}
  };
  var data = { now: nowStamp(), classes: [] };
  var lastJson = '';
  function isAdmin() { return location.hash === '#instructor'; }

  function toast(msg) {
    toastEl.innerHTML = '<span>' + esc(msg) + '</span>';
    toastEl.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { toastEl.hidden = true; }, 4000);
  }
  function act(req, okMsg) {
    if (ui.busy) return;
    ui.busy = true; ui.confirm = '';
    return send(req).then(function (res) {
      ui.busy = false; ui.loaded = true; ui.failed = false;
      if (res.data) data = res.data;
      if (res.ok) { if (okMsg) toast(okMsg); } else toast(res.error || 'Something went wrong. Try again.');
      render();
      return res;
    }, function () {
      ui.busy = false; ui.failed = true;
      toast('Could not reach the schedule. Check your connection and try again.');
      render();
    });
  }
  function refresh() {
    var el = document.activeElement;
    if (ui.busy || (el && /INPUT|SELECT/.test(el.tagName))) return;
    send({ action: 'list' }).then(function (res) {
      ui.loaded = true; ui.failed = false;
      if (res.data) data = res.data;
      render(true);
    }, function () { if (!ui.loaded) { ui.failed = true; render(); } });
  }

  /* ---------- rendering ---------- */
  function mats(c) {
    var taken = Math.min(c.signups.length, c.spots), mine = -1, h = '';
    c.signups.forEach(function (s, i) { if (s.mine) mine = i; });
    for (var i = 0; i < c.spots; i++)
      h += '<span class="mat' + (i < taken ? ' taken' : '') + (i === mine ? ' mine' : '') + '"></span>';
    var open = c.spots - taken;
    return '<div class="mats" role="img" aria-label="' + open + ' of ' + c.spots + ' spots open">' + h +
      '<span class="count">' + (open ? open + ' of ' + c.spots + ' open' : 'Full') + '</span></div>';
  }
  function confirmBtn(key, label, cls, attrs) {
    var armed = ui.confirm === key;
    return '<button class="' + cls + '" data-act="' + (armed ? attrs.act : 'arm') + '" data-key="' + key + '" data-id="' + attrs.id +
      '"' + (attrs.sid ? ' data-sid="' + attrs.sid + '"' : '') + '>' + (armed ? 'Tap again to confirm' : label) + '</button>';
  }
  function studentBody(c) {
    var idx = -1;
    c.signups.forEach(function (s, i) { if (s.mine) idx = i; });
    var names = c.signups.slice(0, c.spots).map(function (s) { return s.mine ? '<b>' + esc(s.name) + ' (you)</b>' : esc(s.name); });
    var wait = c.signups.slice(c.spots).map(function (s) { return s.mine ? '<b>' + esc(s.name) + ' (you)</b>' : esc(s.name); });
    var h = '';
    if (names.length) h += '<div class="names">' + names.join(', ') +
      (wait.length ? '<br><span class="w">Waitlist: ' + wait.join(', ') + '</span>' : '') + '</div>';
    h += '<div class="actions">';
    if (idx >= 0) {
      h += idx < c.spots ? '<span class="pill">You have a spot</span>'
        : '<span class="pill wait">Waitlist #' + (idx - c.spots + 1) + '. You move up if someone cancels.</span>';
      h += confirmBtn('cancel' + c.id, 'Cancel my spot', 'quiet', { act: 'cancel', id: c.id });
    } else if (c.start <= data.now) {
      h += '<span class="pill">Started</span>';
    } else if (c.opensAt && c.opensAt > data.now) {
      h += '<button class="ghost" disabled>Opens ' + when(c.opensAt) + '</button>';
    } else if (c.signups.length >= c.spots) {
      h += '<button class="waitbtn" data-act="signup" data-id="' + c.id + '">Join waitlist</button>';
    } else {
      h += '<button class="primary" data-act="signup" data-id="' + c.id + '">Take a spot</button>';
    }
    return h + '</div>';
  }
  function adminBody(c) {
    var h = '';
    if (c.opensAt && c.opensAt > data.now) h += '<div class="names">Sign-up opens ' + when(c.opensAt) + '</div>';
    h += '<ul class="roster">' + c.signups.map(function (s, i) {
      return '<li' + (i >= c.spots ? ' class="w"' : '') + '><span>' + esc(s.name) + (i >= c.spots ? ' (waitlist)' : '') + '</span>' +
        confirmBtn('rm' + s.id, 'Remove', 'quiet', { act: 'removeSignup', id: c.id, sid: s.id }) + '</li>';
    }).join('') + '</ul>';
    h += '<div class="addname"><input id="add-' + c.id + '" data-add="' + c.id + '" placeholder="Add a name yourself" aria-label="Add a name to this class" value="' +
      esc(ui.addName[c.id] || '') + '"><button class="ghost" data-act="addName" data-id="' + c.id + '">Add</button></div>';
    h += '<div class="actions">' + confirmBtn('del' + c.id, 'Delete class', 'quiet danger', { act: 'deleteClass', id: c.id }) + '</div>';
    return h;
  }
  function classList(admin) {
    if (!ui.loaded) return '<p class="empty">' + (ui.failed ? 'Could not load the schedule. Check your connection and reload.' : 'Loading the schedule…') + '</p>';
    if (!data.classes.length) return '<p class="empty">' + (admin ? 'No classes yet. Add your first one above.'
      : 'No classes are posted yet. Check back soon.') + '</p>';
    var h = '', last = '';
    data.classes.forEach(function (c) {
      var p = parts(c.start);
      if (p.day !== last) { h += '<h2 class="day">' + p.day + '</h2>'; last = p.day; }
      h += '<div class="class"><div class="time">' + p.time + '<small>' + p.ampm + '</small></div><div class="body">' +
        '<div class="title">' + esc(c.title) + '</div>' + mats(c) + (admin ? adminBody(c) : studentBody(c)) + '</div></div>';
    });
    return h;
  }
  function shareText() {
    var opens = '';
    data.classes.forEach(function (c) { if (c.opensAt > data.now && c.opensAt > opens) opens = c.opensAt; });
    return 'New classes are posted! ' + (opens ? 'Sign-up opens ' + when(opens) + '. ' : '') +
      'Pick your spots here whenever you have a minute. If a class is full you can join the waitlist: ' +
      (C.shareUrl || location.href.split('#')[0]);
  }
  function field(label, key, type, extra) {
    return '<label>' + label + '<input id="f-' + key + '" type="' + type + '" data-bind="' + key + '" value="' + esc(ui.form[key]) + '"' + (extra || '') + '></label>';
  }
  function adminView() {
    if (!ui.pin) {
      return '<header><p class="eyebrow">Instructor</p><h1>Enter your PIN</h1></header>' +
        '<div class="panel"><label>PIN<input id="pin" type="password" inputmode="numeric" autocomplete="off" data-pin value="' + esc(ui.pinTry) + '"></label>' +
        (demo ? '<div class="note">Demo mode: the PIN is ' + esc(C.demoPin || '1234') + '.</div>' : '') +
        '<div class="actions"><button class="primary" data-act="checkPin">Open</button><button class="quiet" data-act="home">Back to sign-up</button></div></div>';
    }
    var f = ui.form;
    return '<header><p class="eyebrow">Instructor</p><h1>Your schedule</h1></header>' +
      '<div class="panel"><h2>Add a class</h2><div class="row">' +
      field('Date', 'date', 'date') + field('Time', 'time', 'time') + '</div><div class="row">' +
      field('Class name', 'title', 'text') + field('Spots', 'spots', 'number', ' min="1" max="50" inputmode="numeric"') + '</div><div class="row">' +
      '<label>Sign-up opens<select id="f-opens" data-bind="opens"><option value="now"' + (f.opens === 'now' ? ' selected' : '') +
      '>Right away</option><option value="at"' + (f.opens === 'at' ? ' selected' : '') + '>At a set time</option></select></label>' +
      (f.opens === 'at' ? field('Opens at', 'opensAt', 'datetime-local') : '') + '</div>' +
      '<div class="actions"><button class="primary" data-act="addClass">Add class</button>' +
      '<button class="ghost" data-act="copyWeek">Repeat last week</button></div>' +
      '<div class="names">Repeat last week copies your most recent week of classes forward 7 days, with empty lists.</div></div>' +
      '<div class="panel"><h2>Text for your clients</h2><div class="msg" id="msg">' + esc(shareText()) + '</div>' +
      '<div class="actions"><button class="ghost" data-act="copy">Copy text</button></div></div>' +
      '<div class="list">' + classList(true) + '</div>' +
      '<footer><button class="quiet" data-act="home">Back to sign-up</button></footer>';
  }
  function studentView() {
    return '<header><p class="eyebrow">' + esc(C.studioName || 'Pilates Studio') + '</p><h1>Class sign-up</h1>' +
      '<p class="lede">Pick a spot any time. If a class is full, join the waitlist and you move up when someone cancels.</p></header>' +
      (demo ? '<div class="note">Demo mode: these classes and names are examples, and sign-ups stay on this device.</div>' : '') +
      '<label>Your name<input id="name" data-name autocomplete="given-name" maxlength="30" placeholder="First name" value="' + esc(ui.name) + '"></label>' +
      '<div class="list">' + classList(false) + '</div>' +
      '<footer><button class="quiet" data-act="admin">Instructor</button></footer>';
  }
  function render(onlyIfChanged) {
    var html = isAdmin() ? adminView() : studentView();
    if (onlyIfChanged && html === lastJson) return;
    lastJson = html;
    var el = document.activeElement, id = el && el.id, pos = el && el.selectionStart;
    root.innerHTML = html;
    if (id) {
      var again = document.getElementById(id);
      if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (e) {} }
    }
  }

  /* ---------- events ---------- */
  root.addEventListener('input', function (e) {
    var el = e.target;
    if (el.hasAttribute('data-name')) { ui.name = el.value; LS.set('pp_name', el.value.trim()); }
    else if (el.hasAttribute('data-pin')) ui.pinTry = el.value;
    else if (el.dataset.add) ui.addName[el.dataset.add] = el.value;
    else if (el.dataset.bind) { ui.form[el.dataset.bind] = el.value; if (el.dataset.bind === 'opens') render(); }
  });
  root.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    if (e.target.hasAttribute('data-pin')) checkPin();
    else if (e.target.dataset.add) addName(+e.target.dataset.add);
  });
  function checkPin() {
    ui.pin = ui.pinTry;
    act({ action: 'checkPin' }).then(function (res) {
      if (!res || !res.ok) { ui.pin = ''; render(); }
    });
  }
  function addName(id) {
    var name = ui.addName[id] || '';
    act({ action: 'addName', classId: id, name: name }).then(function (res) {
      if (res && res.ok) { ui.addName[id] = ''; render(); }
    });
  }
  root.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn || btn.disabled) return;
    var a = btn.dataset.act, id = +btn.dataset.id, f = ui.form;
    var opensAt = f.opens === 'at' ? f.opensAt : '';
    if (a === 'arm') {
      ui.confirm = btn.dataset.key; render();
      clearTimeout(ui.armT);
      ui.armT = setTimeout(function () { ui.confirm = ''; render(); }, 4000);
    } else if (a === 'signup') {
      if (!ui.name.trim()) { toast('Add your name first.'); document.getElementById('name').focus(); return; }
      act({ action: 'signup', classId: id, name: ui.name }).then(function (res) {
        if (!res || !res.ok) return;
        var c = data.classes.filter(function (k) { return k.id === id; })[0];
        var i = c ? c.signups.map(function (s) { return s.mine; }).indexOf(true) : 0;
        toast(c && i >= c.spots ? 'You are on the waitlist.' : 'You have a spot. See you there!');
      });
    } else if (a === 'cancel') act({ action: 'cancel', classId: id }, 'Your spot is released.');
    else if (a === 'admin') { location.hash = 'instructor'; }
    else if (a === 'home') { location.hash = ''; }
    else if (a === 'checkPin') checkPin();
    else if (a === 'addClass') act({ action: 'addClass', title: f.title, start: f.date + 'T' + f.time, spots: f.spots, opensAt: opensAt }, 'Class added.');
    else if (a === 'copyWeek') act({ action: 'copyWeek', opensAt: opensAt }, 'Last week is copied forward.');
    else if (a === 'deleteClass') act({ action: 'deleteClass', classId: id }, 'Class deleted.');
    else if (a === 'removeSignup') act({ action: 'removeSignup', classId: id, signupId: +btn.dataset.sid }, 'Removed.');
    else if (a === 'addName') addName(id);
    else if (a === 'copy') {
      var text = document.getElementById('msg').textContent;
      var select = function () { getSelection().selectAllChildren(document.getElementById('msg')); toast('Text selected. Copy it from here.'); };
      try { navigator.clipboard.writeText(text).then(function () { toast('Copied. Paste it into your group text.'); }, select); } catch (err) { select(); }
    }
  });
  window.addEventListener('hashchange', function () { render(); scrollTo(0, 0); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
  setInterval(refresh, 20000);

  render();
  refresh();
})();
