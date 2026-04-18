var prevAnim = null, prevDist = 0, prevPaused = false, prevSpeed = 0.5, prevMk = null;

function startPreview() {
  if (!S.curRoute || !S.curRoute._coords || !S.curRoute._cumDist) return;
  var coords = S.curRoute._coords;
  if (coords.length < 2) return;
  prevDist = 0;
  prevPaused = false;
  prevSpeed = 0.5;
  $("prev-bar").classList.add("on");
  $("msh").classList.add("hid");
  $("prev-sub").textContent = "0% \u00B7 " + S.curRoute.distance.toFixed(1) + " km route";
  document.querySelectorAll(".prev-spd button").forEach(function(b) {
    b.classList.toggle("on", b.getAttribute("data-ps") === "0.5");
  });
  if (prevMk) map.removeLayer(prevMk);
  prevMk = L.marker(coords[0], {icon: makeArrowIcon(0), zIndexOffset: 2000}).addTo(map);
  map.setView(coords[0], 16);
  animPreview();
}

function animPreview() {
  if (prevAnim) cancelAnimationFrame(prevAnim);
  var coords = S.curRoute._coords, cumDist = S.curRoute._cumDist;
  var totalDist = cumDist[cumDist.length - 1];
  if (totalDist <= 0) { stopPreview(); return; }
  var lastRot = 0, frameCount = 0;

  function tick() {
    if (prevPaused) { prevAnim = requestAnimationFrame(tick); return; }
    prevDist += 14 * prevSpeed;
    if (prevDist >= totalDist) { stopPreview(); return; }
    var lo = 0, hi = cumDist.length - 1;
    while (lo < hi - 1) {
      var mid = Math.floor((lo + hi) / 2);
      if (cumDist[mid] <= prevDist) lo = mid; else hi = mid;
    }
    var segLen = cumDist[hi] - cumDist[lo];
    var t = segLen > 0 ? (prevDist - cumDist[lo]) / segLen : 0;
    var lat = coords[lo][0] + (coords[hi][0] - coords[lo][0]) * t;
    var lng = coords[lo][1] + (coords[hi][1] - coords[lo][1]) * t;
    prevMk.setLatLng([lat, lng]);
    frameCount++;
    if (frameCount % 6 === 0) {
      var aheadIdx = Math.min(hi + 10, coords.length - 1);
      var rot = bearing(lat, lng, coords[aheadIdx][0], coords[aheadIdx][1]);
      if (Math.abs(rot - lastRot) > 2) {
        var el = prevMk.getElement();
        if (el) {
          var svg = el.querySelector("svg");
          if (svg) svg.style.transform = "rotate(" + rot + "deg)";
        }
        lastRot = rot;
      }
    }
    map.panTo([lat, lng], {animate: true, duration: 0.12, noMoveStart: true});
    var pct = Math.round((prevDist / totalDist) * 100);
    $("prev-fill").style.width = pct + "%";
    $("prev-sub").textContent = pct + "% \u00B7 " + (prevDist / 1000).toFixed(1) + " / " + S.curRoute.distance.toFixed(1) + " km";
    prevAnim = requestAnimationFrame(tick);
  }

  prevAnim = requestAnimationFrame(tick);
}

function stopPreview() {
  if (prevAnim) cancelAnimationFrame(prevAnim);
  prevAnim = null;
  $("prev-bar").classList.remove("on");
  $("msh").classList.remove("hid");
  if (prevMk) { map.removeLayer(prevMk); prevMk = null; }
  if (S.curRoute && S.curRoute._coords) {
    map.fitBounds(L.latLngBounds(S.curRoute._coords), {padding: [50, 50]});
  }
}

$("prev-x").addEventListener("click", stopPreview);

$("prev-pp").addEventListener("click", function() {
  prevPaused = !prevPaused;
  $("prev-pp").innerHTML = icn(prevPaused ? "play" : "pause", "lg");
});

document.querySelectorAll(".prev-spd button").forEach(function(b) {
  b.addEventListener("click", function() {
    prevSpeed = parseFloat(b.getAttribute("data-ps"));
    document.querySelectorAll(".prev-spd button").forEach(function(x) { x.classList.remove("on"); });
    b.classList.add("on");
  });
});

$("prev-prog").addEventListener("click", function(e) {
  var rect = this.getBoundingClientRect();
  var pct = (e.clientX - rect.left) / rect.width;
  if (S.curRoute && S.curRoute._cumDist) {
    var total = S.curRoute._cumDist[S.curRoute._cumDist.length - 1];
    prevDist = Math.floor(pct * total);
  }
});

var gpsFilter = {lat: 0, lng: 0, acc: 999, variance: 999};
var GPS_MIN_ACC = 20;
var GPS_Q = 3;
var GPS_R_BASE = 10;

function filterGPS(lat, lng, accuracy) {
  var r = Math.max(GPS_R_BASE, accuracy || GPS_R_BASE);
  if (gpsFilter.variance === 999) {
    gpsFilter.lat = lat;
    gpsFilter.lng = lng;
    gpsFilter.variance = r * r;
    gpsFilter.acc = accuracy;
    return {lat: lat, lng: lng};
  }
  var kg = gpsFilter.variance / (gpsFilter.variance + r * r);
  gpsFilter.lat = gpsFilter.lat + kg * (lat - gpsFilter.lat);
  gpsFilter.lng = gpsFilter.lng + kg * (lng - gpsFilter.lng);
  gpsFilter.variance = (1 - kg) * gpsFilter.variance + GPS_Q;
  gpsFilter.acc = accuracy;
  return {lat: gpsFilter.lat, lng: gpsFilter.lng};
}

var markerAnimFrame = null;
var markerCurrentLat = 0, markerCurrentLng = 0;
var markerTargetLat = 0, markerTargetLng = 0;
var markerCurrentRot = 0, markerTargetRot = 0;
var markerInited = false;

function smoothMoveMarker(targetLat, targetLng, targetBearing) {
  markerTargetLat = targetLat;
  markerTargetLng = targetLng;
  markerTargetRot = targetBearing;

  if (!markerInited) {
    markerCurrentLat = targetLat;
    markerCurrentLng = targetLng;
    markerCurrentRot = targetBearing;
    markerInited = true;
    if (pMk) {
      pMk.setLatLng([targetLat, targetLng]);
      pMk.setIcon(makeArrowIcon(targetBearing));
    }
    return;
  }

  if (markerAnimFrame) return;

  var startLat = markerCurrentLat;
  var startLng = markerCurrentLng;
  var startRot = markerCurrentRot;
  var startTime = performance.now();
  var duration = 600;

  var rotDiff = markerTargetRot - startRot;
  if (rotDiff > 180) rotDiff -= 360;
  if (rotDiff < -180) rotDiff += 360;

  function step(now) {
    var elapsed = now - startTime;
    var progress = Math.min(elapsed / duration, 1);
    var ease = progress < 0.5
      ? 2 * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;

    markerCurrentLat = startLat + (markerTargetLat - startLat) * ease;
    markerCurrentLng = startLng + (markerTargetLng - startLng) * ease;
    markerCurrentRot = startRot + rotDiff * ease;

    if (pMk) {
      pMk.setLatLng([markerCurrentLat, markerCurrentLng]);
      var el = pMk.getElement();
      if (el) {
        var svg = el.querySelector("svg");
        if (svg) svg.style.transform = "rotate(" + markerCurrentRot + "deg)";
      }
    }

    map.panTo([markerCurrentLat, markerCurrentLng], {animate: false, noMoveStart: true});

    if (progress < 1) {
      markerAnimFrame = requestAnimationFrame(step);
    } else {
      markerAnimFrame = null;
      markerCurrentLat = markerTargetLat;
      markerCurrentLng = markerTargetLng;
      markerCurrentRot = markerTargetRot;
    }
  }

  markerAnimFrame = requestAnimationFrame(step);
}

var navSI = 0, navCoords = [], navProgIdx = 0;
var navOffRoute = false, navOffRouteTimer = null;
var navHeadingHistory = [];

function startNav() {
  if (!S.curRoute) return;
  S.navStart = Date.now();
  S.drivenKm = 0;
  S.lastGPS = null;
  S.gpsBearing = 0;
  S.spdHistory = [];
  S.etaHistory = [];
  S.navArrived = false;
  S.navGpsCount = 0;
  navSI = 0;
  navProgIdx = 0;
  navOffRoute = false;
  navHeadingHistory = [];
  markerInited = false;
  markerAnimFrame = null;
  gpsFilter = {lat: 0, lng: 0, acc: 999, variance: 999};
  navCoords = S.curRoute._coords || S.curRoute.geometry.coordinates.map(function(c) { return [c[1], c[0]]; });
  toast("Drive started \u2014 stay safe!", {tone: "ok", icon: "play"});
  $("navp").classList.add("on");
  $("sorb").classList.add("on");
  $("nbar").classList.add("on");
  $("msh").classList.add("hid");
  $("bnav").style.display = "none";
  $("nav-prog-bar").style.width = "0%";
  if (rtStartMk) map.removeLayer(rtStartMk);
  if (rtEndMk) map.removeLayer(rtEndMk);
  showNS();
  if (pMk) map.removeLayer(pMk);
  pMk = L.marker(navCoords[0], {icon: makeArrowIcon(0), zIndexOffset: 1000}).addTo(map);
  map.setView(navCoords[0], 17);
  

  if (typeof pauseAmbientTracking === "function") pauseAmbientTracking();
  if (navigator.geolocation) {
    wId = navigator.geolocation.watchPosition(onGPS, onGPSErr, {
      enableHighAccuracy: true,
      maximumAge: 500,
      timeout: 8000
    });
  }
}

function onGPSErr(err) {
  if (err.code === 1) toast("GPS denied \u2014 enable location for navigation", {tone: "err", long: true});
  else toast("GPS signal weak \u2014 finding position...", {tone: "warn"});
}

function onGPS(pos) {
  var rawLat = pos.coords.latitude, rawLng = pos.coords.longitude;
  var acc = pos.coords.accuracy || 15;
  S.navGpsCount++;

  if (acc > 80 && S.navGpsCount > 5) return;

  var filtered = filterGPS(rawLat, rawLng, acc);
  var lat = filtered.lat, lng = filtered.lng;

  var rawSpd = pos.coords.speed != null ? Math.round(pos.coords.speed * 3.6) : -1;
  var cur = L.latLng(lat, lng);

  if (S.lastGPS) {
    var seg = S.lastGPS.distanceTo(cur);
    var dt = (Date.now() - S._lastGPSTime || 1000) / 1000;
    if (rawSpd < 0) rawSpd = Math.round((seg / dt) * 3.6);
    if (seg / 1000 < 0.5 && seg > 1) S.drivenKm += seg / 1000;
    S.gpsBearing = bearing(S.lastGPS.lat, S.lastGPS.lng, lat, lng);
  }
  S.lastGPS = cur;
  S._lastGPSTime = Date.now();

  if (S.spdHistory.length && Math.abs(rawSpd - (S.spdHistory[S.spdHistory.length - 1] || 0)) > 30) {
    rawSpd = S.spdHistory[S.spdHistory.length - 1] || 0;
  }
  S.spdHistory.push(Math.max(0, rawSpd));
  if (S.spdHistory.length > 6) S.spdHistory.shift();
  var avgSpd = Math.round(S.spdHistory.reduce(function(a, b) { return a + b; }, 0) / S.spdHistory.length);
  $("snum").textContent = avgSpd;

  var sorb = $("sorb");
  var accEl = $("sorb-acc");
  if (accEl) {
    accEl.textContent = acc < 10 ? "GPS \u00B1" + Math.round(acc) + "m"
      : (acc < 25 ? "\u00B1" + Math.round(acc) + "m"
      : "\u00B1" + Math.round(acc) + "m weak");
  }
  if (acc > 40) sorb.classList.add("gps-weak");
  else sorb.classList.remove("gps-weak", "gps-lost");
  if (avgSpd > 110) sorb.style.borderColor = "#f05050";
  else if (avgSpd > 80) sorb.style.borderColor = "#f0a040";
  else if (avgSpd > 60) sorb.style.borderColor = "var(--i)";
  else sorb.style.borderColor = "var(--acc)";

  navHeadingHistory.push(S.gpsBearing);
  if (navHeadingHistory.length > 4) navHeadingHistory.shift();
  var sinSum = 0, cosSum = 0;
  navHeadingHistory.forEach(function(h) {
    sinSum += Math.sin(h * Math.PI / 180);
    cosSum += Math.cos(h * Math.PI / 180);
  });
  var smoothBearing = (Math.atan2(sinSum, cosSum) * 180 / Math.PI + 360) % 360;

  smoothMoveMarker(lat, lng, smoothBearing);

  var searchWindow = navOffRoute ? 150 : 80;
  var bD = Infinity, bI = navProgIdx;
  var sS = Math.max(0, navProgIdx - 5);
  var sE = Math.min(navCoords.length, navProgIdx + searchWindow);
  for (var i = sS; i < sE; i++) {
    var d = cur.distanceTo(L.latLng(navCoords[i][0], navCoords[i][1]));
    if (d < bD) { bD = d; bI = i; }
  }
  if (bI >= navProgIdx - 3) navProgIdx = bI;
  updTrail();

  if (bD > 80) {
    if (!navOffRoute) {
      if (!navOffRouteTimer) {
        navOffRouteTimer = setTimeout(function() {
          if (bD > 80) {
            navOffRoute = true;
            toast("Off route \u2014 recalculating...", {tone: "warn"});
            navRecalc(lat, lng);
          }
        }, 5000);
      }
    }
  } else {
    navOffRoute = false;
    if (navOffRouteTimer) { clearTimeout(navOffRouteTimer); navOffRouteTimer = null; }
  }

  $("nav-prog-bar").style.width = Math.min(100, Math.round((navProgIdx / (navCoords.length - 1)) * 100)) + "%";

  var rK = 0;
  for (var j = navProgIdx; j < navCoords.length - 1; j++) {
    rK += L.latLng(navCoords[j][0], navCoords[j][1]).distanceTo(L.latLng(navCoords[j + 1][0], navCoords[j + 1][1])) / 1000;
  }

  var etaSpd = avgSpd > 5 ? avgSpd : 35;
  var rM = Math.round((rK / etaSpd) * 60);
  S.etaHistory.push(rM);
  if (S.etaHistory.length > 10) S.etaHistory.shift();
  var wSum = 0, wTotal = 0;
  S.etaHistory.forEach(function(v, i) { var w = i + 1; wSum += v * w; wTotal += w; });
  var smoothEta = Math.round(wSum / wTotal);
  $("neta").textContent = smoothEta;
  $("nkm").textContent = rK.toFixed(1);
  var etaTime = new Date(Date.now() + smoothEta * 60000);
  $("neta-clock").textContent = etaTime.toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"});

  var steps = S.curRoute.steps;
  if (navSI < steps.length) {
    var st = steps[navSI];
    var ml = st.maneuver ? st.maneuver.location : null;
    if (ml) {
      var sD = cur.distanceTo(L.latLng(ml[1], ml[0]));
      var distTxt = sD < 1000 ? Math.round(sD) + "m" : (sD / 1000).toFixed(1) + "km";
      $("ndist").textContent = distTxt;
      if (sD < 30 && !st._cued) { st._cued = true; showNS(); }
      else if (sD < 50) navSI++;
    }
  }

  var eP = L.latLng(navCoords[navCoords.length - 1][0], navCoords[navCoords.length - 1][1]);
  var elapsed = (Date.now() - S.navStart) / 1000;
  if (cur.distanceTo(eP) < 40 && navProgIdx / (navCoords.length - 1) > 0.6 &&
      S.drivenKm > 0.15 && elapsed > 20 && S.navGpsCount > 6 && !S.navArrived) {

    $("ndist").innerHTML = icn("flag", "lg") + ' <span style="margin-left:6px">Arrived!</span>';
    $("ndist").style.display = "inline-flex";
    $("ndist").style.alignItems = "center";
    S.navArrived = true;
    $("nroad").textContent = "You reached your destination";
    $("nnext").textContent = "";
    $("nav-prog-bar").style.width = "100%";
    toast("You have arrived! " + S.drivenKm.toFixed(1) + " km driven", {tone: "ok", icon: "flag", long: true});
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }
}

function navRecalc(lat, lng) {
  if (!S.curRoute || navCoords.length < 2) return;
  var cur = L.latLng(lat, lng);
  var targetIdx = navProgIdx, bestD = Infinity;
  for (var i = navProgIdx + 5; i < navCoords.length; i++) {
    var d = cur.distanceTo(L.latLng(navCoords[i][0], navCoords[i][1]));
    if (d < bestD) { bestD = d; targetIdx = i; }
  }
  var endLL = L.latLng(navCoords[navCoords.length - 1][0], navCoords[navCoords.length - 1][1]);
  var viaLL = L.latLng(navCoords[targetIdx][0], navCoords[targetIdx][1]);
  osrm([cur, viaLL, endLL]).then(function(route) {
    if (!route) return;
    var newCoords = route.geometry.coordinates.map(function(c) { return [c[1], c[0]]; });
    var driven = navCoords.slice(0, navProgIdx + 1);
    navCoords = driven.concat(newCoords);
    var cumDist = [0];
    for (var i = 1; i < navCoords.length; i++) {
      cumDist.push(cumDist[i - 1] + L.latLng(navCoords[i - 1][0], navCoords[i - 1][1]).distanceTo(L.latLng(navCoords[i][0], navCoords[i][1])));
    }
    S.curRoute._coords = navCoords;
    S.curRoute._cumDist = cumDist;
    S.curRoute.steps = route.legs ? route.legs.reduce(function(a, l) { return a.concat(l.steps || []); }, []) : [];
    navSI = 0;
    navOffRoute = false;
    toast("Route updated");
    updTrail();
    showNS();
  });
}

function updTrail() {
  if (drvLy) { map.removeLayer(drvLy); drvLy = null; }
  if (rLy) map.removeLayer(rLy);
  if (gLy) map.removeLayer(gLy);
  var driven = navCoords.slice(0, navProgIdx + 1);
  var remaining = navCoords.slice(navProgIdx);
  if (driven.length > 1) {
    drvLy = L.polyline(driven, {color: "#556580", weight: 4, opacity: 0.25, lineCap: "round"}).addTo(map);
  }
  if (remaining.length > 1) {
    gLy = L.polyline(remaining, {color: "#0a1428", weight: 10, opacity: 0.7, lineCap: "round"}).addTo(map);
    rLy = L.polyline(remaining, {color: "#22d89e", weight: 5, opacity: 0.95, lineCap: "round"}).addTo(map);
  }
}

function showNS() {
  var steps = S.curRoute ? S.curRoute.steps : [];
  if (navSI >= steps.length) {
    $("ndist").innerHTML = icn("flag", "lg") + ' <span style="margin-left:6px">Arrived!</span>';
    $("ndist").style.display = "inline-flex";
    $("ndist").style.alignItems = "center";
    $("nroad").textContent = "Destination reached";
    $("nnext").textContent = "";
    return;
  }
  var s = steps[navSI];
  $("nroad").textContent = s.name || "Continue";
  var man = s.maneuver ? s.maneuver.modifier || "" : "";
  var typ = s.maneuver ? s.maneuver.type || "" : "";
  var ic = "arrow_up";
  if (typ === "arrive") ic = "flag";
  else if (typ === "roundabout" || typ === "rotary") ic = "refresh_cw";
  else if (man.indexOf("sharp right") >= 0) ic = "corner_up_right";
  else if (man.indexOf("sharp left") >= 0) ic = "corner_up_left";
  else if (man.indexOf("right") >= 0) ic = "turn_right";
  else if (man.indexOf("left") >= 0) ic = "turn_left";
  else if (man.indexOf("uturn") >= 0) ic = "refresh_cw";
  else if (man.indexOf("straight") >= 0) ic = "arrow_up";
  $("nd").innerHTML = ICN[ic] || ICN.arrow_up;

  if (navSI + 1 < steps.length) {
    var ns = steps[navSI + 1];
    var nm = ns.maneuver ? ns.maneuver.modifier || "" : "";
    var ntyp = ns.maneuver ? ns.maneuver.type || "" : "";
    var nic = "arrow_up";
    if (ntyp === "roundabout") nic = "refresh_cw";
    else if (nm.indexOf("right") >= 0) nic = "turn_right";
    else if (nm.indexOf("left") >= 0) nic = "turn_left";
    $("nnext").innerHTML = '<span style="display:inline-flex;align-items:center;gap:4px">Then ' + icn(nic, "sm") + ' ' + (ns.name || "continue") + '</span>';
  } else {
    $("nnext").textContent = "";
  }
}

function stopNav() {
  if (navOffRouteTimer) { clearTimeout(navOffRouteTimer); navOffRouteTimer = null; }
  if (markerAnimFrame) { cancelAnimationFrame(markerAnimFrame); markerAnimFrame = null; }
  markerInited = false;
  $("navp").classList.remove("on");
  $("sorb").classList.remove("on");
  $("nbar").classList.remove("on");
  $("msh").classList.remove("hid");
  $("bnav").style.display = "";
  if (wId !== null) { navigator.geolocation.clearWatch(wId); wId = null; }
  if (pMk) { map.removeLayer(pMk); pMk = null; }
  
  if (typeof resumeAmbientTracking === "function") resumeAmbientTracking();
  if (drvLy) { map.removeLayer(drvLy); drvLy = null; }
  if (S.curRoute && S.curRoute._coords) {
    if (rLy) map.removeLayer(rLy);
    if (gLy) map.removeLayer(gLy);
    gLy = L.polyline(S.curRoute._coords, {color: "#0a1428", weight: 10, opacity: 0.7, lineCap: "round"}).addTo(map);
    rLy = L.polyline(S.curRoute._coords, {color: "#22d89e", weight: 5, opacity: 0.95, lineCap: "round"}).addTo(map);
    var firstPt = S.curRoute._coords[0];
    var lastPt = S.curRoute._coords[S.curRoute._coords.length - 1];
    var isLoop = L.latLng(firstPt[0], firstPt[1]).distanceTo(L.latLng(lastPt[0], lastPt[1])) < 300;
    if (rtStartMk) map.removeLayer(rtStartMk);
    if (rtEndMk) map.removeLayer(rtEndMk);
    rtStartMk = rtEndMk = null;
    if (isLoop) rtStartMk = L.marker(firstPt, {icon: iLoop, zIndexOffset: 900}).addTo(map);
    else {
      rtStartMk = L.marker(firstPt, {icon: iA, zIndexOffset: 900}).addTo(map);
      rtEndMk = L.marker(lastPt, {icon: iB, zIndexOffset: 900}).addTo(map);
    }
  }
  var elapsed = S.navStart ? Math.round((Date.now() - S.navStart) / 60000) : 0;
  var drivenDist = S.drivenKm.toFixed(1);
  navSI = 0;
  navProgIdx = 0;
  S.lastGPS = null;
  S.navStart = null;
  S.spdHistory = [];
  S.etaHistory = [];
  S.navArrived = false;
  S.navGpsCount = 0;
  navOffRoute = false;
  navHeadingHistory = [];
  gpsFilter = {lat: 0, lng: 0, acc: 999, variance: 999};

  if (elapsed >= 1) {
    $("ml-dt").value = new Date().toISOString().split("T")[0];
    $("ml-du").value = elapsed;
    $("ml-km").value = S.drivenKm > 0 ? S.drivenKm.toFixed(1) : "";
    $("ml-sp").value = S.profile.supervisor || "";
    $("ml-nt").value = "Drove " + drivenDist + " km in " + elapsed + " min";
    document.querySelectorAll("#ml-ch .ch").forEach(function(c) { c.classList.remove("on"); });
    if (typeof updateLogSaveState === "function") updateLogSaveState();
    $("ml").classList.add("on");
    toast("Drive complete! " + drivenDist + " km driven.", {tone: "ok", icon: "check", long: true});
  }
}

$("nx").addEventListener("click", stopNav);
$("nstop").addEventListener("click", stopNav);

$("nlog").addEventListener("click", function() {
  var elapsed = S.navStart ? Math.round((Date.now() - S.navStart) / 60000) : 0;
  $("ml-dt").value = new Date().toISOString().split("T")[0];
  $("ml-du").value = elapsed > 0 ? elapsed : "";
  $("ml-km").value = S.drivenKm > 0 ? S.drivenKm.toFixed(1) : "";
  $("ml-sp").value = S.profile.supervisor || "";
  $("ml-nt").value = "In-progress: " + S.drivenKm.toFixed(1) + " km driven";
  document.querySelectorAll("#ml-ch .ch").forEach(function(c) { c.classList.remove("on"); });
  if (typeof updateLogSaveState === "function") updateLogSaveState();
  $("ml").classList.add("on");
});

function pickSmartWaypoints(pts, maxWps) {
  if (pts.length < 4) return [];

  var scores = [];
  var sampleStep = Math.max(1, Math.floor(pts.length / 300));
  for (var i = sampleStep; i < pts.length - sampleStep; i += sampleStep) {
    var prevIdx = Math.max(0, i - sampleStep * 2);
    var nextIdx = Math.min(pts.length - 1, i + sampleStep * 2);
    var b1 = bearing(pts[prevIdx][0], pts[prevIdx][1], pts[i][0], pts[i][1]);
    var b2 = bearing(pts[i][0], pts[i][1], pts[nextIdx][0], pts[nextIdx][1]);
    var diff = Math.abs(b2 - b1);
    if (diff > 180) diff = 360 - diff;
    scores.push({idx: i, score: diff, lat: pts[i][0], lng: pts[i][1]});
  }

  scores.sort(function(a, b) { return b.score - a.score; });

  var turnSlots = Math.floor(maxWps * 0.7);
  var fillerSlots = maxWps - turnSlots;

  var picked = [];

  for (var t = 0; t < scores.length && picked.length < turnSlots; t++) {
    var s = scores[t];
    if (s.score < 8) break;
    var tooClose = false;
    for (var p = 0; p < picked.length; p++) {
      if (Math.abs(picked[p].idx - s.idx) < sampleStep * 3) { tooClose = true; break; }
    }
    if (!tooClose) {
      picked.push(s);
    }
  }

  var totalPts = pts.length;
  var fillerInterval = Math.floor(totalPts / (fillerSlots + 1));
  for (var f = 1; f <= fillerSlots; f++) {
    var fi = f * fillerInterval;
    var tooCloseToTurn = false;
    for (var pp = 0; pp < picked.length; pp++) {
      if (Math.abs(picked[pp].idx - fi) < sampleStep * 3) { tooCloseToTurn = true; break; }
    }
    if (!tooCloseToTurn && fi > 0 && fi < totalPts - 1) {
      picked.push({idx: fi, score: 0, lat: pts[fi][0], lng: pts[fi][1]});
    }
  }

  picked.sort(function(a, b) { return a.idx - b.idx; });

  return picked.slice(0, maxWps);
}

function expAppleMaps() {
  if (!S.curRoute || !S.curRoute._coords || !S.startLL) return;
  var pts = S.curRoute._coords;
  var cumDist = S.curRoute._cumDist;
  var s = S.startLL;

  if (!cumDist || cumDist.length < 2) { toast("Route too short to export"); return; }
  var totalDist = cumDist[cumDist.length - 1];

  var farthestIdx = 0, farthestDist = 0;
  var startPt = L.latLng(s.lat, s.lng);
  for (var i = 0; i < pts.length; i++) {
    var d = startPt.distanceTo(L.latLng(pts[i][0], pts[i][1]));
    if (d > farthestDist) { farthestDist = d; farthestIdx = i; }
  }

  var halfDist = totalDist / 2;
  var lo = 0, hi = cumDist.length - 1;
  while (lo < hi - 1) {
    var mid = Math.floor((lo + hi) / 2);
    if (cumDist[mid] <= halfDist) lo = mid; else hi = mid;
  }
  var segLen = cumDist[hi] - cumDist[lo];
  var t = segLen > 0 ? (halfDist - cumDist[lo]) / segLen : 0;
  var midLat = pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t;
  var midLng = pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t;

  var turnLat = farthestDist > totalDist * 0.15 ? pts[farthestIdx][0] : midLat;
  var turnLng = farthestDist > totalDist * 0.15 ? pts[farthestIdx][1] : midLng;

  var url = "https://maps.apple.com/?saddr=" + s.lat.toFixed(6) + "," + s.lng.toFixed(6);
  url += "&daddr=" + turnLat.toFixed(6) + "," + turnLng.toFixed(6);
  url += "&dirflg=d";

  window.open(url, "_blank");
  toast("Navigate to the turnaround, then head back home");
}

function expGM() {
  if (!S.curRoute || !S.curRoute._coords || !S.startLL) return;
  var pts = S.curRoute._coords;
  var s = S.startLL;
  var e = {lat: pts[pts.length - 1][0], lng: pts[pts.length - 1][1]};

  var smart = pickSmartWaypoints(pts, 10);
  var wps = smart.map(function(p) { return p.lat.toFixed(6) + "," + p.lng.toFixed(6); });

  window.open(
    "https://www.google.com/maps/dir/?api=1&origin=" + s.lat + "," + s.lng +
    "&destination=" + e.lat + "," + e.lng +
    "&waypoints=" + wps.join("|") + "&travelmode=driving",
    "_blank"
  );
}
