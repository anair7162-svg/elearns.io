var S = {
  uid: null,
  profile: {
    name: "", licence: "", licence_type: "L", supervisor: "",
    initial_day_min: 0, initial_night_min: 0, pfp: ""
  },
  logs: [],
  routes: [],
  curRoute: null,
  startLL: null,
  genRoutes: [],
  genIdx: 0,
  navStart: null,
  navRemKm: 0,
  navRemMin: 0,
  poiCache: null,
  drivenKm: 0,
  lastGPS: null,
  destMk: null,
  weather: null,
  userLL: null,
  gpsBearing: 0,
  spdHistory: [],
  etaHistory: [],
  navArrived: false,
  navGpsCount: 0,
  stops: [],
  stopMarkers: [],
  addingStop: false,
  waypoints: []
};

var map = L.map("map", {zoomControl: false, attributionControl: false}).setView([-33.8688, 151.2093], 13);
L.control.zoom({position: "bottomright"}).addTo(map);

var sMk = null, rLy = null, gLy = null, rCir = null, pMk = null, wId = null, poiLy = null, drvLy = null, rtStartMk = null, rtEndMk = null;

function mkI(c, s) {
  var d = document.createElement("div");
  d.className = "mk " + c;
  return L.divIcon({className: "", html: d.outerHTML, iconSize: [s, s], iconAnchor: [s / 2, s / 2]});
}

var iS = mkI("mk-g mk-p", 20);

function makeArrowIcon(rot) {
  var h = '<div class="gps-arrow"><div class="gps-arrow-acc"></div><div class="gps-arrow-ring"></div>';
  h += '<svg viewBox="0 0 42 42" style="transform:rotate(' + rot + 'deg)">';
  h += '<defs><filter id="gf" x="-50%" y="-50%" width="200%" height="200%">';
  h += '<feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#4d9eff" flood-opacity="0.5"/></filter></defs>';
  h += '<circle cx="21" cy="21" r="12" fill="#4d9eff" filter="url(#gf)"/>';
  h += '<circle cx="21" cy="21" r="9" fill="#fff"/>';
  h += '<circle cx="21" cy="21" r="6" fill="#4d9eff"/>';
  h += '<polygon points="21,4 17,14 21,11 25,14" fill="#4d9eff" stroke="#fff" stroke-width="1"/>';
  h += '</svg></div>';
  return L.divIcon({className: "", html: h, iconSize: [42, 42], iconAnchor: [21, 21]});
}

var iP = makeArrowIcon(0);

var destDot = document.createElement("div");
destDot.className = "mk mk-dest";
var iDest = L.divIcon({className: "", html: destDot.outerHTML, iconSize: [22, 22], iconAnchor: [11, 11]});

function mkLabel(letter, cls) {
  var d = document.createElement("div");
  d.className = "mk-label " + cls;
  d.textContent = letter;
  return L.divIcon({className: "", html: d.outerHTML, iconSize: [28, 28], iconAnchor: [14, 14]});
}

var iA = mkLabel("A", "mk-label-a");
var iB = mkLabel("B", "mk-label-b");
var iLoop = mkLabel("\u21A9", "mk-label-loop");

function mkStopIcon(num) {
  return mkLabel(String(num), "mk-label-stop");
}

var TABS = [
  {id: "s-map",  i: "map",       l: "Map"},
  {id: "s-log",  i: "book_open", l: "Logbook"},
  {id: "s-rt",   i: "route",     l: "Routes"},
  {id: "s-prof", i: "user",      l: "Profile"}
];

(function() {
  var n = $("bnav");
  TABS.forEach(function(t, x) {
    var b = document.createElement("button");
    b.className = "ni" + (x === 0 ? " on" : "");
    b.setAttribute("data-t", t.id);
    b.innerHTML = '<div class="ni-i">' + (typeof icn === "function" ? icn(t.i) : "") + '</div>' +
                  '<div class="ni-l">' + t.l + '</div>';
    b.addEventListener("click", function() { goTo(t.id); });
    n.appendChild(b);
  });
})();

function goTo(id) {
  var isGuest = (typeof S_isGuest !== "undefined") && S_isGuest;
  if (isGuest && (id === "s-prof" || id === "s-log" || id === "s-rt")) {
    showSigninOverlay(id);
    return;
  }
  document.querySelectorAll(".scr").forEach(function(s) { s.classList.remove("on"); });
  document.querySelectorAll(".ni").forEach(function(n) { n.classList.remove("on"); });
  $(id).classList.add("on");
  var b = document.querySelector("[data-t='" + id + "']");
  if (b) b.classList.add("on");
  if (id === "s-map") map.invalidateSize();
  if (id === "s-log") dLog();
  if (id === "s-rt") dRt();
  if (id === "s-prof") dProf();
}

function showSigninOverlay(tabId) {
  var msgs = {
    "s-prof": "Sign in to access your profile, edit your details, and track your progress.",
    "s-log": "Sign in to use the logbook and track your 120 hours of driving practice.",
    "s-rt": "Sign in to save your routes and reload them later."
  };
  var ov = $("signin-ov");
  var msg = $("signin-ov-msg");
  if (msg) msg.textContent = msgs[tabId] || msgs["s-prof"];
  S._returnTab = tabId || null;        // remember where to land after login
  ov.classList.add("on");
}

$("signin-ov-go").addEventListener("click", function() {
  $("signin-ov").classList.remove("on");
  $("app").classList.remove("on");
  $("auth").classList.remove("gone");
});

$("signin-ov-x").addEventListener("click", function() {
  $("signin-ov").classList.remove("on");
});
