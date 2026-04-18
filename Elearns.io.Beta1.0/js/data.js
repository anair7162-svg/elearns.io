function saveRt(rd) {
  if (!TK || !S.uid) return;
  sbp("saved_routes", {
    user_id: S.uid,
    distance: rd.distance,
    duration: rd.duration,
    radius: W.rad,
    prefs: W.prefs,
    start_lat: S.startLL.lat,
    start_lng: S.startLL.lng,
    dest_type: W.dest
  }).then(function(res) {
    S.routes.unshift({
      id: (res && res.length) ? res[0].id : Date.now().toString(36),
      ts: new Date().toISOString(),
      distance: rd.distance,
      duration: rd.duration,
      radius: W.rad,
      prefs: JSON.parse(JSON.stringify(W.prefs)),
      startLatLng: {lat: S.startLL.lat, lng: S.startLL.lng},
      destType: W.dest
    });
  });
}

var CHL = ["Residential", "Main Roads", "Highway", "Roundabouts", "Parking", "Hills"];

(function() {
  var c = $("ml-ch");
  CHL.forEach(function(t) {
    var d = document.createElement("div");
    d.className = "ch";
    d.setAttribute("data-v", t.toLowerCase());
    d.textContent = t;
    d.addEventListener("click", function() { d.classList.toggle("on"); });
    c.appendChild(d);
  });
})();

$("adlog").addEventListener("click", function() {
  editingLogIdx = -1;
  $("ml-dt").value = new Date().toISOString().split("T")[0];
  $("ml-du").value = "";
  $("ml-km").value = (S.drivenKm && S.drivenKm > 0) ? S.drivenKm.toFixed(1) : "";
  $("ml-sp").value = S.profile.supervisor || "";
  $("ml-nt").value = "";
  document.querySelectorAll("#ml-ch .ch").forEach(function(c) { c.classList.remove("on"); });
  $("ml").querySelector("h3").innerHTML = icn("edit") + " Log Drive";
  updateLogSaveState();
  $("ml").classList.add("on");
});

$("ml-x").addEventListener("click", function() { editingLogIdx = -1; $("ml").classList.remove("on"); });

function updateLogSaveState() {
  var isGuest = (typeof S_isGuest !== "undefined") && S_isGuest;
  var btn = $("ml-ok");
  if (isGuest) {
    btn.innerHTML = icn("log_in", "sm") + " Sign in to save";
    btn.style.opacity = "";
    btn.style.filter = "";
    btn.disabled = false;
    btn.setAttribute("data-guest", "1");
  } else {
    btn.textContent = editingLogIdx >= 0 ? "Update" : "Save";
    btn.style.opacity = "";
    btn.style.filter = "";
    btn.disabled = false;
    btn.removeAttribute("data-guest");
  }
}

$("ml-ok").addEventListener("click", function() {
  var btn = $("ml-ok");
  var isGuest = (typeof S_isGuest !== "undefined") && S_isGuest;
  if (isGuest || btn.getAttribute("data-guest") === "1") {
    /* Guest pressed save — close modal, stash intent, open signin flow.
       After login, auth.js goes to S._returnTab (s-log) so logbook updates. */
    $("ml").classList.remove("on");
    if (typeof showSigninOverlay === "function") showSigninOverlay("s-log");
    return;
  }
  var dur = parseInt($("ml-du").value);
  if (!dur || dur < 1) { toast("Enter duration", {tone: "warn"}); return; }
  var kmVal = parseFloat($("ml-km").value);
  if (isNaN(kmVal) || kmVal < 0) kmVal = 0;
  var roads = [];
  document.querySelectorAll("#ml-ch .ch.on").forEach(function(c) {
    roads.push(c.getAttribute("data-v"));
  });
  var entryData = {
    date: $("ml-dt").value,
    duration: dur,
    tod: $("ml-td").value,
    roads: roads,
    supervisor: $("ml-sp").value,
    notes: $("ml-nt").value,
    km: Math.round(kmVal * 10) / 10
  };

  if (editingLogIdx >= 0 && editingLogIdx < S.logs.length) {
    var existing = S.logs[editingLogIdx];
    existing.date = entryData.date;
    existing.duration = entryData.duration;
    existing.tod = entryData.tod;
    existing.roads = entryData.roads;
    existing.supervisor = entryData.supervisor;
    existing.notes = entryData.notes;
    existing.km = entryData.km;
    if (TK && S.uid && existing.id) {
      sbu("log_entries", "id=eq." + existing.id, {
        date: entryData.date,
        duration: entryData.duration,
        time_of_day: entryData.tod,
        road_types: entryData.roads,
        supervisor: entryData.supervisor,
        notes: entryData.notes,
        km: entryData.km
      });
    }
    editingLogIdx = -1;
    $("ml").classList.remove("on");
    dLog();
    dProf();
    toast("Entry updated", {tone: "ok"});
  } else {
    /* Fresh entry — clear the session distance counter so it doesn't double-count. */
    S.drivenKm = 0;
    if (TK && S.uid) {
      sbp("log_entries", {
        user_id: S.uid,
        date: entryData.date,
        duration: entryData.duration,
        time_of_day: entryData.tod,
        road_types: entryData.roads,
        supervisor: entryData.supervisor,
        notes: entryData.notes,
        km: entryData.km
      }).then(function(res) {
        entryData.id = (res && res.length) ? res[0].id : Date.now().toString(36);
        S.logs.unshift(entryData);
        $("ml").classList.remove("on");
        dLog();
        dProf();
        toast("Logged!", {tone: "ok", icon: "check"});
      });
    } else {
      entryData.id = Date.now().toString(36);
      S.logs.unshift(entryData);
      $("ml").classList.remove("on");
      dLog();
      dProf();
      toast("Logged!", {tone: "ok", icon: "check"});
    }
  }
});

var editingLogIdx = -1;

function dLog() {
  var dM = (S.profile.initial_day_min || 0), nM = (S.profile.initial_night_min || 0);
  S.logs.forEach(function(e) {
    if ((e.tod || "day") === "night") nM += e.duration;
    else dM += e.duration;
  });
  var dH = dM / 60, nH = nM / 60, tH = dH + nH;
  $("th").textContent = tH.toFixed(1);
  $("hbs").innerHTML =
    '<div class="hb"><div class="hv" style="color:var(--acc)">' + dH.toFixed(1) + 'h</div><div class="hl">Day (80h req)</div></div>' +
    '<div class="hb"><div class="hv" style="color:var(--i)">' + nH.toFixed(1) + 'h</div><div class="hl">Night (20h req)</div></div>';
  var circ = 2 * Math.PI * 70;
  $("rd").style.strokeDashoffset = String(circ * (1 - Math.min(dH / 100, 1) * 0.65));
  $("rn").style.strokeDashoffset = String(circ * (1 - Math.min(nH / 20, 1) * 0.35));

  /* ── Distance hero card ───────────────────────────────────────
     Sum every logbook entry's km field for the headline number;
     show the most recent entry's km as a subtle "+N" badge. */
  var totalKm = S.logs.reduce(function(s, e) { return s + (e.km || 0); }, 0);
  var kmTotalEl = $("km-total");
  if (kmTotalEl) kmTotalEl.textContent = totalKm.toFixed(1);
  var kmBadge = $("km-badge"), kmLast = $("km-last");
  var latest = S.logs[0];
  if (kmBadge && kmLast) {
    if (latest && latest.km > 0) {
      kmLast.textContent = latest.km.toFixed(1) + " km";
      kmBadge.style.display = "";
    } else {
      kmBadge.style.display = "none";
    }
  }

  var list = $("llist");
  if (!S.logs.length) {
    list.innerHTML =
      '<div class="empty">' +
        '<div class="ei">' + icn("book_open", "2xl") + '</div>' +
        '<div class="et">No entries yet</div>' +
        '<div class="es">Log your first drive to start tracking hours</div>' +
      '</div>';
    return;
  }

  var h = '<div class="stagger">';
  S.logs.slice(0, 30).forEach(function(e, idx) {
    var n = (e.tod || "day") === "night";
    var bg = n ? "var(--ig)" : "var(--accg)";
    var col = n ? "var(--i)" : "var(--acc)";
    var ico = n ? "moon" : "sun";
    h += '<div class="card" style="cursor:default"><div class="cr">';
    h += '<div class="ci" style="background:' + bg + ';color:' + col + '">' + icn(ico) + '</div>';
    h += '<div class="cb"><div class="ct">' + fd(e.date) + '</div>';
    h += '<div class="cs">' + (e.supervisor ? "with " + e.supervisor : "");
    var subExtras = [];
    if (e.km && e.km > 0) subExtras.push(e.km.toFixed(1) + " km");
    if (e.roads && e.roads.length) subExtras.push(e.roads.join(", "));
    if (subExtras.length) h += (e.supervisor ? " \u00B7 " : "") + subExtras.join(" \u00B7 ");
    h += '</div></div>';
    h += '<div class="crt"><div class="cv" style="color:' + col + '">' + e.duration + '</div><div class="cu">min</div></div>';
    h += '<button class="bg log-edit" data-li="' + idx + '" title="Edit" style="color:var(--acc)">' + icn("edit", "sm") + '</button>';
    h += '<button class="bg log-del" data-li="' + idx + '" title="Delete" style="color:var(--d)">' + icn("trash", "sm") + '</button>';
    h += '</div>';
    if (e.notes) {
      h += '<div style="margin-top:8px;font-size:11px;color:var(--t3);padding:8px 10px;background:var(--bg3);border-radius:8px;line-height:1.5;letter-spacing:-.05px">' + e.notes + '</div>';
    }
    h += '</div>';
  });
  h += '</div>';
  list.innerHTML = h;
  if (typeof hydrateIcons === "function") hydrateIcons(list);

  list.querySelectorAll(".log-del").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var idx = parseInt(btn.getAttribute("data-li"));
      var entry = S.logs[idx];
      if (TK && S.uid && entry && entry.id) sbDel("log_entries", "id=eq." + entry.id);
      S.logs.splice(idx, 1);
      dLog();
      dProf();
      toast("Entry deleted", {tone: "ok"});
    });
  });
  list.querySelectorAll(".log-edit").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var idx = parseInt(btn.getAttribute("data-li"));
      openLogEdit(idx);
    });
  });
}

function openLogEdit(idx) {
  var e = S.logs[idx];
  if (!e) return;
  editingLogIdx = idx;
  $("ml-dt").value = e.date || new Date().toISOString().split("T")[0];
  $("ml-du").value = e.duration || "";
  $("ml-km").value = (e.km && e.km > 0) ? e.km.toFixed(1) : "";
  $("ml-td").value = e.tod || "day";
  $("ml-sp").value = e.supervisor || "";
  $("ml-nt").value = e.notes || "";
  document.querySelectorAll("#ml-ch .ch").forEach(function(c) {
    var v = c.getAttribute("data-v");
    if (e.roads && e.roads.indexOf(v) >= 0) c.classList.add("on");
    else c.classList.remove("on");
  });
  $("ml").querySelector("h3").innerHTML = icn("edit") + " Edit Entry";
  updateLogSaveState();
  $("ml").classList.add("on");
}

function dRt() {
  var list = $("rlist"), em = $("nort");
  if (!S.routes.length) { list.innerHTML = ""; em.style.display = "block"; return; }
  em.style.display = "none";
  var h = '<div class="stagger">';
  S.routes.forEach(function(r, i) {
    var ds = "";
    try { ds = new Date(r.ts).toLocaleDateString("en-AU", {day: "numeric", month: "short", year: "numeric"}); } catch (e) {}
    h += '<div class="card" data-ri="' + i + '" style="position:relative"><div class="cr">';
    h += '<div class="ci" style="background:var(--accg);color:var(--acc)">' + icn("route") + '</div>';
    h += '<div class="cb"><div class="ct">' + r.distance.toFixed(1) + ' km \u00B7 ' + Math.round(r.duration) + ' min</div>';
    h += '<div class="cs">' + ds + ' \u00B7 ' + (r.destType === "loop" ? "Loop" : "P2P") + ' \u00B7 ' + r.radius + 'km radius</div></div>';
    h += '<button class="bg rt-del" data-di="' + i + '" style="color:var(--d)" title="Delete">' + icn("trash", "sm") + '</button>';
    h += '</div></div>';
  });
  h += '</div>';
  list.innerHTML = h;
  if (typeof hydrateIcons === "function") hydrateIcons(list);

  list.querySelectorAll("[data-ri]").forEach(function(c) {
    c.addEventListener("click", function(ev) {
      if (ev.target.closest(".rt-del")) return;
      var r = S.routes[parseInt(c.getAttribute("data-ri"))];
      if (!r) return;
      goTo("s-map");
      setTimeout(function() {
        clr();
        if (S.userLL) S.startLL = {lat: S.userLL.lat, lng: S.userLL.lng};
        else S.startLL = {lat: r.startLatLng.lat, lng: r.startLatLng.lng};
        sMk = L.marker([S.startLL.lat, S.startLL.lng], {icon: iS}).addTo(map);
        map.setView([S.startLL.lat, S.startLL.lng], 14);
        W.prefs = JSON.parse(JSON.stringify(r.prefs || {}));
        W.rad = r.radius || 5;
        W.dur = r.duration || 60;
        W.dest = r.destType || "loop";
        W.diff = 2;
        fetchWeather(S.startLL.lat, S.startLL.lng);
        toast("Rebuilding route...", {tone: "info", icon: "loader"});
        S.genRoutes = [];
        S.genIdx = 0;
        S.poiCache = null;
        W.skipSave = true;
        doGen();
      }, 300);
    });
  });
  list.querySelectorAll(".rt-del").forEach(function(btn) {
    btn.addEventListener("click", function(ev) {
      ev.stopPropagation();
      var idx = parseInt(btn.getAttribute("data-di"));
      var route = S.routes[idx];
      if (!confirm("Delete this route?")) return;
      if (TK && S.uid && route.id) sbDel("saved_routes", "id=eq." + route.id);
      S.routes.splice(idx, 1);
      dRt();
      dProf();
      toast("Route deleted", {tone: "ok"});
    });
  });
}

function dProf() {
  var nm = S.profile.name || "Guest";
  $("pnm").textContent = nm;
  var lt = S.profile.licence_type || "L";
  var ltLabels = {"L": "Learner", "P1": "P1 Red Provisional", "P2": "P2 Green Provisional"};
  $("pli").textContent = (ltLabels[lt] || lt) + " \u2014 NSW";
  $("xrt").textContent = S.routes.length;
  var totalKm = S.logs.reduce(function(s, e) { return s + (e.km || 0); }, 0);
  $("xkm").textContent = totalKm.toFixed(0);
  $("xhr").textContent = (
    S.logs.reduce(function(s, e) { return s + e.duration; }, 0) / 60 +
    (S.profile.initial_day_min || 0) / 60 +
    (S.profile.initial_night_min || 0) / 60
  ).toFixed(1);
  applyLicTheme();
  var pfpData = S.profile.pfp || "";
  var av = $("pav");
  if (pfpData) {
    av.innerHTML = '<img src="' + pfpData + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>';
  } else {
    av.textContent = nm[0].toUpperCase();
  }

  var isGuest = (typeof S_isGuest !== "undefined") && S_isGuest;
  if ($("cguest")) $("cguest").style.display = isGuest ? "block" : "none";
  if ($("clogin")) $("clogin").style.display = isGuest ? "block" : "none";
  if ($("cout")) $("cout").style.display = isGuest ? "none" : "block";
  if ($("cedit")) $("cedit").style.display = isGuest ? "none" : "block";
  if ($("cexp")) $("cexp").style.display = isGuest ? "none" : "block";
}

$("pav").addEventListener("click", function() { $("pfp-input").click(); });

$("pfp-input").addEventListener("change", function() {
  var file = this.files[0];
  if (!file) return;
  if (file.size > 500000) { toast("Image too large (max 500KB)", {tone: "warn"}); return; }
  var reader = new FileReader();
  reader.onload = function(e) {
    S.profile.pfp = e.target.result;
    try { localStorage.setItem("ll-pfp", e.target.result); } catch (x) {}
    dProf();
    toast("Photo updated!", {tone: "ok", icon: "check"});
  };
  reader.readAsDataURL(file);
});

$("cedit").addEventListener("click", function() {
  $("mp-nm").value = S.profile.name || "";
  $("mp-li").value = S.profile.licence || "";
  $("mp-sp").value = S.profile.supervisor || "";
  $("mp-lt").value = S.profile.licence_type || "L";
  $("mp").classList.add("on");
});

$("mp-x").addEventListener("click", function() { $("mp").classList.remove("on"); });

$("mp-ok").addEventListener("click", function() {
  S.profile.name = $("mp-nm").value || "Driver";
  S.profile.licence = $("mp-li").value;
  S.profile.supervisor = $("mp-sp").value;
  S.profile.licence_type = $("mp-lt").value;
  if (TK && S.uid) {
    sbu("profiles", "id=eq." + S.uid, {
      name: S.profile.name,
      licence: S.profile.licence,
      supervisor: S.profile.supervisor,
      licence_type: S.profile.licence_type
    });
  }
  $("mp").classList.remove("on");
  dProf();
  toast("Profile updated", {tone: "ok", icon: "check"});
});

$("cexp").addEventListener("click", function() {
  var d = {
    profile: S.profile,
    logs: S.logs,
    routes: S.routes,
    date: new Date().toISOString()
  };
  var b = new Blob([JSON.stringify(d, null, 2)], {type: "application/json"});
  var a = document.createElement("a");
  a.href = URL.createObjectURL(b);
  a.download = "elearnsio-export.json";
  a.click();
  toast("Exported logbook", {tone: "ok", icon: "download"});
});

$("cout").addEventListener("click", function() {
  if (TK) {
    fetch(SB + "/auth/v1/logout", {
      method: "POST",
      headers: {"apikey": AK, "Authorization": "Bearer " + TK}
    }).catch(function() {});
  }
  TK = null;
  S.uid = null;
  S.logs = [];
  S.routes = [];
  S_isGuest = true;
  clearSession();
  dProf();
  dLog();
  dRt();
  toast("Signed out \u2014 progress won't be saved", {tone: "warn", long: true});
});

$("clogin").addEventListener("click", function() {
  $("app").classList.remove("on");
  $("auth").classList.remove("gone");
});

document.addEventListener("visibilitychange", function() {
  if (document.visibilityState !== "visible") return;
  if (!S._gmNavStarted || !S._gmNavRoute) return;
  var elapsed = Math.round((Date.now() - S._gmNavStarted) / 60000);
  if (elapsed < 1) return;
  var rd = S._gmNavRoute;
  S._gmNavStarted = null;
  S._gmNavRoute = null;
  editingLogIdx = -1;
  $("ml-dt").value = new Date().toISOString().split("T")[0];
  $("ml-du").value = elapsed;
  $("ml-km").value = rd.distance ? rd.distance.toFixed(1) : "";
  $("ml-td").value = (new Date().getHours() >= 18 || new Date().getHours() < 6) ? "night" : "day";
  $("ml-sp").value = S.profile.supervisor || "";
  $("ml-nt").value = "Google Maps drive: " + rd.distance.toFixed(1) + " km, " + elapsed + " min";
  document.querySelectorAll("#ml-ch .ch").forEach(function(c) { c.classList.remove("on"); });
  $("ml").querySelector("h3").innerHTML = icn("edit") + " Log Drive";
  updateLogSaveState();
  $("ml").classList.add("on");
  toast("Welcome back! Log your drive below.", {tone: "info", icon: "check", long: true});
});

function showTutorial() {
  $("tut-ov").classList.add("on");
}

$("tut-x").addEventListener("click", function() { $("tut-ov").classList.remove("on"); });
$("tut-done").addEventListener("click", function() {
  $("tut-ov").classList.remove("on");
  try { localStorage.setItem("el_tut_seen", "1"); } catch (x) {}
});

if (window._elBootReady) window._elBootReady();

setTimeout(function() {
  var isGuest = (typeof S_isGuest !== "undefined") && S_isGuest;
  if (isGuest) {
    showTutorial();
  } else {
    try {
      if (!localStorage.getItem("el_tut_seen")) showTutorial();
    } catch (x) {
      showTutorial();
    }
  }
}, 1200);
