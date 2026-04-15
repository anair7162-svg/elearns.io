// ═══ AUTH TABS ═══
$("at-li").addEventListener("click",function(){$("at-li").classList.add("on");$("at-su").classList.remove("on");$("af-li").classList.add("on");$("af-su").classList.remove("on")});
$("at-su").addEventListener("click",function(){$("at-su").classList.add("on");$("at-li").classList.remove("on");$("af-su").classList.add("on");$("af-li").classList.remove("on")});

// ═══ LOG IN ═══
$("li-go").addEventListener("click",doLI);$("li-p").addEventListener("keypress",function(e){if(e.key==="Enter")doLI()});
function doLI(){
  var e=$("li-e").value.trim(),p=$("li-p").value;
  if(!e||!p){$("li-err").textContent="Enter email and password";return}
  $("li-go").disabled=true;$("li-go").innerHTML='<span class="ld"></span>';
  sba("token?grant_type=password",{email:e,password:p}).then(function(r){
    $("li-go").disabled=false;$("li-go").textContent="Log In";
    if(r.error||r.error_description){$("li-err").textContent=r.error_description||r.msg||"Login failed";return}
    TK=r.access_token;S.uid=r.user.id;
    saveSession(r.access_token,r.refresh_token,r.user.id);
    loadData();
  }).catch(function(){$("li-go").disabled=false;$("li-go").textContent="Log In";$("li-err").textContent="Network error"});
}

// ═══ SIGN UP ═══
$("su-go").addEventListener("click",doSU);
function doSU(){
  var nm=$("su-n").value.trim(),e=$("su-e").value.trim(),p=$("su-p").value;
  if(!nm){$("su-err").textContent="Enter name";return}
  if(!e||!p){$("su-err").textContent="Enter email & password";return}
  if(p.length<6){$("su-err").textContent="Password 6+ chars";return}
  $("su-go").disabled=true;$("su-go").innerHTML='<span class="ld"></span>';$("su-err").innerHTML="&nbsp;";$("su-ok").innerHTML="&nbsp;";
  sba("signup",{email:e,password:p,data:{name:nm}}).then(function(r){
    $("su-go").disabled=false;$("su-go").textContent="Create Account";
    if(r.error||r.msg){$("su-err").textContent=r.error_description||r.msg||"Failed";return}
    if(r.access_token){
      TK=r.access_token;S.uid=r.user.id;
      S.profile.name=nm;S.profile.licence_type=$("su-lt").value;S.profile.supervisor=$("su-sp").value.trim();
      saveSession(r.access_token,r.refresh_token,r.user.id);
      sbu("profiles","id=eq."+S.uid,{name:nm,licence_type:$("su-lt").value,supervisor:$("su-sp").value.trim()});
      enterApp();
    }else if(r.id){
      $("su-ok").textContent="Check email to confirm, then log in.";
      setTimeout(function(){$("at-li").click();$("li-e").value=e},2000);
    }
  }).catch(function(){$("su-go").disabled=false;$("su-go").textContent="Create Account";$("su-err").textContent="Network error"});
}

// ═══ AUTO RESTORE SESSION ON PAGE LOAD ═══
// This runs immediately when auth.js loads — tries refresh token before showing login screen
tryRestoreSession(function(ok){
  if(ok){
    // Session restored — load data and skip login screen
    loadData();
  }
  // If not ok, just show the login screen as normal (already visible by default)
});

// ═══ LOAD DATA ═══
function loadData(){
  Promise.all([
    sbg("profiles","id=eq."+S.uid+"&select=*"),
    sbg("log_entries","user_id=eq."+S.uid+"&select=*&order=created_at.desc&limit=100"),
    sbg("saved_routes","user_id=eq."+S.uid+"&select=*&order=created_at.desc&limit=50")
  ]).then(function(r){
    if(r[0]&&r[0].length)S.profile=r[0][0];
    if(r[1]&&r[1].length)S.logs=r[1].map(function(e){return{id:e.id,date:e.date,duration:e.duration,tod:e.time_of_day,roads:e.road_types||[],supervisor:e.supervisor||"",notes:e.notes||""}});
    if(r[2]&&r[2].length)S.routes=r[2].map(function(r){return{id:r.id,ts:r.created_at,distance:r.distance,duration:r.duration,radius:r.radius,prefs:r.prefs||{},startLatLng:{lat:r.start_lat,lng:r.start_lng},destType:r.dest_type||"loop"}});
    enterApp();
  }).catch(function(){enterApp()});
}

function enterApp(){
  $("auth").classList.add("gone");$("app").classList.add("on");
  setTimeout(function(){map.invalidateSize()},100);
  try{var pfp=localStorage.getItem("ll-pfp");if(pfp)S.profile.pfp=pfp}catch(x){}
  dLog();dProf();applyLicTheme();
  if(navigator.geolocation){
    toast("Getting your location...");
    navigator.geolocation.getCurrentPosition(function(p){
      S.userLL={lat:p.coords.latitude,lng:p.coords.longitude};
      setStartFromGPS();
    },function(){
      toast("Location unavailable — search a destination");
      S.startLL={lat:-33.8688,lng:151.2093};S.userLL=S.startLL;
      sMk=L.marker([S.startLL.lat,S.startLL.lng],{icon:iS}).addTo(map);
      showWelcome();
    },{enableHighAccuracy:true,timeout:8000});
  }else{
    S.startLL={lat:-33.8688,lng:151.2093};S.userLL=S.startLL;
    sMk=L.marker([S.startLL.lat,S.startLL.lng],{icon:iS}).addTo(map);
    showWelcome();
  }
}

function setStartFromGPS(){
  clr();S.startLL={lat:S.userLL.lat,lng:S.userLL.lng};
  sMk=L.marker([S.startLL.lat,S.startLL.lng],{icon:iS}).addTo(map);
  map.setView([S.startLL.lat,S.startLL.lng],15);
  fetchWeather(S.startLL.lat,S.startLL.lng);
  showWelcome();
}

function showWelcome(){
  $("sh").innerHTML='<h3>📍 You are here</h3><p style="font-size:12px;color:var(--t2);margin-bottom:12px;line-height:1.5">Search a location to add waypoints, or build a loop directly.</p><div id="wx-slot"></div><div class="ar"><button class="btn ba" id="sh-b">🔄 Build Loop Route</button></div>';
  $("sh-b").addEventListener("click",openW);
  setTimeout(function(){if(S.weather&&$("wx-slot"))$("wx-slot").innerHTML=wxHtml(S.weather)},1500);
}
