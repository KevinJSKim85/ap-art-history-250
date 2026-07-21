/* ================= AP Art History 250 — study app ================= */
(function () {
  "use strict";

  var WORKS = (window.APAH_WORKS || []).slice();
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64); }
  // w.id = array index (used in #/work/<id> URLs); w.key = stable slug used as the
  // saved-progress key, so reordering or updating the dataset never misaligns history.
  WORKS.forEach(function (w, i) { w.id = i; w.key = slug(w.title + "|" + (w.artist || "")); });

  var AREA_NAMES = {
    1: "Global Prehistory", 2: "Ancient Mediterranean", 3: "Early Europe & Colonial Americas",
    4: "Later Europe & Americas", 5: "Indigenous Americas", 6: "Africa",
    7: "West & Central Asia", 8: "South, East & Southeast Asia", 9: "The Pacific",
    10: "Global Contemporary"
  };
  var AREA_SPAN = {
    1: "30,000–500 BCE", 2: "3500 BCE–300 CE", 3: "200–1750 CE", 4: "1750–1980 CE",
    5: "1000 BCE–1980 CE", 6: "1100–1980 CE", 7: "500 BCE–1980 CE",
    8: "300 BCE–1980 CE", 9: "700–1980 CE", 10: "1980 CE–present"
  };

  /* ---------- spaced repetition (SM-2) ---------- */
  var LS_KEY = "apah250.srs.v2";
  var DAY = 86400000;
  var srs = load();
  function load() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; } }
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(srs)); } catch (e) {} }
  function cardOf(id) {
    if (!srs[id]) srs[id] = { ease: 2.5, interval: 0, reps: 0, due: 0, lapses: 0, seen: false };
    return srs[id];
  }
  // quality: 1 again, 3 hard, 4 good, 5 easy
  function review(id, q) {
    var c = cardOf(id), now = Date.now();
    c.seen = true;
    if (q < 3) {
      c.reps = 0; c.interval = 0; c.lapses++;
      c.due = now + 60000; // ~1 min, resurfaces this session
    } else {
      if (c.reps === 0) c.interval = 1;
      else if (c.reps === 1) c.interval = 6;
      else c.interval = Math.round(c.interval * c.ease);
      if (q === 3) c.interval = Math.max(1, Math.round(c.interval * 0.7));
      if (q === 5) c.interval = Math.round(c.interval * 1.15);
      c.reps++;
      c.due = now + c.interval * DAY;
    }
    c.ease = Math.max(1.3, c.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
    save();
  }
  function stats() {
    var learned = 0, due = 0, newc = 0;
    WORKS.forEach(function (w) {
      var c = srs[w.key];
      if (!c || !c.seen) { newc++; return; }
      if (c.due <= Date.now()) due++;
      if (c.interval >= 7) learned++;
    });
    return { learned: learned, due: due, "new": newc, total: WORKS.length };
  }

  /* ---------- helpers ---------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var app = $("#app");
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function imgTag(w, cls) {
    if (w.image_url) {
      return '<img loading="lazy" src="' + esc(w.image_url) + '" alt="' + esc(w.title) + '" ' +
        'data-orig="' + esc(w.image_url) + '" onerror="APAH_imgErr(this)">' +
        '<div class="ph" style="display:none">Image unavailable</div>';
    }
    return '<div class="ph">No image</div>';
  }
  // Retry a failed image a few times (transient 429/timeout) before giving up.
  window.APAH_imgErr = function (img) {
    var n = +(img.getAttribute("data-retry") || 0);
    var orig = img.getAttribute("data-orig") || img.src;
    if (n < 3) {
      img.setAttribute("data-retry", n + 1);
      setTimeout(function () {
        img.src = orig + (orig.indexOf("?") >= 0 ? "&" : "?") + "_r=" + (n + 1);
      }, 700 * (n + 1));
    } else {
      img.style.display = "none";
      var ph = img.nextElementSibling;
      if (ph && ph.classList.contains("ph")) ph.style.display = "flex";
    }
  };
  var toastT;
  function toast(msg) {
    var t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("show"); }, 1800);
  }

  /* ---------- router (uses browser history) ---------- */
  function go(hash) { if (location.hash !== hash) location.hash = hash; else render(); }
  // Replace the current history entry instead of pushing a new one (keeps
  // search-as-you-type from stacking a Back-button entry per keystroke).
  function goReplace(hash) {
    if (location.hash === hash) { render(); return; }
    location.replace(location.pathname + location.search + hash);
  }
  window.addEventListener("hashchange", render);

  function parseRoute() {
    var h = location.hash.replace(/^#\/?/, "");
    var parts = h.split("/");
    return { view: parts[0] || "home", arg: parts[1] ? decodeURIComponent(parts[1]) : "" };
  }

  /* ---------- search ---------- */
  var searchEl = $("#search");
  var searchT;
  searchEl.addEventListener("input", function () {
    clearTimeout(searchT);
    var q = searchEl.value.trim();
    searchT = setTimeout(function () {
      var inSearch = parseRoute().view === "search";
      // Push one entry when entering search; replace while refining or clearing,
      // so the whole search occupies a single Back-button step.
      if (q) { if (inSearch) goReplace("#/search/" + encodeURIComponent(q)); else go("#/search/" + encodeURIComponent(q)); }
      else if (inSearch) goReplace("#/browse");
    }, 180);
  });
  function matches(w, q) {
    q = q.toLowerCase();
    return [w.title, w.artist, w.culture, w.location, w.date, w.content_area_name, w.medium]
      .join(" ").toLowerCase().indexOf(q) >= 0;
  }

  /* ---------- tabs active state ---------- */
  function setTab(view) {
    document.querySelectorAll(".tab").forEach(function (t) {
      t.classList.toggle("active", t.dataset.view === view);
    });
  }

  /* ---------- views ---------- */
  function viewHome() {
    setTab("home");
    var s = stats();
    var pct = s.total ? Math.round((s.learned / s.total) * 100) : 0;
    var areas = {};
    WORKS.forEach(function (w) {
      var a = w.content_area;
      if (!areas[a]) areas[a] = { total: 0, learned: 0 };
      areas[a].total++;
      var c = srs[w.key]; if (c && c.interval >= 7) areas[a].learned++;
    });
    var areaCards = Object.keys(areas).sort(function (a, b) { return a - b; }).map(function (a) {
      var d = areas[a], p = d.total ? Math.round(d.learned / d.total * 100) : 0;
      return '<button class="area-card" onclick="location.hash=\'#/area/' + a + '\'">' +
        '<div class="n">' + a + '</div>' +
        '<b>' + esc(AREA_NAMES[a]) + '</b>' +
        '<div class="meta">' + esc(AREA_SPAN[a]) + ' · ' + d.total + ' works</div>' +
        '<div class="bar"><i style="width:' + p + '%"></i></div>' +
        '</button>';
    }).join("");

    app.innerHTML =
      '<div class="hero">' +
        '<h1>AP Art History · 250 Required Works</h1>' +
        '<p>Study every work in the College Board image set with spaced repetition. Descriptions are in English with a Korean summary. Titles stay in the original.</p>' +
      '</div>' +
      '<div class="stat-row">' +
        '<div class="stat"><div class="k">' + s.total + '</div><div class="l">Total works</div></div>' +
        '<div class="stat due"><div class="k">' + s.due + '</div><div class="l">Due now</div></div>' +
        '<div class="stat learned"><div class="k">' + s.learned + '</div><div class="l">Learned</div></div>' +
        '<div class="stat"><div class="k">' + s["new"] + '</div><div class="l">Not started</div></div>' +
      '</div>' +
      '<div class="progress-shell"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="progress-cap"><span>' + pct + '% learned</span><span>' + s.learned + ' / ' + s.total + '</span></div>' +
      '<div class="cta-row">' +
        '<button class="btn primary" onclick="location.hash=\'#/study\'">▶ Start studying' + (s.due ? " (" + s.due + " due)" : "") + '</button>' +
        '<button class="btn" onclick="location.hash=\'#/browse\'">Browse all works</button>' +
      '</div>' +
      '<div class="section-head"><h2>Content areas</h2><span class="muted">Tap to study one area</span></div>' +
      '<div class="area-grid">' + areaCards + '</div>';
    animateProgress();
  }

  function galleryHTML(list) {
    if (!list.length) return '<div class="empty"><b>No works found</b>Try a different search or filter.</div>';
    return '<div class="gallery">' + list.map(function (w) {
      return '<button class="card" onclick="location.hash=\'#/work/' + w.id + '\'">' +
        '<div class="thumb"><span class="badge">' + w.content_area + '</span>' + imgTag(w) + '</div>' +
        '<div class="body"><b>' + esc(w.title) + '</b>' +
        '<div class="sub">' + esc(w.artist || w.culture || "") + '</div></div>' +
        '</button>';
    }).join("") + '</div>';
  }

  var activeFilter = 0; // 0 = all, else area number
  function viewBrowse() {
    setTab("browse");
    var chips = '<button class="chip' + (activeFilter === 0 ? " active" : "") + '" data-a="0">All ' + WORKS.length + '</button>' +
      Object.keys(AREA_NAMES).map(function (a) {
        var cnt = WORKS.filter(function (w) { return w.content_area == a; }).length;
        return '<button class="chip' + (activeFilter == a ? " active" : "") + '" data-a="' + a + '">' + a + '. ' + esc(AREA_NAMES[a].split(" &")[0]) + ' ' + cnt + '</button>';
      }).join("");
    var list = activeFilter ? WORKS.filter(function (w) { return w.content_area == activeFilter; }) : WORKS;
    app.innerHTML =
      '<div class="hero"><h1>Browse</h1><p>' + WORKS.length + ' works across 10 content areas.</p></div>' +
      '<div class="filterbar">' + chips + '</div>' +
      '<div id="gallery-mount">' + galleryHTML(list) + '</div>';
    document.querySelectorAll(".filterbar .chip").forEach(function (c) {
      c.onclick = function () {
        activeFilter = +c.dataset.a;
        document.querySelectorAll(".filterbar .chip").forEach(function (x) { x.classList.remove("active"); });
        c.classList.add("active");
        var l = activeFilter ? WORKS.filter(function (w) { return w.content_area == activeFilter; }) : WORKS;
        $("#gallery-mount").innerHTML = galleryHTML(l);
        window.scrollTo({ top: 0, behavior: "smooth" });
      };
    });
  }

  function viewArea(a) {
    setTab("");
    a = +a;
    var list = WORKS.filter(function (w) { return w.content_area === a; });
    app.innerHTML =
      '<div class="hero"><h1>' + a + '. ' + esc(AREA_NAMES[a]) + '</h1>' +
      '<p>' + esc(AREA_SPAN[a]) + ' · ' + list.length + ' works</p></div>' +
      '<div class="cta-row"><button class="btn primary" onclick="location.hash=\'#/study/' + a + '\'">▶ Study this area</button>' +
      '<button class="btn" onclick="location.hash=\'#/browse\'">All areas</button></div>' +
      '<div style="height:8px"></div>' + galleryHTML(list);
  }

  function viewSearch(q) {
    setTab("");
    if (searchEl.value !== q) searchEl.value = q;
    var list = WORKS.filter(function (w) { return matches(w, q); });
    app.innerHTML =
      '<div class="hero"><h1>Search</h1><p>' + list.length + ' result' + (list.length === 1 ? "" : "s") + ' for "' + esc(q) + '"</p></div>' +
      galleryHTML(list);
  }

  function viewWork(id) {
    setTab("");
    id = +id;
    var w = WORKS[id];
    if (!w) { app.innerHTML = '<div class="empty"><b>Not found</b></div>'; return; }
    var facts = [
      ["Artist", w.artist], ["Date", w.date], ["Culture", w.culture],
      ["Medium", w.medium], ["Location", w.location]
    ].filter(function (f) { return f[1]; }).map(function (f) {
      return '<div><dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1]) + '</dd></div>';
    }).join("");
    var prev = id > 0 ? id - 1 : -1, next = id < WORKS.length - 1 ? id + 1 : -1;
    app.innerHTML =
      '<div class="detail"><div class="detail-grid">' +
        '<div class="detail-img">' + (w.image_url ?
          '<img src="' + esc(w.image_url) + '" alt="' + esc(w.title) + '" data-orig="' + esc(w.image_url) + '" onerror="APAH_imgErr(this)">' +
          '<div class="ph" style="display:none">Image unavailable</div>' :
          '<div class="ph">No image</div>') + '</div>' +
        '<div class="detail-body">' +
          '<span class="area-tag">Area ' + w.content_area + ' · ' + esc(AREA_NAMES[w.content_area]) + '</span>' +
          '<h1>' + esc(w.title) + '</h1>' +
          '<p class="artist">' + esc(w.artist || w.culture || "") + (w.date ? " · " + esc(w.date) : "") + '</p>' +
          '<dl class="facts">' + facts + '</dl>' +
          '<div class="desc">' +
            '<h3>Description</h3><p>' + esc(w.description_en) + '</p>' +
            (w.description_ko ? '<h3>한국어 설명</h3><p class="ko">' + esc(w.description_ko) + '</p>' : "") +
          '</div>' +
          '<div class="detail-nav">' +
            '<button ' + (prev < 0 ? "disabled" : 'onclick="location.hash=\'#/work/' + prev + '\'"') + '>← ' + (prev < 0 ? "" : esc(trim(WORKS[prev].title))) + '</button>' +
            '<button ' + (next < 0 ? "disabled" : 'onclick="location.hash=\'#/work/' + next + '\'"') + '>' + (next < 0 ? "" : esc(trim(WORKS[next].title))) + ' →</button>' +
          '</div>' +
        '</div>' +
      '</div></div>';
    window.scrollTo({ top: 0 });
  }
  function trim(s) { return s.length > 26 ? s.slice(0, 24) + "…" : s; }

  /* ---------- study session ---------- */
  var session = null; // {queue:[ids], idx, revealed, total, scope}
  function buildQueue(scope) {
    var pool = WORKS.map(function (w) { return w.id; });
    if (scope) pool = pool.filter(function (id) { return WORKS[id].content_area == scope; });
    var due = [], fresh = [];
    pool.forEach(function (id) {
      var c = srs[WORKS[id].key];
      if (!c || !c.seen) fresh.push(id);
      else if (c.due <= Date.now()) due.push(id);
    });
    due.sort(function (a, b) { return srs[WORKS[a].key].due - srs[WORKS[b].key].due; });
    shuffle(fresh);
    var NEW_LIMIT = 20;
    var queue = due.concat(fresh.slice(0, NEW_LIMIT));
    if (!queue.length) queue = fresh.concat(due); // nothing due: review anything
    return queue;
  }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } }

  function viewStudy(scope) {
    setTab(scope ? "" : "study");
    if (!session || session.scope !== (scope || "")) {
      var q = buildQueue(scope);
      session = { queue: q, idx: 0, revealed: false, reviewed: {}, scope: scope || "" };
    }
    renderStudy();
  }
  function renderStudy() {
    if (!session || session.idx >= session.queue.length) {
      var s = stats();
      var reviewedN = session ? Object.keys(session.reviewed).length : 0;
      app.innerHTML =
        '<div class="study"><div class="study-done">' +
          '<div class="big">✓</div><h2>Session complete</h2>' +
          '<p>You reviewed ' + reviewedN + ' work' + (reviewedN === 1 ? "" : "s") + '. ' + s.due + ' still due.</p>' +
          '<div class="cta-row" style="justify-content:center">' +
            (s.due ? '<button class="btn primary" onclick="APAH.restudy()">Keep going</button>' : "") +
            '<button class="btn" onclick="location.hash=\'#/\'">Back to home</button>' +
          '</div>' +
        '</div></div>';
      session = null;
      return;
    }
    var id = session.queue[session.idx], w = WORKS[id];
    var progress = Math.round(session.idx / session.queue.length * 100);
    var meta = [w.date, w.culture, w.location].filter(Boolean).slice(0, 3)
      .map(function (m) { return '<span>' + esc(m) + '</span>'; }).join("");
    var face = session.revealed ?
      '<div class="face">' +
        '<div class="reveal-title">' + esc(w.title) + '</div>' +
        '<div class="reveal-artist">' + esc(w.artist || w.culture || "") + '</div>' +
        '<div class="reveal-meta">' + meta + '</div>' +
        '<div class="reveal-desc"><p>' + esc(w.description_en) + '</p>' +
          (w.description_ko ? '<p class="ko">' + esc(w.description_ko) + '</p>' : "") + '</div>' +
        '<div class="flash-actions"><div class="rate-row">' +
          '<button class="rate again" onclick="APAH.rate(1)"><b>Again</b><small>&lt; 1d</small></button>' +
          '<button class="rate hard" onclick="APAH.rate(3)"><b>Hard</b><small>soon</small></button>' +
          '<button class="rate good" onclick="APAH.rate(4)"><b>Good</b><small>on track</small></button>' +
          '<button class="rate easy" onclick="APAH.rate(5)"><b>Easy</b><small>later</small></button>' +
        '</div></div>' +
        '<div class="hint"><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> to rate</div>' +
      '</div>' :
      '<div class="face">' +
        '<div class="prompt">Identify this work — title, artist, date, and significance.</div>' +
        '<div class="flash-actions"><button class="reveal-btn" onclick="APAH.reveal()">Show answer</button></div>' +
        '<div class="hint">Press <kbd>Space</kbd> to reveal</div>' +
      '</div>';
    app.innerHTML =
      '<div class="study">' +
        '<div class="study-top">' +
          '<span class="counts"><b>' + (session.idx + 1) + '</b> / ' + session.queue.length + (session.scope ? ' · Area ' + session.scope : "") + '</span>' +
          '<span class="study-bar"><i style="width:' + progress + '%"></i></span>' +
          '<button class="nav-btn" title="Exit" onclick="location.hash=\'#/\'">✕</button>' +
        '</div>' +
        '<div class="flash">' +
          '<div class="fig"><span class="tag">Area ' + w.content_area + '</span>' + imgTag(w) + '</div>' +
          face +
        '</div>' +
      '</div>';
  }

  /* ---------- public actions ---------- */
  window.APAH = {
    reveal: function () { if (session) { session.revealed = true; renderStudy(); } },
    rate: function (q) {
      if (!session) return;
      var id = session.queue[session.idx];
      review(WORKS[id].key, q);
      session.reviewed[id] = 1;
      if (q < 3) session.queue.push(id); // requeue lapses to the end of this session
      session.idx++;
      session.revealed = false;
      renderStudy();
    },
    restudy: function () { session = null; go("#/study"); render(); }
  };

  /* ---------- keyboard ---------- */
  document.addEventListener("keydown", function (e) {
    if (document.activeElement === searchEl) return;
    var r = parseRoute();
    if (r.view === "study" && session) {
      if (!session.revealed && (e.code === "Space" || e.key === "Enter")) { e.preventDefault(); APAH.reveal(); }
      else if (session.revealed && ["1", "2", "3", "4"].indexOf(e.key) >= 0) {
        e.preventDefault(); APAH.rate([1, 3, 4, 5][+e.key - 1]);
      }
      else if (session.revealed && e.code === "Space") { e.preventDefault(); } // don't scroll the page
    }
  });

  /* ---------- progress bar animation ---------- */
  function animateProgress() {
    var f = $(".progress-fill"); if (!f) return;
    var target = f.style.width; f.style.width = "0";
    requestAnimationFrame(function () { requestAnimationFrame(function () { f.style.width = target; }); });
  }

  /* ---------- main render ---------- */
  function render() {
    var r = parseRoute();
    if (r.view !== "search" && searchEl.value && document.activeElement !== searchEl) searchEl.value = "";
    switch (r.view) {
      case "home": viewHome(); break;
      case "browse": viewBrowse(); break;
      case "area": viewArea(r.arg); break;
      case "work": viewWork(r.arg); break;
      case "search": viewSearch(r.arg); break;
      case "study": viewStudy(r.arg); break;
      default: viewHome();
    }
  }

  /* ---------- nav buttons ---------- */
  $("#back").onclick = function () { history.back(); };
  $("#fwd").onclick = function () { history.forward(); };
  $("#home-link").onclick = function (e) { e.preventDefault(); go("#/"); };
  document.querySelectorAll(".tab").forEach(function (t) {
    t.onclick = function () { go("#/" + t.dataset.view); };
  });

  /* ---------- theme ---------- */
  var TH = "apah250.theme";
  function applyTheme(t) { document.documentElement.setAttribute("data-theme", t); }
  var saved = null; try { saved = localStorage.getItem(TH); } catch (e) {}
  if (saved) applyTheme(saved);
  $("#theme").onclick = function () {
    // Unset means the page is showing light (there is no auto dark-mode media query),
    // so treat unset as "light" — the first tap always flips to a visibly different theme.
    var cur = document.documentElement.getAttribute("data-theme") || "light";
    var next = cur === "dark" ? "light" : "dark";
    applyTheme(next); try { localStorage.setItem(TH, next); } catch (e) {}
  };

  /* ---------- boot ---------- */
  if (!WORKS.length) {
    app.innerHTML = '<div class="empty"><b>No data loaded</b>works.js did not load or is empty.</div>';
    return;
  }
  render();
})();
