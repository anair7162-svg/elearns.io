var acTimer = null;

function buildSearchUrl(query, limit) {
  var url = "https://nominatim.openstreetmap.org/search?format=json&limit=" + limit + "&addressdetails=1&dedupe=0";
  url += "&countrycodes=au";
  if (S.userLL) {
    url += "&viewbox=" +
      (S.userLL.lng - 0.15) + "," + (S.userLL.lat + 0.15) + "," +
      (S.userLL.lng + 0.15) + "," + (S.userLL.lat - 0.15);
    url += "&bounded=0";
  }
  url += "&q=" + encodeURIComponent(query);
  return url;
}

function buildStructuredUrl(street, limit) {
  var url = "https://nominatim.openstreetmap.org/search?format=json&limit=" + limit + "&addressdetails=1";
  url += "&countrycodes=au";
  url += "&street=" + encodeURIComponent(street);
  if (S.userLL) {
    url += "&viewbox=" +
      (S.userLL.lng - 0.15) + "," + (S.userLL.lat + 0.15) + "," +
      (S.userLL.lng + 0.15) + "," + (S.userLL.lat - 0.15);
    url += "&bounded=0";
  }
  return url;
}

function hasHouseNumber(query) {
  return /^\d+[a-zA-Z]?\s/.test(query.trim());
}

function searchWithFallback(query, limit, cb) {
  var urls = [buildSearchUrl(query, limit)];
  if (hasHouseNumber(query)) {
    urls.unshift(buildStructuredUrl(query, limit));
  }

  function tryNext(idx) {
    if (idx >= urls.length) {
      var nswQuery = query + ", NSW, Australia";
      fetch("https://nominatim.openstreetmap.org/search?format=json&limit=" + limit +
        "&addressdetails=1&q=" + encodeURIComponent(nswQuery))
        .then(function(r) { return r.json(); })
        .then(function(results) { cb(results || []); })
        .catch(function() { cb([]); });
      return;
    }
    fetch(urls[idx])
      .then(function(r) { return r.json(); })
      .then(function(results) {
        if (results && results.length) {
          if (hasHouseNumber(query)) {
            var withNum = results.filter(function(r) {
              return r.address && r.address.house_number;
            });
            if (withNum.length) { cb(withNum); return; }
          }
          cb(results);
        } else {
          tryNext(idx + 1);
        }
      })
      .catch(function() { tryNext(idx + 1); });
  }

  tryNext(0);
}

function formatResult(r) {
  var addr = r.address || {};
  var houseNum = addr.house_number || "";
  var road = addr.road || addr.pedestrian || addr.footway || "";
  var suburb = addr.suburb || addr.town || addr.city || addr.village || "";
  var state = addr.state || "";
  var postcode = addr.postcode || "";
  var placeName = addr.amenity || addr.shop || addr.building || addr.leisure || "";

  var mainLine = "";
  if (houseNum && road) {
    mainLine = houseNum + " " + road;
  } else if (placeName && road) {
    mainLine = placeName + ", " + road;
  } else if (placeName) {
    mainLine = placeName;
  } else if (road) {
    mainLine = road;
  } else {
    mainLine = r.display_name.split(",").slice(0, 2).join(",").trim();
  }

  if (suburb && mainLine.indexOf(suburb) === -1) {
    mainLine += ", " + suburb;
  }

  var subParts = [state, postcode].filter(Boolean);
  var subLine = subParts.join(" ");
  var type = r.type || "";
  if (type && type !== "yes" && type !== "house" && type !== "residential") {
    type = type.charAt(0).toUpperCase() + type.slice(1);
    subLine = subLine ? type + " \u00B7 " + subLine : type;
  }

  return {main: mainLine, sub: subLine, full: r.display_name};
}

function sortByProximity(results) {
  if (!S.userLL || !results.length) return results;
  var userLat = S.userLL.lat, userLng = S.userLL.lng;
  results.forEach(function(r) {
    var dLat = parseFloat(r.lat) - userLat;
    var dLng = parseFloat(r.lon) - userLng;
    r._dist = Math.sqrt(dLat * dLat + dLng * dLng);
  });
  results.sort(function(a, b) { return a._dist - b._dist; });
  return results;
}

$("sinp").addEventListener("input", function() {
  var q = this.value.trim();
  clearTimeout(acTimer);
  if (q.length < 2) { $("ac-drop").classList.remove("on"); return; }
  acTimer = setTimeout(function() {
    searchWithFallback(q, 8, function(results) {
      var drop = $("ac-drop");
      if (!results.length) {
        drop.innerHTML = '<div class="ac-item">' +
          '<span class="ac-icon">' + icn("search", "sm") + '</span>' +
          '<span class="ac-text">No results</span></div>';
        if (typeof hydrateIcons === "function") hydrateIcons(drop);
        drop.classList.add("on");
        return;
      }
      results = sortByProximity(results);
      drop.innerHTML = "";
      results.forEach(function(r) {
        var d = document.createElement("div");
        d.className = "ac-item";
        var fmt = formatResult(r);
        d.innerHTML = '<span class="ac-icon">' + icn("map_pin", "sm") + '</span>' +
          '<div style="flex:1;min-width:0">' +
          '<div class="ac-text">' + fmt.main + '</div>' +
          '<div class="ac-sub">' + fmt.sub + '</div>' +
          '</div>';
        d.addEventListener("click", function() {
          $("sinp").value = fmt.main;
          drop.classList.remove("on");
          pinLocation(parseFloat(r.lat), parseFloat(r.lon), fmt.full);
        });
        drop.appendChild(d);
      });
      if (typeof hydrateIcons === "function") hydrateIcons(drop);
      drop.classList.add("on");
    });
  }, 280);
});

$("sinp").addEventListener("keypress", function(e) {
  if (e.key === "Enter") { $("ac-drop").classList.remove("on"); doDestSearch(); }
});

$("sbtn").addEventListener("click", function() {
  $("ac-drop").classList.remove("on");
  doDestSearch();
});

document.addEventListener("click", function(e) {
  if (!e.target.closest(".mtop")) $("ac-drop").classList.remove("on");
});

function doDestSearch() {
  var q = $("sinp").value.trim();
  if (!q) return;
  searchWithFallback(q, 3, function(results) {
    if (!results.length) { toast("Not found"); return; }
    results = sortByProximity(results);
    var fmt = formatResult(results[0]);
    pinLocation(parseFloat(results[0].lat), parseFloat(results[0].lon), fmt.main);
  });
}

var pinnedLocation = null, pinnedMarker = null;

function pinLocation(lat, lng, label) {
  pinnedLocation = {lat: lat, lng: lng, label: label};
  if (pinnedMarker) map.removeLayer(pinnedMarker);
  pinnedMarker = L.marker([lat, lng], {icon: iDest, zIndexOffset: 800}).addTo(map).bindPopup(label).openPopup();
  map.setView([lat, lng], 17);
  showPinnedBanner(label, lat, lng);
}

function showPinnedBanner(label, lat, lng) {
  var banner = $("mban");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "mban";
    banner.className = "mban";
    $("s-map").appendChild(banner);
  }
  banner.className = "mban on";
  banner.innerHTML =
    '<div class="mban-ico">' + icn("map_pin") + '</div>' +
    '<div style="flex:1;min-width:0">' +
      '<div style="color:var(--t1);font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:-.2px">' + label + '</div>' +
      '<div style="font-size:11px;color:var(--t3);margin-top:2px;font-weight:500">' +
        (S.curRoute ? 'Add to existing route' : 'Add as waypoint for loop') +
      '</div>' +
    '</div>' +
    '<button class="btn ba" id="mban-add" style="flex:none;padding:9px 14px;font-size:12px;white-space:nowrap">' + icn("plus", "sm") + ' Waypoint</button>' +
    '<button class="bg" id="mban-x" style="padding:8px;color:var(--t3);flex-shrink:0">' + icn("x", "lg") + '</button>';
  $("mban-add").addEventListener("click", function() { addWaypoint(lat, lng, label); });
  $("mban-x").addEventListener("click", dismissBanner);
}

function dismissBanner() {
  var banner = $("mban");
  if (banner) banner.classList.remove("on");
  if (pinnedMarker) { map.removeLayer(pinnedMarker); pinnedMarker = null; }
  pinnedLocation = null;
  $("sinp").value = "";
}

if (!S.waypoints) S.waypoints = [];

function mkWaypointIcon(num) {
  var d = document.createElement("div");
  d.className = "mk-label mk-label-wp";
  d.textContent = num;
  return L.divIcon({className: "", html: d.outerHTML, iconSize: [28, 28], iconAnchor: [14, 14]});
}

function addWaypoint(lat, lng, label) {
  var short = (label || "").split(",").slice(0, 2).join(",");
  if (pinnedMarker) { map.removeLayer(pinnedMarker); pinnedMarker = null; }
  var idx = S.waypoints.length + 1;
  var mk = L.marker([lat, lng], {icon: mkWaypointIcon(idx), zIndexOffset: 900}).addTo(map)
    .bindPopup("Waypoint " + idx + ": " + short);
  S.waypoints.push({lat: lat, lng: lng, label: short, marker: mk});
  dismissBanner();
  toast("Waypoint " + idx + " added");

  if (S.curRoute && S.genRoutes.length) {
    extendRouteViaWaypoint(lat, lng, short);
  } else {
    showWaypointSheet();
  }
}

function extendRouteViaWaypoint(lat, lng, label) {
  if (!S.curRoute || !S.startLL) return;
  var coords = S.curRoute._coords;
  if (!coords || coords.length < 2) { toast("No route to extend"); return; }

  var newPt = L.latLng(lat, lng);
  var nearestIdx = 0, nearestDist = Infinity;
  for (var i = 0; i < coords.length; i++) {
    var d = newPt.distanceTo(L.latLng(coords[i][0], coords[i][1]));
    if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
  }

  var insertLL = L.latLng(coords[nearestIdx][0], coords[nearestIdx][1]);

  osrm([insertLL, newPt, insertLL]).then(function(detour) {
    if (!detour) { toast("Could not reach waypoint from route"); return; }

    var detourCoords = detour.geometry.coordinates.map(function(c) { return [c[1], c[0]]; });
    var before = coords.slice(0, nearestIdx + 1);
    var after = coords.slice(nearestIdx);
    var spliced = before.concat(detourCoords.slice(1, detourCoords.length - 1)).concat(after);

    var cumDist = [0];
    for (var i = 1; i < spliced.length; i++) {
      cumDist.push(cumDist[i - 1] + L.latLng(spliced[i - 1][0], spliced[i - 1][1]).distanceTo(L.latLng(spliced[i][0], spliced[i][1])));
    }
    var totalDist = cumDist[cumDist.length - 1] / 1000;

    var detourSteps = detour.legs ? detour.legs.reduce(function(a, l) { return a.concat(l.steps || []); }, []) : [];
    var existingSteps = S.curRoute.steps || [];
    var stepsBefore = existingSteps.slice(0, Math.min(
      Math.floor(nearestIdx / Math.max(coords.length / existingSteps.length, 1)) + 1,
      existingSteps.length
    ));
    var stepsAfter = existingSteps.slice(stepsBefore.length);
    var newSteps = stepsBefore.concat(detourSteps).concat(stepsAfter);

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
    S.curRoute._coords = spliced;
    S.curRoute._cumDist = cumDist;

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
    var sheetH = Math.round(window.innerHeight * 0.42) + 90;
    map.fitBounds(L.latLngBounds(spliced), {paddingTopLeft: [30, 70], paddingBottomRight: [30, sheetH]});
    showResult();
    toast("Waypoint added \u2014 " + Math.round(detour.duration / 60) + " min detour", {tone: "ok"});
  });
}

function removeWaypoint(idx) {
  var wp = S.waypoints[idx];
  if (!wp) return;
  map.removeLayer(wp.marker);
  S.waypoints.splice(idx, 1);
  S.waypoints.forEach(function(w, i) {
    map.removeLayer(w.marker);
    w.marker = L.marker([w.lat, w.lng], {icon: mkWaypointIcon(i + 1), zIndexOffset: 900}).addTo(map)
      .bindPopup("Waypoint " + (i + 1) + ": " + w.label);
  });
  toast("Waypoint removed");
  if (S.curRoute) showResult();
  else if (S.waypoints.length) showWaypointSheet();
  else showWelcome();
}

function clearWaypoints() {
  S.waypoints.forEach(function(w) { if (w.marker) map.removeLayer(w.marker); });
  S.waypoints = [];
}

function showWaypointSheet() {
  if (!S.waypoints.length) { showWelcome(); return; }
  var h = '<h3>' + icn("waypoints") + ' Waypoints <span class="pill pill-i">' + S.waypoints.length + '</span></h3>';
  h += '<p style="font-size:12px;color:var(--t2);margin-bottom:12px;line-height:1.65;font-weight:500;letter-spacing:-.1px">';
  h += 'Search above or tap the map to add more. All waypoints will be included in your loop.</p>';
  h += renderWaypointList();
  h += '<div class="ar" style="margin-top:10px">';
  h += '<button class="btn ba" id="wp-gen">' + icn("route", "sm") + ' Build Loop Route</button>';
  h += '<button class="btn bs" id="wp-clr" style="flex:none;padding:12px 14px">' + icn("x", "sm") + '</button>';
  h += '</div>';
  h += '<div class="wp-tap-hint">Tap the map to add a waypoint</div>';
  $("sh").innerHTML = h;
  if (typeof hydrateIcons === "function") hydrateIcons($("sh"));
  $("wp-gen").addEventListener("click", openW);
  $("wp-clr").addEventListener("click", function() { clearWaypoints(); showWelcome(); });
  document.querySelectorAll(".wp-del").forEach(function(btn) {
    btn.addEventListener("click", function(e) {
      e.stopPropagation();
      removeWaypoint(parseInt(btn.getAttribute("data-wi")));
    });
  });
}

function renderWaypointList() {
  if (!S.waypoints || !S.waypoints.length) return '';
  var h = '<div class="stop-list">';
  S.waypoints.forEach(function(w, i) {
    h += '<div class="stop-item">' +
      '<span class="stop-num wp-num">' + (i + 1) + '</span>' +
      '<span class="stop-name">' + w.label + '</span>' +
      '<button class="stop-del wp-del" data-wi="' + i + '">' + icn("x", "sm") + '</button>' +
    '</div>';
  });
  h += '</div>';
  return h;
}

map.on("click", function(e) {
  if (S.addingStop) {
    S.addingStop = false;
    reverseGeocode(e.latlng.lat, e.latlng.lng, function(label) {
      addWaypoint(e.latlng.lat, e.latlng.lng, label);
    });
    return;
  }
  if (!S.curRoute && !S.genRoutes.length) {
    reverseGeocode(e.latlng.lat, e.latlng.lng, function(label) {
      addWaypoint(e.latlng.lat, e.latlng.lng, label);
    });
  }
});

function reverseGeocode(lat, lng, cb) {
  fetch("https://nominatim.openstreetmap.org/reverse?format=json&lat=" + lat + "&lon=" + lng)
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var label = d.display_name
        ? d.display_name.split(",").slice(0, 2).join(",")
        : "Pin " + lat.toFixed(4) + "," + lng.toFixed(4);
      cb(label);
    })
    .catch(function() { cb("Pin " + lat.toFixed(4) + "," + lng.toFixed(4)); });
}

$("lbtn").addEventListener("click", function() {
  

  if (S.userLL) {
    if (typeof setFollowMode === "function") setFollowMode(true);
    map.setView([S.userLL.lat, S.userLL.lng], Math.max(map.getZoom(), 16));
    toast("Following your location", {tone: "ok", icon: "crosshair"});
    return;
  }

  if (!navigator.geolocation) { toast("GPS not available", {tone: "err"}); return; }
  toast("Finding location...", {tone: "info", icon: "loader", id: "loc-find"});

  var done = false;
  function onPos(p) {
    if (done) return;
    done = true;
    dismissToast("loc-find");
    S.userLL = {lat: p.coords.latitude, lng: p.coords.longitude};
    S.startLL = {lat: S.userLL.lat, lng: S.userLL.lng};
    if (typeof setFollowMode === "function") setFollowMode(true);
    map.setView([S.userLL.lat, S.userLL.lng], 16);
    if (sMk) map.removeLayer(sMk);
    sMk = L.marker([S.startLL.lat, S.startLL.lng], {icon: iS}).addTo(map);
    if (typeof updateLiveMarker === "function") updateLiveMarker(S.userLL, p.coords.heading);
    toast("Location updated", {tone: "ok", icon: "check"});
  }

  navigator.geolocation.getCurrentPosition(onPos, function() {
    navigator.geolocation.getCurrentPosition(onPos, function() {
      if (!done) { done = true; dismissToast("loc-find"); toast("Could not get location \u2014 check browser permissions", {tone: "err", long: true}); }
    }, {enableHighAccuracy: false, timeout: 15000, maximumAge: 300000});
  }, {enableHighAccuracy: true, timeout: 10000, maximumAge: 60000});
});

function clr() {
  [sMk, rLy, gLy, rCir, pMk, drvLy, rtStartMk, rtEndMk].forEach(function(l) { if (l) map.removeLayer(l); });
  sMk = rLy = gLy = rCir = pMk = drvLy = rtStartMk = rtEndMk = null;
  if (poiLy) { map.removeLayer(poiLy); poiLy = null; }
  if (S.destMk) { map.removeLayer(S.destMk); S.destMk = null; }
  if (pinnedMarker) { map.removeLayer(pinnedMarker); pinnedMarker = null; }
  clearStopMarkers();
}

function clrAll() { clr(); clearWaypoints(); }

function clearStopMarkers() {
  S.stopMarkers.forEach(function(m) { map.removeLayer(m); });
  S.stopMarkers = [];
}

function renderStopUI() {
  var h = '';
  h += '<div class="add-stop-bar' + (S.addingStop ? " active" : "") + '" id="add-stop-btn">' + icn("plus", "sm") + ' Add waypoint to route</div>';
  if (S.addingStop) {
    h += '<div style="font-size:11px;color:var(--t3);padding:4px 2px 6px;display:flex;align-items:center;gap:6px">';
    h += '<span style="width:8px;height:8px;border-radius:50%;background:var(--i);display:inline-block;flex-shrink:0"></span>';
    h += 'Tap anywhere on the map, or search below</div>';
    h += '<input type="text" class="stop-search" id="stop-sinp" placeholder="Search location..."/>';
    h += '<div class="stop-results" id="stop-results"></div>';
  }
  return h;
}

function bindStopEvents() {
  document.querySelectorAll(".wp-del").forEach(function(btn) {
    btn.addEventListener("click", function(e) {
      e.stopPropagation();
      removeWaypoint(parseInt(btn.getAttribute("data-wi")));
    });
  });
  var addBtn = $("add-stop-btn");
  if (addBtn) {
    addBtn.addEventListener("click", function() {
      S.addingStop = !S.addingStop;
      showResult();
      if (S.addingStop) toast("Search a location to add it to your route", {tone: "info"});
    });
  }
  var sinp = $("stop-sinp");
  if (sinp) {
    sinp.focus();
    var stTimer = null;
    sinp.addEventListener("input", function() {
      var q = this.value.trim();
      clearTimeout(stTimer);
      if (q.length < 2) { $("stop-results").innerHTML = ""; return; }
      stTimer = setTimeout(function() {
        searchWithFallback(q, 5, function(results) {
          var box = $("stop-results");
          if (!results.length) {
            box.innerHTML = '<div class="ac-item"><span class="ac-icon">' + icn("search", "sm") + '</span><span class="ac-text">No results</span></div>';
            if (typeof hydrateIcons === "function") hydrateIcons(box);
            return;
          }
          results = sortByProximity(results);
          box.innerHTML = "";
          results.forEach(function(r) {
            var d = document.createElement("div");
            d.className = "ac-item";
            var short = r.display_name.split(",").slice(0, 3).join(",");
            d.innerHTML = '<span class="ac-icon">' + icn("map_pin", "sm") + '</span><span class="ac-text">' + short + '</span>';
            d.addEventListener("click", function() {
              S.addingStop = false;
              addWaypoint(parseFloat(r.lat), parseFloat(r.lon), short);
            });
            box.appendChild(d);
          });
          if (typeof hydrateIcons === "function") hydrateIcons(box);
        });
      }, 280);
    });
    sinp.addEventListener("keypress", function(e) {
      if (e.key === "Enter") {
        var q = this.value.trim();
        if (!q) return;
        searchWithFallback(q, 1, function(results) {
          if (!results.length) { toast("Not found"); return; }
          results = sortByProximity(results);
          S.addingStop = false;
          addWaypoint(parseFloat(results[0].lat), parseFloat(results[0].lon),
            results[0].display_name.split(",").slice(0, 2).join(","));
        });
      }
    });
  }
}

$("sh").innerHTML = '<h3>eLearns.io</h3><p style="font-size:13px;color:var(--t2);margin-bottom:12px;line-height:1.5">Getting your location...</p>';
