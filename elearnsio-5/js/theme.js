// ═══ THEMING ═══
var isDark=true;
var darkTile="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
var lightTile="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
var tileLayer=null;
function setMapTile(url){if(tileLayer)map.removeLayer(tileLayer);tileLayer=L.tileLayer(url,{maxZoom:19,subdomains:"abcd"}).addTo(map)}
setMapTile(darkTile);
function applyLicTheme(){var lt=S.profile.licence_type||"L";document.documentElement.classList.remove("th-L","th-P1","th-P2");document.documentElement.classList.add("th-"+lt)}
$("ctheme").addEventListener("click",function(){isDark=!isDark;if(isDark){document.documentElement.classList.remove("light");$("theme-label").textContent="Dark Mode";setMapTile(darkTile)}else{document.documentElement.classList.add("light");$("theme-label").textContent="Light Mode";setMapTile(lightTile)}});

// ═══ WEATHER (OpenMeteo — free, no API key) ═══
function fetchWeather(lat,lon,cb){
  fetch("https://api.open-meteo.com/v1/forecast?latitude="+lat+"&longitude="+lon+"&current=temperature_2m,weather_code,wind_speed_10m,precipitation&timezone=auto")
  .then(function(r){return r.json()}).then(function(d){
    if(!d.current)return;
    var wc=d.current.weather_code,t=d.current.temperature_2m,ws=d.current.wind_speed_10m,pr=d.current.precipitation;
    var icon="☀️",cond="Clear",warn="";
    if(wc>=80)      {icon="⛈";cond="Thunderstorm";warn="⚠ Severe weather — avoid driving"}
    else if(wc>=70) {icon="🌧";cond="Snow/Freezing";warn="⚠ Icy conditions"}
    else if(wc>=61) {icon="🌧";cond="Heavy rain";warn="⚠ Low visibility"}
    else if(wc>=51) {icon="🌦";cond="Light rain";warn="Drive carefully"}
    else if(wc>=45) {icon="🌫";cond="Fog";warn="⚠ Reduce speed in fog"}
    else if(wc>=3)  {icon="☁️";cond="Overcast"}
    else if(wc>=1)  {icon="⛅";cond="Partly cloudy"}
    S.weather={icon:icon,temp:Math.round(t),cond:cond,wind:Math.round(ws),rain:pr,warn:warn};
    if(cb)cb(S.weather);
  }).catch(function(){});
}

function wxHtml(w){
  if(!w)return"";
  var h='<div class="wx-bar"><span class="wx-icon">'+w.icon+'</span><span class="wx-temp">'+w.temp+'°C</span><span class="wx-cond">'+w.cond+' · '+w.wind+' km/h wind</span>';
  if(w.warn)h+='<span class="wx-warn">'+w.warn+'</span>';
  h+='</div>';return h;
}

// ═══ DIFFICULTY SCORING (slider-driven) ═══
var DIFF_LEVELS=[
  {level:1,label:"Beginner",color:"var(--acc)",desc:"Quiet streets, low stress"},
  {level:2,label:"Easy",color:"var(--acc)",desc:"Suburban roads, gentle turns"},
  {level:3,label:"Moderate",color:"var(--i)",desc:"Mixed roads, some traffic"},
  {level:4,label:"Hard",color:"var(--w)",desc:"Arterials, roundabouts, multi-lane"},
  {level:5,label:"Expert",color:"var(--d)",desc:"Complex intersections, hills, highway"}
];
function getDiff(level){return DIFF_LEVELS[Math.max(0,Math.min(4,level-1))];}
function suggestDifficulty(prefs,dur,rad){
  var score=0,n=0;for(var k in prefs){if(prefs[k]>0){score+=prefs[k];n++}}
  if(n===0)return 1;var avg=score/n;if(dur>90)avg+=0.5;if(rad>15)avg+=0.5;
  if(prefs["multi-lane"]>=3)avg+=0.5;if(prefs["hills"]>=4)avg+=0.5;
  if(avg>=4)return 5;if(avg>=3)return 4;if(avg>=2)return 3;if(avg>=1.5)return 2;return 1;
}
function diffHtml(d){
  var h='<div class="diff-bar">';
  for(var i=1;i<=5;i++){
    var cls="diff-seg";
    if(i<=d.level){if(d.level>=4)cls+=" hi";else if(d.level>=3)cls+=" med";else cls+=" on"}
    h+='<div class="'+cls+'"></div>';
  }
  h+='<span class="diff-label" style="color:'+d.color+'">'+d.label+'</span></div>';
  return h;
}
function diffSliderHtml(currentLevel){
  var d=getDiff(currentLevel);
  var h='<div style="margin-bottom:16px"><label class="fl">Difficulty Level</label>';
  h+='<input type="range" class="rng" min="1" max="5" step="1" value="'+currentLevel+'" id="wdf">';
  h+='<div class="rngv" id="wdfv" style="font-size:20px">'+d.label+'</div>';
  h+='<div style="text-align:center;font-size:11px;color:var(--t2);margin-top:2px" id="wdfd">'+d.desc+'</div>';
  h+='<div class="rngl"><span>Beginner</span><span>Expert</span></div>';
  h+=diffHtml(d);
  h+='</div>';
  return h;
}

