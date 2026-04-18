$("at-li").addEventListener("click", function() {
  $("at-li").classList.add("on");
  $("at-su").classList.remove("on");
  $("af-li").classList.add("on");
  $("af-su").classList.remove("on");
});

$("at-su").addEventListener("click", function() {
  $("at-su").classList.add("on");
  $("at-li").classList.remove("on");
  $("af-su").classList.add("on");
  $("af-li").classList.remove("on");
});

$("li-go").addEventListener("click", doLI);
$("li-p").addEventListener("keypress", function(e) { if (e.key === "Enter") doLI(); });

function doLI() {
  var e = $("li-e").value.trim(), p = $("li-p").value;
  if (!e || !p) { $("li-err").textContent = "Enter email and password"; return; }
  $("li-go").disabled = true;
  $("li-go").innerHTML = '<span class="ld"></span>';
  sba("token?grant_type=password", {email: e, password: p}).then(function(r) {
    $("li-go").disabled = false;
    $("li-go").textContent = "Log In";
    if (r.error || r.error_description) {
      $("li-err").textContent = r.error_description || r.msg || "Login failed";
      return;
    }
    TK = r.access_token;
    S.uid = r.user.id;
    S_isGuest = false;
    saveSession(r.access_token, r.refresh_token, r.user.id);
    loadData();
  }).catch(function() {
    $("li-go").disabled = false;
    $("li-go").textContent = "Log In";
    $("li-err").textContent = "Network error";
  });
}

$("su-go").addEventListener("click", doSU);

function doSU() {
  var nm = $("su-n").value.trim(), e = $("su-e").value.trim(), p = $("su-p").value;
  if (!nm) { $("su-err").textContent = "Enter name"; return; }
  if (!e || !p) { $("su-err").textContent = "Enter email & password"; return; }
  if (p.length < 6) { $("su-err").textContent = "Password 6+ chars"; return; }
  $("su-go").disabled = true;
  $("su-go").innerHTML = '<span class="ld"></span>';
  $("su-err").innerHTML = "&nbsp;";
  $("su-ok").innerHTML = "&nbsp;";
  sba("signup", {email: e, password: p, data: {name: nm}}).then(function(r) {
    $("su-go").disabled = false;
    $("su-go").textContent = "Create Account";
    if (r.error || r.msg) {
      $("su-err").textContent = r.error_description || r.msg || "Failed";
      return;
    }
    if (r.access_token) {
      TK = r.access_token;
      S.uid = r.user.id;
      S_isGuest = false;
      S.profile.name = nm;
      S.profile.licence_type = $("su-lt").value;
      S.profile.supervisor = $("su-sp").value.trim();
      saveSession(r.access_token, r.refresh_token, r.user.id);
      sbu("profiles", "id=eq." + S.uid, {
        name: nm,
        licence_type: $("su-lt").value,
        supervisor: $("su-sp").value.trim()
      });
      enterApp();
    } else if (r.id) {
      $("su-ok").textContent = "Check email to confirm, then log in.";
      setTimeout(function() { $("at-li").click(); $("li-e").value = e; }, 2000);
    }
  }).catch(function() {
    $("su-go").disabled = false;
    $("su-go").textContent = "Create Account";
    $("su-err").textContent = "Network error";
  });
}

var S_isGuest = true;

window._elBootReady = function() {
  enterApp();

  tryRestoreSession(function(ok) {
    if (ok) {
      S_isGuest = false;
      Promise.all([
        sbg("profiles", "id=eq." + S.uid + "&select=*"),
        sbg("log_entries", "user_id=eq." + S.uid + "&select=*&order=created_at.desc&limit=100"),
        sbg("saved_routes", "user_id=eq." + S.uid + "&select=*&order=created_at.desc&limit=50")
      ]).then(function(r) {
        if (r[0] && r[0].length) S.profile = r[0][0];
        if (r[1] && r[1].length) {
          S.logs = r[1].map(function(e) {
            return {
              id: e.id, date: e.date, duration: e.duration, tod: e.time_of_day,
              roads: e.road_types || [], supervisor: e.supervisor || "", notes: e.notes || "",
              km: e.km || 0
            };
          });
        }
        if (r[2] && r[2].length) {
          S.routes = r[2].map(function(r) {
            return {
              id: r.id, ts: r.created_at, distance: r.distance, duration: r.duration,
              radius: r.radius, prefs: r.prefs || {},
              startLatLng: {lat: r.start_lat, lng: r.start_lng},
              destType: r.dest_type || "loop"
            };
          });
        }
        dLog();
        dProf();
        applyLicTheme();
        toast("Signed in as " + (S.profile.name || "Driver"), {tone: "ok", icon: "check"});
      }).catch(function() {
        dProf();
      });
    } else {
      setTimeout(function() {
        toast("Not logged in \u2014 progress won't be saved", {tone: "warn", long: true});
      }, 2000);
    }
  });
};

function loadData() {
  Promise.all([
    sbg("profiles", "id=eq." + S.uid + "&select=*"),
    sbg("log_entries", "user_id=eq." + S.uid + "&select=*&order=created_at.desc&limit=100"),
    sbg("saved_routes", "user_id=eq." + S.uid + "&select=*&order=created_at.desc&limit=50")
  ]).then(function(r) {
    if (r[0] && r[0].length) S.profile = r[0][0];
    if (r[1] && r[1].length) {
      S.logs = r[1].map(function(e) {
        return {
          id: e.id, date: e.date, duration: e.duration, tod: e.time_of_day,
          roads: e.road_types || [], supervisor: e.supervisor || "", notes: e.notes || "",
          km: e.km || 0
        };
      });
    }
    if (r[2] && r[2].length) {
      S.routes = r[2].map(function(r) {
        return {
          id: r.id, ts: r.created_at, distance: r.distance, duration: r.duration,
          radius: r.radius, prefs: r.prefs || {},
          startLatLng: {lat: r.start_lat, lng: r.start_lng},
          destType: r.dest_type || "loop"
        };
      });
    }
    $("auth").classList.add("gone");
    $("app").classList.add("on");
    setTimeout(function() { map.invalidateSize(); }, 100);
    dLog();
    dProf();
    applyLicTheme();
    toast("Signed in as " + (S.profile.name || "Driver"), {tone: "ok", icon: "check"});
    

    if (S._returnTab) {
      var dest = S._returnTab;
      S._returnTab = null;
      setTimeout(function() { goTo(dest); }, 250);
    }
  }).catch(function() {
    $("auth").classList.add("gone");
    $("app").classList.add("on");
    setTimeout(function() { map.invalidateSize(); }, 100);
    dProf();
  });
}

function enterApp() {
  $("auth").classList.add("gone");
  $("app").classList.add("on");
  try {
    var pfp = localStorage.getItem("ll-pfp");
    if (pfp) S.profile.pfp = pfp;
  } catch (x) {}
  dLog();
  dProf();
  applyLicTheme();
  setTimeout(function() {
    map.invalidateSize();
    requestLocation();
  }, 300);
}

var ambientWatchId = null;
var liveUserMk = null;
var ambientPaused = false;
var followMode = true;          
var suppressDragOff = false;    

function setFollowMode(on) {
  followMode = !!on;
  var btn = document.getElementById("lbtn");
  if (btn) btn.classList.toggle("follow-on", followMode);
}

map.on("dragstart", function() {
  if (suppressDragOff) { suppressDragOff = false; return; }
  setFollowMode(false);
});

function requestLocation() {
  if (!navigator.geolocation) {
    fallbackLocation();
    return;
  }

  

  if (ambientWatchId !== null && S.userLL) {
    setFollowMode(true);
    map.setView([S.userLL.lat, S.userLL.lng], Math.max(map.getZoom(), 15));
    return;
  }

  var gotFirstFix = false;
  var fellBack = false;
  var bestAcc = Infinity;
  toast("Getting your location...", {tone: "info", icon: "crosshair", id: "loc-acq"});

  

  function handlePos(p) {
    var acc = p.coords.accuracy || 9999;
    var ll = {lat: p.coords.latitude, lng: p.coords.longitude};

    if (!gotFirstFix) {
      dismissToast("loc-acq");
      gotFirstFix = true;
      bestAcc = acc;
      S.userLL = ll;
      setStartFromGPS();
      setFollowMode(true);
      updateLiveMarker(ll, p.coords.heading);
      

      if (acc > 100) {
        toast("Refining GPS accuracy...", {tone: "info", icon: "crosshair", id: "loc-refine", duration: 2000});
      }
      return;
    }

    

    if (acc <= bestAcc * 1.5 || acc < 30) {
      if (acc < bestAcc) bestAcc = acc;
      S.userLL = ll;
      updateLiveMarker(ll, p.coords.heading);
      

      if (acc < bestAcc * 0.6 || (bestAcc > 100 && acc < 50)) {
        setStartFromGPS();
      }
    }
  }

  function handleErr(err) {
    

    if (!gotFirstFix && !fellBack) {
      fellBack = true;
      dismissToast("loc-acq");
      fallbackLocation();
    }
  }

  

  ambientWatchId = navigator.geolocation.watchPosition(handlePos, handleErr, {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 30000
  });

  

  navigator.geolocation.getCurrentPosition(handlePos, function() {
    

  }, {enableHighAccuracy: true, timeout: 15000, maximumAge: 0});

  setTimeout(function() {
    if (!gotFirstFix && !fellBack) {
      fellBack = true;
      dismissToast("loc-acq");
      fallbackLocation();
    }
  }, 25000);
}

function updateLiveMarker(ll, heading) {
  if (ambientPaused) return;
  var rot = (typeof heading === "number" && !isNaN(heading)) ? heading : 0;
  if (!liveUserMk) {
    liveUserMk = L.marker([ll.lat, ll.lng], {
      icon: makeArrowIcon(rot),
      zIndexOffset: 800,
      interactive: false
    }).addTo(map);
  } else {
    liveUserMk.setLatLng([ll.lat, ll.lng]);
    if (typeof heading === "number" && !isNaN(heading)) {
      liveUserMk.setIcon(makeArrowIcon(heading));
    }
  }

  if (followMode) {
    

    suppressDragOff = true;
    map.panTo([ll.lat, ll.lng], {animate: true, duration: 0.4, noMoveStart: true});
    
    setTimeout(function() { suppressDragOff = false; }, 50);
  }
}

function pauseAmbientTracking() {
  ambientPaused = true;
  if (liveUserMk) { map.removeLayer(liveUserMk); liveUserMk = null; }
}

function resumeAmbientTracking() {
  ambientPaused = false;
  if (S.userLL) updateLiveMarker(S.userLL);
}

function fallbackLocation() {
  toast("Tap the location button or search to get started");
  S.startLL = {lat: -33.8688, lng: 151.2093};
  S.userLL = S.startLL;
  sMk = L.marker([S.startLL.lat, S.startLL.lng], {icon: iS}).addTo(map);
  map.setView([S.startLL.lat, S.startLL.lng], 13);
  showWelcome();
}

function setStartFromGPS() {
  clr();
  S.startLL = {lat: S.userLL.lat, lng: S.userLL.lng};
  sMk = L.marker([S.startLL.lat, S.startLL.lng], {icon: iS}).addTo(map);
  map.setView([S.startLL.lat, S.startLL.lng], 15);
  fetchWeather(S.startLL.lat, S.startLL.lng);
  showWelcome();
}

function showWelcome() {
  var h = '<h3><span class="ic" data-icon="map_pin"></span> You are here</h3>';
  h += '<p style="font-size:12px;color:var(--t2);margin-bottom:12px;line-height:1.55;letter-spacing:-.1px">';
  h += 'Search a location to add waypoints, or build a loop directly.</p>';
  h += '<div id="wx-slot"></div>';
  h += '<div class="ar"><button class="btn ba" id="sh-b">' + icn("route", "sm") + ' Build Loop Route</button></div>';
  $("sh").innerHTML = h;
  if (typeof hydrateIcons === "function") hydrateIcons($("sh"));
  $("sh-b").addEventListener("click", openW);
  setTimeout(function() {
    if (S.weather && $("wx-slot")) $("wx-slot").innerHTML = wxHtml(S.weather);
  }, 1500);
}
