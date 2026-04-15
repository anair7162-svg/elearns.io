// ═══ ROUTE GEN ═══
var OSRM_ENDPOINTS=[
  "https://router.project-osrm.org/route/v1/driving/",
  "https://routing.openstreetmap.de/routed-car/route/v1/driving/"
];

function osrm(wps,epIdx){
  var pts=wps.map(function(w){return w.lng+","+w.lat}).join(";");
  var ep=OSRM_ENDPOINTS[(epIdx||0)%2];
  return fetch(ep+pts+"?overview=full&geometries=geojson&steps=true&continue_straight=false")
    .then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.json()})
    .then(function(d){
      if(d.code!=="Ok"||!d.routes||!d.routes.length)throw new Error("No route");
      return d.routes[0];
    })
    .catch(function(){
      if((epIdx||0)>0)return null;
      // Retry on second endpoint
      return fetch(OSRM_ENDPOINTS[1]+pts+"?overview=full&geometries=geojson&steps=true&continue_straight=false")
        .then(function(r){return r.json()})
        .then(function(d){return(d.code==="Ok"&&d.routes&&d.routes.length)?d.routes[0]:null})
        .catch(function(){return null});
    });
}

function inRad(route,center,rKm){
  var c=route.geometry.coordinates;
  for(var i=0;i<c.length;i++){
    if(center.distanceTo(L.latLng(c[i][1],c[i][0]))/1000>rKm*1.25)return false;
  }
  return true;
}

// Haversine distance in km between two {lat,lng} objects
function haversineKm(a,b){
  var R=6371,dLat=(b.lat-a.lat)*Math.PI/180,dLon=(b.lng-a.lng)*Math.PI/180;
  var s=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
  return R*2*Math.atan2(Math.sqrt(s),Math.sqrt(1-s));
}

// Estimate how much extra looping distance we need to hit the target duration
// avgSpeed ~40km/h for suburban driving
function extraKmNeeded(){
  var targetKm=(W.dur/60)*40; // target distance in km at avg 40km/h
  var userWps=S.waypoints||[];
  if(!userWps.length)return targetKm; // pure loop, full target distance

  var start={lat:S.startLL.lat,lng:S.startLL.lng};
  // Estimate minimum committed distance: start→wp1→...→wpN→start
  var pts=[start].concat(userWps).concat([start]);
  var minKm=0;
  for(var i=0;i<pts.length-1;i++)minKm+=haversineKm(pts[i],pts[i+1])*1.3; // road factor ~1.3
  var extra=Math.max(0,targetKm-minKm);
  return extra;
}

// Build loop waypoints that hit the target duration
function makeLoopWps(attempt,baseAng){
  var start=L.latLng(S.startLL.lat,S.startLL.lng);
  var userWps=S.waypoints||[];
  var wps=[start];
  var shrink=W._shrink||0.55;

  if(userWps.length){
    // Always pass through user waypoints — alternate order each attempt for variety
    var ordered=userWps.slice();
    if(attempt%2===0)ordered.reverse();
    ordered.forEach(function(w){wps.push(L.latLng(w.lat,w.lng))});

    // Add filler arc on opposite side to pad duration toward target
    var extraKm=extraKmNeeded();
    if(extraKm>0.5){
      // Figure out a radius for the filler arc based on extra km needed
      // circumference ≈ extraKm, so radius ≈ extraKm/(2π) * 2 (just one arc side)
      var fillRad=Math.max(0.3, extraKm/(Math.PI)); // rough arc radius in km
      // Direction: centroid of user waypoints, then opposite
      var midLat=userWps.reduce(function(s,w){return s+w.lat},0)/userWps.length;
      var midLng=userWps.reduce(function(s,w){return s+w.lng},0)/userWps.length;
      var oppAng=Math.atan2(midLat-start.lat,midLng-start.lng)+Math.PI;
      var nFill=Math.min(3,Math.max(1,Math.round(extraKm/3)));
      var jitter=(attempt%3-1)*0.35;
      for(var f=0;f<nFill;f++){
        var frac=(f+0.5)/nFill;
        var ang=oppAng+jitter+(f-nFill/2)*0.45;
        var dist=fillRad*(0.5+frac*0.5);
        var fLa=(dist*Math.sin(ang))/110.574;
        var fLo=(dist*Math.cos(ang))/(111.320*Math.cos(start.lat*Math.PI/180));
        wps.push(L.latLng(start.lat+fLa,start.lng+fLo));
      }
    }else{
      // Minimal filler — just one midpoint to guide loop closure
      var midLat2=userWps.reduce(function(s,w){return s+w.lat},0)/userWps.length;
      var midLng2=userWps.reduce(function(s,w){return s+w.lng},0)/userWps.length;
      var bAng=Math.atan2(midLat2-start.lat,midLng2-start.lng)+Math.PI;
      var bDist=Math.max(0.3,W.rad*shrink*0.3);
      wps.push(L.latLng(start.lat+(bDist*Math.sin(bAng))/110.574,start.lng+(bDist*Math.cos(bAng))/(111.320*Math.cos(start.lat*Math.PI/180))));
    }

  }else{
    // No user waypoints — arc-based loop sized to hit duration target
    // Target km at 40km/h suburban average
    var targetKm2=(W.dur/60)*40;
    // Pick arc radius so total route is approximately target distance
    // For a simple arc loop, dist ≈ 2 * radius * π * (sweep/2π) ≈ radius * sweep
    // We use ~3-4 waypoints with spread sweep ≈ π*1.3, so dist ≈ 2.5 * rad
    // Therefore rad ≈ targetKm / 2.5 — but capped by W.rad
    var calcRad=targetKm2/2.5;
    var useRad=Math.min(calcRad,W.rad);
    // On later attempts adjust using the shrink factor that was calibrated per attempt
    useRad=useRad*shrink;

    var nw=3+Math.floor(Math.random()*2);
    var dir=(attempt%2===0)?1:-1;
    var sweep=Math.PI*(1.1+Math.random()*0.7);
    for(var j=0;j<nw;j++){
      var frac=(j+1)/(nw+1);
      var ang=baseAng+dir*sweep*frac;
      var dist2=useRad*(0.55+Math.random()*0.45);
      var la=(dist2*Math.sin(ang))/110.574;
      var lo=(dist2*Math.cos(ang))/(111.320*Math.cos(start.lat*Math.PI/180));
      wps.push(L.latLng(start.lat+la,start.lng+lo));
    }
  }

  wps.push(start); // close the loop
  return wps;
}

function doGen(){
  var gb=$("wgen");if(gb){gb.innerHTML='<span class="ld"></span> Generating...';gb.disabled=true}
  S.genRoutes=[];
  var collected=0,total=3,attempt=0,maxAttempt=22;
  var hasUserWps=(S.waypoints&&S.waypoints.length>0);
  // Initial shrink calibrated to target duration
  if(!hasUserWps){
    var targetKm=(W.dur/60)*40;
    var calcRad=targetKm/2.5;
    W._shrink=Math.min(calcRad/Math.max(W.rad,0.1),0.95);
    W._shrink=Math.max(W._shrink,0.25);
  }else{
    W._shrink=0.55;
  }
  var baseAng=Math.random()*2*Math.PI;
  var start=L.latLng(S.startLL.lat,S.startLL.lng);

  function tryOne(){
    if(collected>=total||attempt>=maxAttempt){finGen();return}
    attempt++;
    var wps=makeLoopWps(attempt,baseAng+(attempt-1)*0.38);
    osrm(wps).then(function(route){
      if(!route){tryOne();return}
      var dist=route.distance/1000;
      if(dist<0.3){tryOne();return}
      // For pure loops, enforce radius
      if(!hasUserWps&&!inRad(route,start,W.rad)){W._shrink*=0.78;tryOne();return}
      // Dedup
      var isDup=false;
      for(var i=0;i<S.genRoutes.length;i++){if(Math.abs(S.genRoutes[i].distance-dist)<0.5){isDup=true;break}}
      if(isDup){tryOne();return}

      S.genRoutes.push({
        distance:dist,
        duration:route.duration/60,
        steps:route.legs?route.legs.reduce(function(a,l){return a.concat(l.steps||[])},[]):[],
        geometry:route.geometry
      });
      collected++;

      // Adapt shrink/fill for next attempt based on how close duration was
      var ratio=(route.duration/60)/W.dur;
      if(ratio<0.65){
        if(!hasUserWps)W._shrink=Math.min(W._shrink*1.22,0.98);
        // For waypoint routes, extra filler will auto-scale via extraKmNeeded()
      }else if(ratio>1.35){
        if(!hasUserWps)W._shrink*=0.80;
      }
      tryOne();
    });
  }
  tryOne();
}

function finGen(){
  if(!S.genRoutes.length){
    toast("Could not generate routes — try adjusting radius or duration");
    var gb=$("wgen");if(gb){gb.textContent="Generate Routes";gb.disabled=false}
    return;
  }
  S.genRoutes.sort(function(a,b){return Math.abs(a.duration-W.dur)-Math.abs(b.duration-W.dur)});
  S.genIdx=0;closeW();drawRoute(0);showResult();
  if(!W.skipSave)saveRt(S.genRoutes[0]);
  W.skipSave=false;
}

// ─── Sheet collapse ───
$("sh-tog").addEventListener("click",function(){
  var msh=$("msh");msh.classList.toggle("mini");
  $("sh-tog").textContent=msh.classList.contains("mini")?"▴":"▾";
});

function drawRoute(idx){
  if(rLy)map.removeLayer(rLy);if(gLy)map.removeLayer(gLy);if(rCir)map.removeLayer(rCir);if(drvLy)map.removeLayer(drvLy);drvLy=null;
  if(rtStartMk)map.removeLayer(rtStartMk);if(rtEndMk)map.removeLayer(rtEndMk);rtStartMk=rtEndMk=null;
  var rd=S.genRoutes[idx];if(!rd)return;
  var coords=rd.geometry.coordinates.map(function(c){return[c[1],c[0]]});
  rd._coords=coords;
  rd._cumDist=[0];
  for(var i=1;i<coords.length;i++){
    rd._cumDist.push(rd._cumDist[i-1]+L.latLng(coords[i-1][0],coords[i-1][1]).distanceTo(L.latLng(coords[i][0],coords[i][1])));
  }
  gLy=L.polyline(coords,{color:"#0a1428",weight:10,opacity:0.6,lineCap:"round",lineJoin:"round"}).addTo(map);
  var totalD=rd._cumDist[rd._cumDist.length-1];
  var segGroup=L.layerGroup().addTo(map);
  var segSize=Math.max(4,Math.floor(coords.length/40));
  for(var si=0;si<coords.length-1;si+=segSize){
    var ei=Math.min(si+segSize+1,coords.length);
    var seg=coords.slice(si,ei);if(seg.length<2)continue;
    var frac=totalD>0?rd._cumDist[si]/totalD:0;
    var r2=Math.round(34+(77-34)*frac),g2=Math.round(216+(158-216)*frac),b2=Math.round(158+(255-158)*frac);
    L.polyline(seg,{color:"rgb("+r2+","+g2+","+b2+")",weight:5,opacity:0.95,lineCap:"round",lineJoin:"round"}).addTo(segGroup);
  }
  rLy=segGroup;
  var start=L.latLng(S.startLL.lat,S.startLL.lng);
  if(!(S.waypoints&&S.waypoints.length))rCir=L.circle(start,{radius:W.rad*1000,color:"#22d89e",weight:1,opacity:0.2,fillColor:"#22d89e",fillOpacity:0.02,dashArray:"8 10"}).addTo(map);
  var firstPt=coords[0],lastPt=coords[coords.length-1];
  var isLoop=L.latLng(firstPt[0],firstPt[1]).distanceTo(L.latLng(lastPt[0],lastPt[1]))<300;
  if(isLoop){
    rtStartMk=L.marker(firstPt,{icon:iLoop,zIndexOffset:900}).addTo(map).bindPopup("Start / Finish (Loop)");
  }else{
    rtStartMk=L.marker(firstPt,{icon:iA,zIndexOffset:900}).addTo(map).bindPopup("A — Start");
    rtEndMk=L.marker(lastPt,{icon:iB,zIndexOffset:900}).addTo(map).bindPopup("B — Destination");
  }
  // Redraw user waypoint markers
  if(S.waypoints&&S.waypoints.length){
    S.waypoints.forEach(function(w,i){
      if(w.marker)map.removeLayer(w.marker);
      w.marker=L.marker([w.lat,w.lng],{icon:mkWaypointIcon(i+1),zIndexOffset:950}).addTo(map).bindPopup("Waypoint "+(i+1)+": "+w.label);
    });
  }
  map.fitBounds(L.latLngBounds(coords),{padding:[50,50]});
  S.curRoute=rd;
  $("msh").classList.remove("mini");$("sh-tog").textContent="▾";
  if(S.poiCache&&S.poiCache.length)renderPOIs(rd,S.poiCache);else fetchPOIs(rd);
}

// ═══ POI ═══
var POI_MAP={
  "parking":{q:'["amenity"="parking"]',icon:"🅿",css:"poi-parking",label:"Parking Lot"},
  "roundabouts":{q:'["junction"="roundabout"]',icon:"🔄",css:"poi-roundabout",label:"Roundabout"},
  "hills":{q:'["natural"="peak"]',icon:"⛰",css:"poi-hill",label:"Hill / Incline"},
  "main-roads":{q:'["amenity"="fuel"]',icon:"⛽",css:"poi-fuel",label:"Fuel Station"},
  "residential":{q:'["amenity"="school"]',icon:"🏫",css:"poi-school",label:"School Zone"},
  "multi-lane":{q:'["highway"="traffic_signals"]',icon:"🚦",css:"poi-traffic",label:"Traffic Signals"}
};

function fetchPOIs(rd){
  if(!rd._coords||!rd._coords.length)return;
  var bounds=L.latLngBounds(rd._coords);var s=bounds.getSouth()-.008,bw=bounds.getWest()-.008,n=bounds.getNorth()+.008,e=bounds.getEast()+.008;var bbox=s+","+bw+","+n+","+e;
  var queries="";Object.keys(POI_MAP).forEach(function(t){var pm=POI_MAP[t];queries+="node"+pm.q+"("+bbox+");way"+pm.q+"("+bbox+");"});
  fetch("https://overpass-api.de/api/interpreter?data="+encodeURIComponent("[out:json][timeout:12];("+queries+");out center 60;")).then(function(r){return r.json()}).then(function(data){
    if(!data.elements||!data.elements.length)return;S.poiCache=data.elements;renderPOIs(rd,data.elements);
  }).catch(function(){});
}

function renderPOIs(rd,elements){
  if(poiLy){map.removeLayer(poiLy);poiLy=null}poiLy=L.layerGroup().addTo(map);
  var routePts=rd.geometry.coordinates.filter(function(c,i){return i%12===0}).map(function(c){return L.latLng(c[1],c[0])});
  var added=0,onC=0,nearC=0;
  elements.forEach(function(el){
    if(added>=15)return; // max 15 POIs to avoid cluttervar lat=el.lat||(el.center?el.center.lat:null);var lon=el.lon||(el.center?el.center.lon:null);if(!lat||!lon)return;
    var pt=L.latLng(lat,lon);var minDist=Infinity;routePts.forEach(function(rp){var d=rp.distanceTo(pt);if(d<minDist)minDist=d});if(minDist>300)return;
    var onRoute=minDist<120;var tags=el.tags||{};var poiType=null;
    if(tags.amenity==="parking")poiType="parking";else if(tags.junction==="roundabout")poiType="roundabouts";else if(tags.natural==="peak")poiType="hills";else if(tags.amenity==="fuel")poiType="main-roads";else if(tags.amenity==="school")poiType="residential";else if(tags.highway==="traffic_signals")poiType="multi-lane";
    if(!poiType||!POI_MAP[poiType])return;
    // Only show POIs for selected road types (prefs > 0)
    if(!W.prefs||!(W.prefs[poiType]>0))return;
    var pm=POI_MAP[poiType];var name=tags.name||pm.label;
    if(onRoute)onC++;else nearC++;
    var div=document.createElement("div");div.className="poi-mk "+pm.css;if(!(W.prefs[poiType]>0))div.style.opacity="0.45";div.textContent=pm.icon;
    var ico=L.divIcon({className:"",html:div.outerHTML,iconSize:[32,38],iconAnchor:[16,38]});
    var mk=L.marker([lat,lon],{icon:ico}).addTo(poiLy);
    var popHtml='<div style="font-family:var(--f);min-width:180px"><div style="font-weight:700;font-size:13px;margin-bottom:4px">'+pm.icon+" "+name+'</div><div style="font-size:11px;color:#888;margin-bottom:2px">'+pm.label+'</div><div style="font-size:11px;font-weight:600;color:'+(onRoute?"#22d89e":"#4d9eff")+';margin-bottom:8px">'+(onRoute?"On your route":"~"+Math.round(minDist)+"m away")+'</div>';
    if(!onRoute)popHtml+='<button onclick="rerouteViaPOI('+lat+","+lon+')" style="width:100%;padding:8px;border-radius:8px;background:var(--acc);color:#060a12;border:none;font-weight:700;font-size:12px;font-family:var(--f);cursor:pointer">Route via here</button>';
    popHtml+="</div>";mk.bindPopup(popHtml,{className:"poi-popup",maxWidth:220});added++;
  });
  if(onC>0||nearC>0)toast(onC+" on route, "+nearC+" nearby landmarks");
}

window.rerouteViaPOI=function(lat,lon){
  if(!S.curRoute||!S.startLL)return;map.closePopup();toast("Rerouting via landmark...");
  var start=L.latLng(S.startLL.lat,S.startLL.lng),via=L.latLng(lat,lon);
  var coords=S.curRoute.geometry.coordinates;
  var endCoord=coords[coords.length-1];
  osrm([start,via,L.latLng(endCoord[1],endCoord[0])]).then(function(route){
    if(!route){toast("Could not reroute");return}
    S.genRoutes[S.genIdx]={distance:route.distance/1000,duration:route.duration/60,steps:route.legs?route.legs.reduce(function(a,l){return a.concat(l.steps||[])},[]):[],geometry:route.geometry};
    drawRoute(S.genIdx);showResult();toast("Rerouted!");
  });
};

// ═══ RESULT PANEL ═══
function showResult(){
  var rd=S.genRoutes[S.genIdx];if(!rd)return;
  var diff=getDiff(W.diff||2);
  var diffPill=diff.level>=4?"pill-d":(diff.level>=3?"pill-w":"pill-a");
  var dur_diff=Math.round(rd.duration-W.dur);
  var wh='<div class="durw';
  if(dur_diff>15)wh+=' ov">⚠ ~'+dur_diff+' min over target ('+fm(W.dur)+')</div>';
  else if(dur_diff<-15)wh+=' un">ℹ ~'+Math.abs(dur_diff)+' min under target</div>';
  else wh+='"></div>';

  var wpCount=S.waypoints&&S.waypoints.length;
  // Route carousel
  var car='<div class="rcar">';
  S.genRoutes.forEach(function(r,i){
    car+='<div class="rcar-item'+(i===S.genIdx?" on":"")+'" data-gi="'+i+'">Loop '+(i+1)+' — '+r.distance.toFixed(1)+'km / '+Math.round(r.duration)+'min</div>';
  });
  car+='</div>';

  var lt=S.profile.licence_type||"L";
  var ltLabel=lt==="L"?"LEARNER":lt==="P1"?"P1":"P2";

  var h='<h3>Loop Ready <span class="pill pill-a">'+ltLabel+'</span> <span class="pill '+diffPill+'">'+diff.label+'</span></h3>';
  h+=car;
  h+='<div class="rstats">';
  h+='<div class="rs"><div class="rv">'+rd.distance.toFixed(1)+'</div><div class="rl">km route</div></div>';
  h+='<div class="rs"><div class="rv">'+Math.round(rd.duration)+'</div><div class="rl">minutes</div></div>';
  h+='<div class="rs"><div class="rv">'+(wpCount?wpCount+" pts":"Loop")+'</div><div class="rl">'+(wpCount?"waypoints":"type")+'</div></div>';
  h+='</div>';
  h+=diffHtml(diff);

  // Waypoint list (blue numbered, with remove buttons)
  if(wpCount){
    h+='<div style="margin:10px 0 4px;font-size:10px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.8px">Via waypoints</div>';
    h+=renderWaypointList();
    h+='<button class="btn bs bsm" id="rwp-clr" style="margin-top:4px;margin-bottom:6px">✕ Clear Waypoints</button>';
  }

  if(S.weather)h+=wxHtml(S.weather);
  h+=wh;

  // Primary action row
  h+='<div class="ar">';
  h+='<button class="btn ba" id="rgo">▶ Start Drive</button>';
  h+='<button class="btn bs" id="rprev" style="flex:none;padding:12px 16px">👁️ Preview</button>';
  h+='<button class="btn bs" id="rexp" style="flex:none;padding:12px 16px">📤</button>';
  h+='</div>';

  // Add waypoint to existing route
  h+=renderStopUI();

  // Secondary actions
  h+='<div class="ar" style="margin-top:6px">';
  h+='<button class="btn bs bsm" id="rreb">Rebuild</button>';
  h+='<button class="btn bs bsm" id="rnew">+ New</button>';
  h+='<button class="btn bs bsm" id="rclr">Clear</button>';
  h+='</div>';

  $("sh").innerHTML=h;

  document.querySelectorAll(".rcar-item").forEach(function(el){
    el.addEventListener("click",function(){S.genIdx=parseInt(el.getAttribute("data-gi"));drawRoute(S.genIdx);showResult()});
  });
  $("rgo").addEventListener("click",startNav);
  $("rexp").addEventListener("click",expGM);
  $("rreb").addEventListener("click",openW);
  $("rprev").addEventListener("click",startPreview);
  $("rnew").addEventListener("click",function(){toast("Generating...");addOneRoute()});
  $("rclr").addEventListener("click",function(){
    clrAll();S.curRoute=null;S.genRoutes=[];S.poiCache=null;S.stops=[];S.addingStop=false;
    if(S.startLL)sMk=L.marker([S.startLL.lat,S.startLL.lng],{icon:iS}).addTo(map);
    showWelcome();
  });
  var rwpc=$("rwp-clr");
  if(rwpc)rwpc.addEventListener("click",function(){clearWaypoints();drawRoute(S.genIdx);showResult()});
  bindStopEvents();
}


function addOneRoute(){
  var start=L.latLng(S.startLL.lat,S.startLL.lng);
  var tries=0,baseAng=Math.random()*2*Math.PI;
  var hasUserWps=(S.waypoints&&S.waypoints.length>0);
  function go(){
    if(tries>=7){toast("Could not find another route");return}tries++;
    var wps=makeLoopWps(tries,baseAng+tries*0.6);
    osrm(wps).then(function(route){
      if(!route){go();return}
      var dist=route.distance/1000;
      var isDup=false;S.genRoutes.forEach(function(e){if(Math.abs(e.distance-dist)<0.5)isDup=true});
      if(isDup){go();return}
      if(!hasUserWps&&!inRad(route,start,W.rad)){go();return}
      S.genRoutes.push({distance:dist,duration:route.duration/60,steps:route.legs?route.legs.reduce(function(a,l){return a.concat(l.steps||[])},[]):[],geometry:route.geometry});
      S.genIdx=S.genRoutes.length-1;drawRoute(S.genIdx);showResult();toast("Route "+(S.genIdx+1)+" added");
    });
  }
  go();
}
