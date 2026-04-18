var RD = [
  {k: "residential",  i: "home",          n: "Residential",  d: "Quiet suburban roads"},
  {k: "main-roads",   i: "road",          n: "Main Roads",   d: "Arterial, traffic lights"},
  {k: "multi-lane",   i: "lanes",         n: "Multi-Lane",   d: "Dual carriageways"},
  {k: "roundabouts",  i: "refresh_cw",    n: "Roundabouts",  d: "Single & multi-lane"},
  {k: "parking",      i: "square_parking",n: "Parking",      d: "Reverse & angle"},
  {k: "hills",        i: "mountain",      n: "Hills",        d: "Steep grades"}
];

var W = {step: 0, prefs: {}, rad: 5, dur: 60, dest: "loop"};

function openW() {
  if (S.userLL) S.startLL = {lat: S.userLL.lat, lng: S.userLL.lng};
  if (!S.startLL) { toast("Waiting for GPS location..."); return; }
  W.step = 0;
  W.prefs = {};
  RD.forEach(function(r) { W.prefs[r.k] = 0; });
  W.rad = 5;
  W.dur = 60;
  W.dest = "loop";
  W.diff = 2;
  S.genRoutes = [];
  S.genIdx = 0;
  S.poiCache = null;
  $("wov").classList.add("on");
  dW();
}

function closeW() { $("wov").classList.remove("on"); }

function dW() {
  var p = $("wp"), t = 4, s = W.step;
  var h = '<div class="wprog">';
  for (var i = 0; i < t; i++) {
    h += '<div class="d ' + (i < s ? "dn" : (i === s ? "cu" : "")) + '"></div>';
  }
  h += '</div>';

  if (s === 0) {
    h += '<div class="wlab">Step 1 of 4</div>';
    h += '<div class="wtit">Road Types</div>';
    h += '<div class="wdsc">Select what you\'d like to practice.</div>';
    h += '<div class="wopts" id="wro">';
    RD.forEach(function(r) {
      h += '<div class="wo' + (W.prefs[r.k] > 0 ? " sel" : "") + '" data-k="' + r.k + '">';
      h += '<div class="oi">' + icn(r.i, "lg") + '</div>';
      h += '<div class="ot"><div class="otn">' + r.n + '</div><div class="ots">' + r.d + '</div></div>';
      h += '</div>';
    });
    h += '</div>';
    h += '<div class="wn">';
    h += '<button class="btn bs" style="flex:1" id="wx">Cancel</button>';
    h += '<button class="btn ba" style="flex:1" id="wnx">Next ' + icn("arrow_right", "sm") + '</button>';
    h += '</div>';

  } else if (s === 1) {
    var sl = RD.filter(function(r) { return W.prefs[r.k] > 0; });
    h += '<div class="wlab">Step 2 of 4</div>';
    h += '<div class="wtit">Intensity</div>';
    h += '<div class="wdsc">How much of each?</div>';
    if (!sl.length) {
      h += '<p style="color:var(--t3);text-align:center;padding:20px">Select roads first.</p>';
    }
    sl.forEach(function(r) {
      h += '<div class="irow">';
      h += '<div class="ihdr">';
      h += '<span class="ic-icon-box">' + icn(r.i, "sm") + '</span>';
      h += '<span style="font-size:13px;font-weight:700;flex:1;letter-spacing:-.1px">' + r.n + '</span>';
      h += '<span style="font-family:var(--fm);font-size:13px;font-weight:800;color:var(--acc)" id="iv-' + r.k + '">' + W.prefs[r.k] + '/5</span>';
      h += '</div>';
      h += '<input type="range" class="rng wsl" min="1" max="5" value="' + W.prefs[r.k] + '" data-k="' + r.k + '">';
      h += '<div class="rngl"><span>Light</span><span>Heavy</span></div>';
      h += '</div>';
    });
    h += '<div class="wn">';
    h += '<button class="btn bs" style="flex:1" id="wbk">' + icn("arrow_left", "sm") + ' Back</button>';
    h += '<button class="btn ba" style="flex:1" id="wnx">Next ' + icn("arrow_right", "sm") + '</button>';
    h += '</div>';

  } else if (s === 2) {
    var sugLvl = suggestDifficulty(W.prefs, W.dur, W.rad);
    if (W.diff === 2 && sugLvl !== 2) W.diff = sugLvl;
    h += '<div class="wlab">Step 3 of 4</div>';
    h += '<div class="wtit">Settings</div>';
    h += '<div class="wdsc">Configure your route parameters.</div>';
    h += '<div style="margin-bottom:20px">';
    h += '<label class="fl">Max radius</label>';
    h += '<input type="range" class="rng" min="1" max="25" step="1" value="' + W.rad + '" id="wr">';
    h += '<div class="rngv" id="wrv">' + W.rad + ' km</div>';
    h += '<div class="rngl"><span>1 km</span><span>25 km</span></div>';
    h += '</div>';
    h += '<div style="margin-bottom:20px">';
    h += '<label class="fl">Target duration</label>';
    h += '<input type="range" class="rng" min="10" max="60" step="5" value="' + W.dur + '" id="wd">';
    h += '<div class="rngv" id="wdv">' + fm(W.dur) + '</div>';
    h += '<div class="rngl"><span>10 min</span><span>1 hour</span></div>';
    h += '</div>';
    h += diffSliderHtml(W.diff);
    var wpNote = (S.waypoints && S.waypoints.length)
      ? '<strong style="color:var(--acc)">' + S.waypoints.length + ' waypoint' + (S.waypoints.length > 1 ? 's' : '') + ' will be included exactly.</strong> '
      : '';
    h += '<div style="padding:11px 14px;background:var(--bg3);border-radius:var(--r1);margin-bottom:14px;font-size:12px;color:var(--t2);line-height:1.5;display:flex;gap:10px;align-items:flex-start;border:1px solid var(--brd)">';
    h += '<span class="ic" style="color:var(--acc);margin-top:1px">' + ICN.corner_up_left + '</span>';
    h += '<div><strong style="color:var(--t1)">Loop route</strong> \u2014 starts and ends at your GPS location. ';
    h += wpNote + 'Search a location to add more waypoints.</div></div>';
    h += '<div class="wn">';
    h += '<button class="btn bs" style="flex:1" id="wbk">' + icn("arrow_left", "sm") + ' Back</button>';
    h += '<button class="btn ba" style="flex:1" id="wnx">Next ' + icn("arrow_right", "sm") + '</button>';
    h += '</div>';

  } else if (s === 3) {
    var sl2 = RD.filter(function(r) { return W.prefs[r.k] > 0; });
    var diff = getDiff(W.diff);
    h += '<div class="wlab">Step 4 of 4</div>';
    h += '<div class="wtit">Summary</div>';
    h += '<div class="wdsc">Generate multiple routes to compare.</div>';
    h += '<div style="background:var(--bg3);border-radius:var(--r1);padding:14px;margin-bottom:14px;border:1px solid var(--brd)">';
    h += '<div style="display:flex;justify-content:space-between;margin-bottom:8px">';
    h += '<span style="font-size:12px;color:var(--t3);font-weight:500">Radius</span>';
    h += '<span style="font-size:13px;font-weight:800;font-family:var(--fm);color:var(--acc)">' + W.rad + ' km</span></div>';
    h += '<div style="display:flex;justify-content:space-between;margin-bottom:8px">';
    h += '<span style="font-size:12px;color:var(--t3);font-weight:500">Target</span>';
    h += '<span style="font-size:13px;font-weight:800;font-family:var(--fm);color:var(--acc)">' + fm(W.dur) + '</span></div>';
    h += '<div style="display:flex;justify-content:space-between;align-items:center">';
    h += '<span style="font-size:12px;color:var(--t3);font-weight:500">Difficulty</span>';
    h += '<span style="font-size:13px;font-weight:800;color:' + diff.color + '">' + diff.label + '</span></div>';
    h += diffHtml(diff);
    h += '</div>';
    if (sl2.length) {
      h += '<div style="margin-bottom:14px">';
      sl2.forEach(function(r) {
        h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">';
        h += '<span class="ic" style="color:var(--acc)">' + ICN[r.i] + '</span>';
        h += '<span style="font-size:11px;flex:1;font-weight:500">' + r.n + '</span>';
        h += '<div style="width:72px;height:4px;background:var(--bg0);border-radius:2px;overflow:hidden">';
        h += '<div style="width:' + (W.prefs[r.k] * 20) + '%;height:100%;background:var(--acc);border-radius:2px"></div>';
        h += '</div></div>';
      });
      h += '</div>';
    }
    h += '<div class="wn">';
    h += '<button class="btn bs" style="flex:1" id="wbk">' + icn("arrow_left", "sm") + ' Back</button>';
    h += '<button class="btn ba" style="flex:1" id="wgen">' + icn("sparkles", "sm") + ' Generate Routes</button>';
    h += '</div>';
  }

  p.innerHTML = h;
  if (typeof hydrateIcons === "function") hydrateIcons(p);
  bW();
}

function bW() {
  var el;
  el = $("wx");
  if (el) el.addEventListener("click", closeW);

  el = $("wnx");
  if (el) el.addEventListener("click", function() {
    if (W.step === 0) {
      var anySelected = false;
      for (var k in W.prefs) { if (W.prefs[k] > 0) anySelected = true; }
      if (!anySelected) { toast("Select at least one road type to continue"); return; }
    }
    W.step++;
    dW();
  });

  el = $("wbk");
  if (el) el.addEventListener("click", function() { W.step--; dW(); });

  el = $("wgen");
  if (el) el.addEventListener("click", doGen);

  document.querySelectorAll("#wro .wo").forEach(function(o) {
    o.addEventListener("click", function() {
      var k = o.getAttribute("data-k");
      W.prefs[k] = W.prefs[k] > 0 ? 0 : 3;
      o.classList.toggle("sel");
    });
  });

  document.querySelectorAll(".wsl").forEach(function(s) {
    s.addEventListener("input", function() {
      var k = this.getAttribute("data-k");
      W.prefs[k] = Number(this.value);
      var l = $("iv-" + k);
      if (l) l.textContent = this.value + "/5";
    });
  });

  var rs = $("wr");
  if (rs) rs.addEventListener("input", function() {
    W.rad = Number(this.value);
    $("wrv").textContent = W.rad + " km";
  });

  var ds = $("wd");
  if (ds) ds.addEventListener("input", function() {
    W.dur = Number(this.value);
    $("wdv").textContent = fm(W.dur);
  });

  var dfs = $("wdf");
  if (dfs) dfs.addEventListener("input", function() {
    W.diff = Number(this.value);
    var d = getDiff(W.diff);
    $("wdfv").textContent = d.label;
    $("wdfv").style.color = d.color;
    var dd = $("wdfd");
    if (dd) dd.textContent = d.desc;
    var bars = dfs.parentElement.querySelectorAll(".diff-bar");
    if (bars.length) bars[0].outerHTML = diffHtml(d);
  });
}
