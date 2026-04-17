var SB = "https://qazcdganlqiimiknitdj.supabase.co";
var AK = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhemNkZ2FubHFpaW1pa25pdGRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MDU3MTYsImV4cCI6MjA5MDA4MTcxNn0.USyldooaReq1bRW1qXRSMi_eZeuz8cfgBN9q7EkB5ec";
var TK = null;

function hdr(x) {
  var h = {"apikey": AK, "Content-Type": "application/json"};
  if (TK) h["Authorization"] = "Bearer " + TK;
  if (x) {
    for (var k in x) h[k] = x[k];
  }
  return h;
}

function sba(ep, b) {
  return fetch(SB + "/auth/v1/" + ep, {
    method: "POST",
    headers: {"apikey": AK, "Content-Type": "application/json"},
    body: JSON.stringify(b)
  }).then(function(r) { return r.json(); });
}

function sbg(t, q) {
  return fetch(SB + "/rest/v1/" + t + "?" + q, {
    headers: hdr()
  }).then(function(r) { return r.json(); }).catch(function() { return []; });
}

function sbp(t, d) {
  return fetch(SB + "/rest/v1/" + t, {
    method: "POST",
    headers: hdr({"Prefer": "return=representation"}),
    body: JSON.stringify(d)
  }).then(function(r) { return r.json(); }).catch(function() { return []; });
}

function sbu(t, q, d) {
  return fetch(SB + "/rest/v1/" + t + "?" + q, {
    method: "PATCH",
    headers: hdr({"Prefer": "return=representation"}),
    body: JSON.stringify(d)
  }).then(function(r) { return r.json(); }).catch(function() { return []; });
}

function sbDel(t, q) {
  return fetch(SB + "/rest/v1/" + t + "?" + q, {
    method: "DELETE",
    headers: hdr()
  }).catch(function() {});
}

function saveSession(accessToken, refreshToken, userId) {
  try {
    localStorage.setItem("el_tk", accessToken || "");
    if (refreshToken) localStorage.setItem("el_rt", refreshToken);
    if (userId) localStorage.setItem("el_uid", userId);
  } catch (x) {}
}

function clearSession() {
  try {
    localStorage.removeItem("el_tk");
    localStorage.removeItem("el_rt");
    localStorage.removeItem("el_uid");
  } catch (x) {}
}

function tryRestoreSession(cb) {
  try {
    var rt = localStorage.getItem("el_rt");
    var uid = localStorage.getItem("el_uid");
    if (!rt || !uid) { cb(false); return; }
    sba("token?grant_type=refresh_token", {refresh_token: rt}).then(function(r) {
      if (r && r.access_token && r.user) {
        TK = r.access_token;
        S.uid = r.user.id;
        saveSession(r.access_token, r.refresh_token || rt, r.user.id);
        cb(true);
      } else {
        clearSession();
        cb(false);
      }
    }).catch(function() { cb(false); });
  } catch (x) { cb(false); }
}

function $(id) { return document.getElementById(id); }

function toast(m) {
  var e = document.createElement("div");
  e.className = "toast";
  e.textContent = m;
  document.body.appendChild(e);
  setTimeout(function() {
    e.style.opacity = "0";
    e.style.transition = "opacity .3s";
    setTimeout(function() { e.remove(); }, 300);
  }, 2800);
}

function fm(m) {
  m = Number(m) || 0;
  if (m < 60) return m + " min";
  var h = Math.floor(m / 60), r = m % 60;
  return r ? h + "h " + r + "m" : h + "h";
}

function fd(d) {
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-AU", {
      weekday: "short", day: "numeric", month: "short"
    });
  } catch (e) { return d || ""; }
}

function bearing(lat1, lon1, lat2, lon2) {
  var dL = (lon2 - lon1) * Math.PI / 180;
  var la1 = lat1 * Math.PI / 180, la2 = lat2 * Math.PI / 180;
  var y = Math.sin(dL) * Math.cos(la2);
  var x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dL);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
