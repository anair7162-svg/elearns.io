var OSRM_ENDPOINTS = [
  "https://router.project-osrm.org/route/v1/driving/",
  "https://routing.openstreetmap.de/routed-car/route/v1/driving/"
];

function osrm(wps, epIdx) {
  var pts = wps.map(function(w) { return w.lng + "," + w.lat; }).join(";");
  var ep = OSRM_ENDPOINTS[(epIdx || 0) % 2];
  return fetch(ep + pts + "?overview=full&geometries=geojson&steps=true&continue_straight=false")
    .then(function(r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function(d) {
      if (d.code !== "Ok" || !d.routes || !d.routes.length) throw new Error("No route");
      return d.routes[0];
    })
    .catch(function() {
      if ((epIdx || 0) > 0) return null;
      return fetch(OSRM_ENDPOINTS[1] + pts + "?overview=full&geometries=geojson&steps=true&continue_straight=false")
        .then(function(r) { return r.json(); })
        .then(function(d) { return (d.code === "Ok" && d.routes && d.routes.length) ? d.routes[0] : null; })
        .catch(function() { return null; });
    });
}

function inRad(route, center, rKm) {
  var c = route.geometry.coordinates;
  for (var i = 0; i < c.length; i++) {
    if (center.distanceTo(L.latLng(c[i][1], c[i][0])) / 1000 > rKm * 1.25) return false;
  }
  return true;
}

function haversineKm(a, b) {
  var R = 6371;
  var dLat = (b.lat - a.lat) * Math.PI / 180;
  var dLon = (b.lng - a.lng) * Math.PI / 180;
  var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function extraKmNeeded() {
  var targetKm = (W.dur / 60) * 30;
  var userWps = S.waypoints || [];
  if (!userWps.length) return targetKm;
  var start = {lat: S.startLL.lat, lng: S.startLL.lng};
  var pts = [start].concat(userWps).concat([start]);
  var minKm = 0;
  for (var i = 0; i < pts.length - 1; i++) minKm += haversineKm(pts[i], pts[i + 1]) * 1.3;
  return Math.max(0, targetKm - minKm);
}

function makeLoopWps(attempt, baseAng) {
  var start = L.latLng(S.startLL.lat, S.startLL.lng);
  var userWps = S.waypoints || [];
  var wps = [start];
  var shrink = W._shrink || 0.55;

  if (userWps.length) {
    var ordered = userWps.slice();
    if (attempt % 2 === 0) ordered.reverse();
    ordered.forEach(function(w) { wps.push(L.latLng(w.lat, w.lng)); });

    var extraKm = extraKmNeeded();
    if (extraKm > 0.5) {
      var fillRad = Math.max(0.3, extraKm / (Math.PI));
      var midLat = userWps.reduce(function(s, w) { return s + w.lat; }, 0) / userWps.length;
      var midLng = userWps.reduce(function(s, w) { return s + w.lng; }, 0) / userWps.length;
      var oppAng = Math.atan2(midLat - start.lat, midLng - start.lng) + Math.PI;
      var nFill = Math.min(3, Math.max(1, Math.round(extraKm / 3)));
      var jitter = (attempt % 3 - 1) * 0.35;
      for (var f = 0; f < nFill; f++) {
        var frac = (f + 0.5) / nFill;
        var ang = oppAng + jitter + (f - nFill / 2) * 0.45;
        var dist = fillRad * (0.5 + frac * 0.5);
        var fLa = (dist * Math.sin(ang)) / 110.574;
        var fLo = (dist * Math.cos(ang)) / (111.320 * Math.cos(start.lat * Math.PI / 180));
        wps.push(L.latLng(start.lat + fLa, start.lng + fLo));
      }
    } else {
      var midLat2 = userWps.reduce(function(s, w) { return s + w.lat; }, 0) / userWps.length;
      var midLng2 = userWps.reduce(function(s, w) { return s + w.lng; }, 0) / userWps.length;
      var bAng = Math.atan2(midLat2 - start.lat, midLng2 - start.lng) + Math.PI;
      var bDist = Math.max(0.3, W.rad * shrink * 0.3);
      wps.push(L.latLng(
        start.lat + (bDist * Math.sin(bAng)) / 110.574,
        start.lng + (bDist * Math.cos(bAng)) / (111.320 * Math.cos(start.lat * Math.PI / 180))
      ));
    }
  } else {
    var diff = W.diff || 2;
    var targetKm2 = (W.dur / 60) * 30;
    var calcRad = targetKm2 / 2.5;
    var useRad = Math.min(calcRad, W.rad);
    useRad = useRad * shrink;
    var nw = Math.min(2 + diff, 7);
    var dir = (attempt % 2 === 0) ? 1 : -1;
    var sweepBase = 0.8 + diff * 0.25;
    var sweep = Math.PI * (sweepBase + Math.random() * 0.4);
    var prefScore = 0, prefCount = 0;
    for (var pk in W.prefs) {
      if (W.prefs[pk] > 0) { prefScore += W.prefs[pk]; prefCount++; }
    }
    var prefIntensity = prefCount > 0 ? prefScore / (prefCount * 5) : 0.5;
    var radMultiplier = 0.7 + prefIntensity * 0.6;
    for (var j = 0; j < nw; j++) {
      var frac2 = (j + 1) / (nw + 1);
      var ang2 = baseAng + dir * sweep * frac2;
      if (diff >= 4) ang2 += (Math.random() - 0.5) * 0.6;
      var dist2 = useRad * radMultiplier * (0.5 + Math.random() * 0.5);
      var la = (dist2 * Math.sin(ang2)) / 110.574;
      var lo = (dist2 * Math.cos(ang2)) / (111.320 * Math.cos(start.lat * Math.PI / 180));
      wps.push(L.latLng(start.lat + la, start.lng + lo));
    }
  }

  wps.push(start);
  return wps;
}

function doGen() {
  var gb = $("wgen");
  if (gb) { gb.innerHTML = '<span class="ld"></span> Generating...'; gb.disabled = true; }
  S.genRoutes = [];
  var collected = 0, total = 3, attempt = 0, maxAttempt = 28;
  var hasUserWps = (S.waypoints && S.waypoints.length > 0);

  if (!hasUserWps) {
    var targetKm = (W.dur / 60) * 30;
    var calcRad = targetKm / 2.5;
    W._shrink = Math.min(calcRad / Math.max(W.rad, 0.1), 0.98);
    W._shrink = Math.max(W._shrink, 0.25);
  } else {
    W._shrink = 0.55;
  }

  var baseAng = Math.random() * 2 * Math.PI;
  var start = L.latLng(S.startLL.lat, S.startLL.lng);

  function tryOne() {
    if (collected >= total || attempt >= maxAttempt) { finGen(); return; }
    attempt++;
    var wps = makeLoopWps(attempt, baseAng + (attempt - 1) * 0.38);
    osrm(wps).then(function(route) {
      if (!route) { tryOne(); return; }
      var dist = route.distance / 1000;
      if (dist < 0.3) { tryOne(); return; }
      if (!hasUserWps && !inRad(route, start, W.rad)) { W._shrink *= 0.78; tryOne(); return; }
      var isDup = false;
      for (var i = 0; i < S.genRoutes.length; i++) {
        if (Math.abs(S.genRoutes[i].distance - dist) < 0.5) { isDup = true; break; }
      }
      if (isDup) { tryOne(); return; }
      S.genRoutes.push({
        distance: dist,
        duration: route.duration / 60,
        steps: route.legs ? route.legs.reduce(function(a, l) { return a.concat(l.steps || []); }, []) : [],
        geometry: route.geometry
      });
      collected++;
      var ratio = (route.duration / 60) / W.dur;
      if (!hasUserWps) {
        if (ratio < 0.5) {
          W._shrink = Math.min(W._shrink * (1 / ratio) * 0.7, 0.98);
        } else if (ratio < 0.75) {
          W._shrink = Math.min(W._shrink * 1.4, 0.98);
        } else if (ratio > 1.5) {
          W._shrink *= 0.6;
        } else if (ratio > 1.2) {
          W._shrink *= 0.82;
        }
      }
      tryOne();
    });
  }
  tryOne();
}

function finGen() {
  if (!S.genRoutes.length) {
    toast("Could not generate routes \u2014 try adjusting radius or duration", {tone: "warn"});
    var gb = $("wgen");
    if (gb) { gb.textContent = "Generate Routes"; gb.disabled = false; }
    return;
  }
  S.genRoutes.sort(function(a, b) { return Math.abs(a.duration - W.dur) - Math.abs(b.duration - W.dur); });
  S.genIdx = 0;
  closeW();
  drawRoute(0);
  showResult();
  if (!W.skipSave) saveRt(S.genRoutes[0]);
  W.skipSave = false;
}

$("sh-tog").addEventListener("click", function() {
  var msh = $("msh");
  msh.classList.toggle("mini");
  $("sh-tog").innerHTML = icn(msh.classList.contains("mini") ? "chevron_up" : "chevron_down", "sm");
});

function drawRoute(idx) {
  if (rLy) map.removeLayer(rLy);
  if (gLy) map.removeLayer(gLy);
  if (rCir) map.removeLayer(rCir);
  if (drvLy) map.removeLayer(drvLy);
  drvLy = null;
  if (rtStartMk) map.removeLayer(rtStartMk);
  if (rtEndMk) map.removeLayer(rtEndMk);
  rtStartMk = rtEndMk = null;
  var rd = S.genRoutes[idx];
  if (!rd) return;
  var coords = rd.geometry.coordinates.map(function(c) { return [c[1], c[0]]; });
  rd._coords = coords;
  rd._cumDist = [0];
  for (var i = 1; i < coords.length; i++) {
    rd._cumDist.push(rd._cumDist[i - 1] + L.latLng(coords[i - 1][0], coords[i - 1][1]).distanceTo(L.latLng(coords[i][0], coords[i][1])));
  }
  gLy = L.polyline(coords, {color: "#0a1428", weight: 10, opacity: 0.6, lineCap: "round", lineJoin: "round"}).addTo(map);
  var totalD = rd._cumDist[rd._cumDist.length - 1];
  var segGroup = L.layerGroup().addTo(map);
  var segSize = Math.max(4, Math.floor(coords.length / 40));
  for (var si = 0; si < coords.length - 1; si += segSize) {
    var ei = Math.min(si + segSize + 1, coords.length);
    var seg = coords.slice(si, ei);
    if (seg.length < 2) continue;
    var frac = totalD > 0 ? rd._cumDist[si] / totalD : 0;
    var r2 = Math.round(34 + (77 - 34) * frac);
    var g2 = Math.round(216 + (158 - 216) * frac);
    var b2 = Math.round(158 + (255 - 158) * frac);
    L.polyline(seg, {color: "rgb(" + r2 + "," + g2 + "," + b2 + ")", weight: 5, opacity: 0.95, lineCap: "round", lineJoin: "round"}).addTo(segGroup);
  }
  rLy = segGroup;
  var startPt = L.latLng(S.startLL.lat, S.startLL.lng);
  if (!(S.waypoints && S.waypoints.length)) {
    rCir = L.circle(startPt, {
      radius: W.rad * 1000, color: "#22d89e", weight: 1, opacity: 0.2,
      fillColor: "#22d89e", fillOpacity: 0.02, dashArray: "8 10"
    }).addTo(map);
  }
  var firstPt = coords[0], lastPt = coords[coords.length - 1];
  var isLoop = L.latLng(firstPt[0], firstPt[1]).distanceTo(L.latLng(lastPt[0], lastPt[1])) < 300;
  if (isLoop) {
    rtStartMk = L.marker(firstPt, {icon: iLoop, zIndexOffset: 900}).addTo(map).bindPopup("Start / Finish (Loop)");
  } else {
    rtStartMk = L.marker(firstPt, {icon: iA, zIndexOffset: 900}).addTo(map).bindPopup("A \u2014 Start");
    rtEndMk = L.marker(lastPt, {icon: iB, zIndexOffset: 900}).addTo(map).bindPopup("B \u2014 Destination");
  }
  if (S.waypoints && S.waypoints.length) {
    S.waypoints.forEach(function(w, i) {
      if (w.marker) map.removeLayer(w.marker);
      w.marker = L.marker([w.lat, w.lng], {icon: mkWaypointIcon(i + 1), zIndexOffset: 950}).addTo(map)
        .bindPopup("Waypoint " + (i + 1) + ": " + w.label);
    });
  }
  var sheetHeight = Math.round(window.innerHeight * 0.42) + 90;
  map.fitBounds(L.latLngBounds(coords), {
    paddingTopLeft: [30, 70],
    paddingBottomRight: [30, sheetHeight]
  });
  S.curRoute = rd;
  $("msh").classList.remove("mini");
  $("sh-tog").innerHTML = icn("chevron_down", "sm");
  if (S.poiCache && S.poiCache.length) renderPOIs(rd, S.poiCache);
  else fetchPOIs(rd);
}

var POI_MAP = {
  "parking":      {q: '["amenity"="parking"]',          icon: "square_parking", css: "poi-parking",    label: "Parking Lot"},
  "roundabouts":  {q: '["junction"="roundabout"]',      icon: "refresh_cw",     css: "poi-roundabout", label: "Roundabout"},
  "hills":        {q: '["natural"="peak"]',             icon: "mountain",       css: "poi-hill",       label: "Hill / Incline"},
  "main-roads":   {q: '["amenity"="fuel"]',             icon: "fuel",           css: "poi-fuel",       label: "Fuel Station"},
  "residential":  {q: '["amenity"="school"]',           icon: "school",         css: "poi-school",     label: "School Zone"},
  "multi-lane":   {q: '["highway"="traffic_signals"]',  icon: "traffic_light",  css: "poi-traffic",    label: "Traffic Signals"}
};

function fetchPOIs(rd) {
  if (!rd._coords || !rd._coords.length) return;
  /* Show a persistent loading toast — POIs use the Overpass API which can take
     10-20 seconds on busy days. Users should know the landmarks are coming. */
  toast("Loading landmarks \u2014 this can take 10-20 seconds",
        {id: "poi-load", persist: true, long: true, tone: "info", icon: "loader"});
  var bounds = L.latLngBounds(rd._coords);
  var s = bounds.getSouth() - .012, bw = bounds.getWest() - .012;
  var n = bounds.getNorth() + .012, e = bounds.getEast() + .012;
  var bbox = s + "," + bw + "," + n + "," + e;
  var queries = "";
  Object.keys(POI_MAP).forEach(function(t) {
    var pm = POI_MAP[t];
    queries += "node" + pm.q + "(" + bbox + ");way" + pm.q + "(" + bbox + ");";
  });

  /* Multiple Overpass mirrors. Primary often gets rate-limited or times out
     during peak hours — when that happens we fall through to the next mirror
     instead of surfacing a scary error toast. The server-side [timeout:25]
     gives each request enough headroom; the old [timeout:12] was tight enough
     that the server would abort mid-query. */
  var OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter"
  ];
  var body = "[out:json][timeout:25];(" + queries + ");out center 60;";

  function tryMirror(idx) {
    if (idx >= OVERPASS_ENDPOINTS.length) {
      /* All mirrors exhausted. Don't leave the persistent loader on screen. */
      dismissToast("poi-load");
      toast("Couldn't load landmarks \u2014 tap a route to retry", {tone: "warn"});
      return;
    }
    /* POST form-encoded is the recommended way to send large Overpass queries
       and avoids URL-length limits that caused some requests to 414. */
    fetch(OVERPASS_ENDPOINTS[idx], {
      method: "POST",
      headers: {"Content-Type": "application/x-www-form-urlencoded"},
      body: "data=" + encodeURIComponent(body)
    }).then(function(r) {
      /* 429 = rate limited, 504 = server-side timeout, 502/503 = mirror down.
         All three happen regularly on the public Overpass instances and are
         the real cause of the "error loading landmarks" message the user was
         seeing — the request didn't actually fail, just this particular mirror
         did. Try the next mirror before giving up. */
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function(data) {
      dismissToast("poi-load");
      if (!data || !data.elements || !data.elements.length) {
        toast("No landmarks found along this route", {tone: "info"});
        return;
      }
      S.poiCache = data.elements;
      renderPOIs(rd, data.elements);
    }).catch(function() {
      /* Silent retry on the next mirror — keep the "Loading landmarks" toast
         visible so the user doesn't see a success-then-fail-then-success
         flicker. */
      tryMirror(idx + 1);
    });
  }

  tryMirror(0);
}

function renderPOIs(rd, elements) {
  if (poiLy) { map.removeLayer(poiLy); poiLy = null; }
  poiLy = L.layerGroup().addTo(map);
  var routePts = rd.geometry.coordinates.filter(function(c, i) { return i % 8 === 0; })
    .map(function(c) { return L.latLng(c[1], c[0]); });

  var candidates = [];
  elements.forEach(function(el) {
    var lat = el.lat || (el.center ? el.center.lat : null);
    var lon = el.lon || (el.center ? el.center.lon : null);
    if (!lat || !lon) return;
    var pt = L.latLng(lat, lon);
    var minDist = Infinity;
    routePts.forEach(function(rp) { var d = rp.distanceTo(pt); if (d < minDist) minDist = d; });
    if (minDist > 500) return;
    var tags = el.tags || {};
    var poiType = null;
    if (tags.amenity === "parking") poiType = "parking";
    else if (tags.junction === "roundabout") poiType = "roundabouts";
    else if (tags.natural === "peak") poiType = "hills";
    else if (tags.amenity === "fuel") poiType = "main-roads";
    else if (tags.amenity === "school") poiType = "residential";
    else if (tags.highway === "traffic_signals") poiType = "multi-lane";
    if (!poiType || !POI_MAP[poiType]) return;
    candidates.push({lat: lat, lon: lon, dist: minDist, tags: tags, poiType: poiType});
  });

  candidates.sort(function(a, b) { return a.dist - b.dist; });

  var maxShow = candidates.length > 15 ? Math.floor(candidates.length * 0.8) : candidates.length;
  maxShow = Math.min(maxShow, 30);

  var onC = 0, nearC = 0;
  for (var ci = 0; ci < maxShow; ci++) {
    var c = candidates[ci];
    var onRoute = c.dist < 120;
    var pm = POI_MAP[c.poiType];
    var name = c.tags.name || pm.label;
    if (onRoute) onC++; else nearC++;
    var div = document.createElement("div");
    div.className = "poi-mk " + pm.css;
    div.innerHTML = ICN[pm.icon] || "";
    var ico = L.divIcon({className: "", html: div.outerHTML, iconSize: [32, 38], iconAnchor: [16, 38]});
    var mk = L.marker([c.lat, c.lon], {icon: ico}).addTo(poiLy);
    var popHtml = '<div style="font-family:var(--f);min-width:180px">';
    popHtml += '<div style="font-weight:700;font-size:13px;margin-bottom:4px;display:flex;align-items:center;gap:6px;letter-spacing:-.2px">' + icn(pm.icon, "sm") + ' ' + name + '</div>';
    popHtml += '<div style="font-size:11px;color:#888;margin-bottom:2px;font-weight:500">' + pm.label + '</div>';
    popHtml += '<div style="font-size:11px;font-weight:700;color:' + (onRoute ? "#22d89e" : "#4d9eff") + ';margin-bottom:8px">';
    popHtml += onRoute ? "On your route" : "~" + Math.round(c.dist) + "m away";
    popHtml += '</div>';
    popHtml += '<button onclick="rerouteViaPOI(' + c.lat + ',' + c.lon + ')" ';
    popHtml += 'style="width:100%;padding:9px;border-radius:10px;background:' + (onRoute ? "var(--bg3)" : "var(--acc)") + ';color:' + (onRoute ? "var(--t1)" : "#060a12") + ';border:' + (onRoute ? "1px solid var(--brd2)" : "none") + ';font-weight:700;font-size:12px;font-family:var(--f);cursor:pointer;letter-spacing:-.1px">';
    popHtml += onRoute ? "Reroute via here" : "Route via here";
    popHtml += '</button>';
    popHtml += '</div>';
    mk.bindPopup(popHtml, {className: "poi-popup", maxWidth: 220});
  }

  if (onC > 0 || nearC > 0) toast(onC + " on route, " + nearC + " nearby landmarks", {tone: "info", icon: "map_pin"});
}

window.rerouteViaPOI = function(lat, lon) {
  if (!S.curRoute || !S.startLL) return;
  map.closePopup();
  toast("Rerouting via landmark...");

  var coords = S.curRoute._coords;
  if (!coords || coords.length < 2) { toast("No route to extend"); return; }

  var poiPt = L.latLng(lat, lon);
  var nearestIdx = 0, nearestDist = Infinity;
  for (var i = 0; i < coords.length; i++) {
    var d = poiPt.distanceTo(L.latLng(coords[i][0], coords[i][1]));
    if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
  }

  var insertLL = L.latLng(coords[nearestIdx][0], coords[nearestIdx][1]);

  osrm([insertLL, poiPt, insertLL]).then(function(detour) {
    if (!detour) { toast("Could not reroute"); return; }

    var detourCoords = detour.geometry.coordinates.map(function(c) { return [c[1], c[0]]; });
    var before = coords.slice(0, nearestIdx + 1);
    var after = coords.slice(nearestIdx);
    var spliced = before.concat(detourCoords.slice(1, detourCoords.length - 1)).concat(after);

    var cumDist = [0];
    for (var i = 1; i < spliced.length; i++) {
      cumDist.push(cumDist[i - 1] +
        L.latLng(spliced[i - 1][0], spliced[i - 1][1]).distanceTo(L.latLng(spliced[i][0], spliced[i][1])));
    }
    var totalDist = cumDist[cumDist.length - 1] / 1000;

    var detourSteps = detour.legs ? detour.legs.reduce(function(a, l) { return a.concat(l.steps || []); }, []) : [];
    var existingSteps = S.curRoute.steps || [];
    var stepsPerCoord = existingSteps.length / Math.max(coords.length, 1);
    var splitAt = Math.min(Math.floor(nearestIdx * stepsPerCoord) + 1, existingSteps.length);
    var newSteps = existingSteps.slice(0, splitAt).concat(detourSteps).concat(existingSteps.slice(splitAt));

    var newRd = {
      distance: totalDist,
      duration: S.curRoute.duration + (detour.duration / 60),
      steps: newSteps,
      geometry: {type: "LineString", coordinates: spliced.map(function(c) { return [c[1], c[0]]; })},
      _coords: spliced,
      _cumDist: cumDist
    };

    S.genRoutes[S.genIdx] = newRd;
    S.curRoute = newRd;

    if (rLy) map.removeLayer(rLy);
    if (gLy) map.removeLayer(gLy);
    gLy = L.polyline(spliced, {color: "#0a1428", weight: 10, opacity: 0.6, lineCap: "round", lineJoin: "round"}).addTo(map);
    var totalD = cumDist[cumDist.length - 1];
    var segGroup = L.layerGroup().addTo(map);
    var segSize = Math.max(4, Math.floor(spliced.length / 40));
    for (var si = 0; si < spliced.length - 1; si += segSize) {
      var ei = Math.min(si + segSize + 1, spliced.length);
      var seg = spliced.slice(si, ei);
      if (seg.length < 2) continue;
      var frac = totalD > 0 ? cumDist[si] / totalD : 0;
      var r2 = Math.round(34 + (77 - 34) * frac);
      var g2 = Math.round(216 + (158 - 216) * frac);
      var b2 = Math.round(158 + (255 - 158) * frac);
      L.polyline(seg, {color: "rgb(" + r2 + "," + g2 + "," + b2 + ")", weight: 5, opacity: 0.95, lineCap: "round", lineJoin: "round"}).addTo(segGroup);
    }
    rLy = segGroup;
    var sheetH2 = Math.round(window.innerHeight * 0.42) + 90;
    map.fitBounds(L.latLngBounds(spliced), {paddingTopLeft: [30, 70], paddingBottomRight: [30, sheetH2]});
    showResult();
    toast("Rerouted via landmark \u2014 +" + Math.round(detour.duration / 60) + " min", {tone: "ok"});
  });
};

function showResult() {
  var rd = S.genRoutes[S.genIdx];
  if (!rd) return;
  var diff = getDiff(W.diff || 2);
  var diffPill = diff.level >= 4 ? "pill-d" : (diff.level >= 3 ? "pill-w" : "pill-a");
  var dur_diff = Math.round(rd.duration - W.dur);
  var wh = '<div class="durw';
  if (dur_diff > 15) wh += ' ov">' + icn("alert_triangle", "sm") + ' <span>~' + dur_diff + ' min over target (' + fm(W.dur) + ')</span></div>';
  else if (dur_diff < -15) wh += ' un">' + icn("info", "sm") + ' <span>~' + Math.abs(dur_diff) + ' min under target</span></div>';
  else wh += '"></div>';

  var wpCount = S.waypoints && S.waypoints.length;
  var car = '<div class="rcar">';
  S.genRoutes.forEach(function(r, i) {
    car += '<div class="rcar-item' + (i === S.genIdx ? " on" : "") + '" data-gi="' + i + '">';
    car += 'Loop ' + (i + 1) + ' \u00B7 ' + r.distance.toFixed(1) + 'km \u00B7 ' + Math.round(r.duration) + 'min</div>';
  });
  car += '</div>';

  var lt = S.profile.licence_type || "L";
  var ltLabel = lt === "L" ? "LEARNER" : lt === "P1" ? "P1" : "P2";

  var h = '<h3>' + icn("sparkles") + ' Loop Ready <span class="pill pill-a">' + ltLabel + '</span> <span class="pill ' + diffPill + '">' + diff.label + '</span></h3>';
  h += car;
  h += '<div class="rstats">';
  h += '<div class="rs"><div class="rv">' + rd.distance.toFixed(1) + '</div><div class="rl">km route</div></div>';
  h += '<div class="rs"><div class="rv">' + Math.round(rd.duration) + '</div><div class="rl">minutes</div></div>';
  h += '<div class="rs"><div class="rv">' + (wpCount ? wpCount + " pts" : "Loop") + '</div><div class="rl">' + (wpCount ? "waypoints" : "type") + '</div></div>';
  h += '</div>';
  h += diffHtml(diff);

  if (wpCount) {
    h += '<div style="margin:10px 0 4px;font-size:10px;font-weight:800;color:var(--t3);text-transform:uppercase;letter-spacing:.9px">Via waypoints</div>';
    h += renderWaypointList();
    h += '<button class="btn bs bsm" id="rwp-clr" style="margin-top:4px;margin-bottom:6px">' + icn("x", "sm") + ' Clear Waypoints</button>';
  }

  if (S.weather) h += wxHtml(S.weather);
  h += wh;

  h += '<div class="ar">';
  h += '<button class="btn ba" id="rgo">' + icn("play", "sm") + ' Start Drive</button>';
  h += '<button class="btn bs" id="rprev" style="flex:none;padding:12px 16px">' + icn("eye", "sm") + ' Preview</button>';
  h += '</div>';

  h += '<div class="ar" style="margin-top:6px">';
  h += '<button class="btn btn-beta" id="rexp" style="flex:1;padding:12px 14px">' + icn("navigation", "sm") + ' Google Maps</button>';
  h += '</div>';
  h += '<div style="text-align:center;font-size:10px;color:var(--t3);margin-top:4px;line-height:1.5;letter-spacing:-.05px">';
  h += 'Open route in your preferred navigation app for turn-by-turn directions</div>';

  h += '<div class="ar" style="margin-top:8px">';
  h += '<button class="btn btn-log-inline" id="rlog" style="flex:1">' + icn("book_open", "sm") + ' Log This Route to Logbook</button>';
  h += '</div>';

  h += renderStopUI();

  h += '<div class="ar" style="margin-top:6px">';
  h += '<button class="btn bs bsm" id="rreb">Rebuild</button>';
  h += '<button class="btn bs bsm" id="rnew">' + icn("plus", "sm") + ' New</button>';
  h += '<button class="btn bs bsm" id="rclr">Clear</button>';
  h += '</div>';

  $("sh").innerHTML = h;
  if (typeof hydrateIcons === "function") hydrateIcons($("sh"));

  document.querySelectorAll(".rcar-item").forEach(function(el) {
    el.addEventListener("click", function() {
      S.genIdx = parseInt(el.getAttribute("data-gi"));
      drawRoute(S.genIdx);
      showResult();
    });
  });
  $("rgo").addEventListener("click", startNav);
  $("rexp").addEventListener("click", function() {
    var rd = S.genRoutes[S.genIdx];
    expGM();
    if (!rd) return;
    S._gmNavStarted = Date.now();
    S._gmNavRoute = rd;
    editingLogIdx = -1;
    $("ml-dt").value = new Date().toISOString().split("T")[0];
    $("ml-du").value = Math.round(rd.duration) || "";
    $("ml-td").value = (new Date().getHours() >= 18 || new Date().getHours() < 6) ? "night" : "day";
    $("ml-sp").value = S.profile.supervisor || "";
    $("ml-nt").value = "Google Maps drive: " + rd.distance.toFixed(1) + " km loop";
    document.querySelectorAll("#ml-ch .ch").forEach(function(c) { c.classList.remove("on"); });
    $("ml").querySelector("h3").innerHTML = icn("edit") + " Log Drive";
    updateLogSaveState();
    $("ml").classList.add("on");
  });
  $("rreb").addEventListener("click", openW);
  $("rprev").addEventListener("click", startPreview);
  $("rnew").addEventListener("click", function() { toast("Generating..."); addOneRoute(); });
  var rlogBtn = $("rlog");
  if (rlogBtn) rlogBtn.addEventListener("click", function() {
    var rd = S.genRoutes[S.genIdx];
    if (!rd) return;
    editingLogIdx = -1;
    $("ml-dt").value = new Date().toISOString().split("T")[0];
    $("ml-du").value = Math.round(rd.duration) || "";
    $("ml-td").value = (new Date().getHours() >= 18 || new Date().getHours() < 6) ? "night" : "day";
    $("ml-sp").value = S.profile.supervisor || "";
    $("ml-nt").value = "Route: " + rd.distance.toFixed(1) + " km, " + Math.round(rd.duration) + " min loop";
    document.querySelectorAll("#ml-ch .ch").forEach(function(c) { c.classList.remove("on"); });
    $("ml").querySelector("h3").innerHTML = icn("edit") + " Log Drive";
    updateLogSaveState();
    $("ml").classList.add("on");
  });
  $("rclr").addEventListener("click", function() {
    clrAll();
    S.curRoute = null;
    S.genRoutes = [];
    S.poiCache = null;
    S.stops = [];
    S.addingStop = false;
    if (S.startLL) sMk = L.marker([S.startLL.lat, S.startLL.lng], {icon: iS}).addTo(map);
    showWelcome();
  });
  var rwpc = $("rwp-clr");
  if (rwpc) rwpc.addEventListener("click", function() {
    clearWaypoints();
    drawRoute(S.genIdx);
    showResult();
  });
  bindStopEvents();
}

function addOneRoute() {
  var start = L.latLng(S.startLL.lat, S.startLL.lng);
  var tries = 0, baseAng = Math.random() * 2 * Math.PI;
  var hasUserWps = (S.waypoints && S.waypoints.length > 0);

  function go() {
    if (tries >= 7) { toast("Could not find another route"); return; }
    tries++;
    var wps = makeLoopWps(tries, baseAng + tries * 0.6);
    osrm(wps).then(function(route) {
      if (!route) { go(); return; }
      var dist = route.distance / 1000;
      var isDup = false;
      S.genRoutes.forEach(function(e) { if (Math.abs(e.distance - dist) < 0.5) isDup = true; });
      if (isDup) { go(); return; }
      if (!hasUserWps && !inRad(route, start, W.rad)) { go(); return; }
      S.genRoutes.push({
        distance: dist,
        duration: route.duration / 60,
        steps: route.legs ? route.legs.reduce(function(a, l) { return a.concat(l.steps || []); }, []) : [],
        geometry: route.geometry
      });
      S.genIdx = S.genRoutes.length - 1;
      drawRoute(S.genIdx);
      showResult();
      toast("Route " + (S.genIdx + 1) + " added");
    });
  }
  go();
}
