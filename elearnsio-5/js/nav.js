// ═══ PREVIEW FLYOVER ═══
var prevAnim=null,prevDist=0,prevPaused=false,prevSpeed=0.5,prevMk=null;

function startPreview(){
  if(!S.curRoute||!S.curRoute._coords||!S.curRoute._cumDist)return;
  var coords=S.curRoute._coords;if(coords.length<2)return;
  prevDist=0;prevPaused=false;prevSpeed=0.5;
  $("prev-bar").classList.add("on");$("msh").classList.add("hid");
  $("prev-sub").textContent="0% · "+S.curRoute.distance.toFixed(1)+" km route";
  document.querySelectorAll(".prev-spd button").forEach(function(b){b.classList.toggle("on",b.getAttribute("data-ps")==="0.5")});
  if(prevMk)map.removeLayer(prevMk);
  prevMk=L.marker(coords[0],{icon:makeArrowIcon(0),zIndexOffset:2000}).addTo(map);
  map.setView(coords[0],16);
  animPreview();
}

function animPreview(){
  if(prevAnim)cancelAnimationFrame(prevAnim);
  var coords=S.curRoute._coords,cumDist=S.curRoute._cumDist;
  var totalDist=cumDist[cumDist.length-1];
  if(totalDist<=0){stopPreview();return}
  var lastRot=0,frameCount=0;
  function tick(){
    if(prevPaused){prevAnim=requestAnimationFrame(tick);return}
    prevDist+=14*prevSpeed;
    if(prevDist>=totalDist){stopPreview();return}
    var lo=0,hi=cumDist.length-1;
    while(lo<hi-1){var mid=Math.floor((lo+hi)/2);if(cumDist[mid]<=prevDist)lo=mid;else hi=mid}
    var segLen=cumDist[hi]-cumDist[lo];
    var t=segLen>0?(prevDist-cumDist[lo])/segLen:0;
    var lat=coords[lo][0]+(coords[hi][0]-coords[lo][0])*t;
    var lng=coords[lo][1]+(coords[hi][1]-coords[lo][1])*t;
    prevMk.setLatLng([lat,lng]);
    frameCount++;
    if(frameCount%6===0){
      var aheadIdx=Math.min(hi+10,coords.length-1);
      var rot=bearing(lat,lng,coords[aheadIdx][0],coords[aheadIdx][1]);
      if(Math.abs(rot-lastRot)>2){
        var el=prevMk.getElement();
        if(el){var svg=el.querySelector("svg");if(svg)svg.style.transform="rotate("+rot+"deg)"}
        lastRot=rot;
      }
    }
    map.panTo([lat,lng],{animate:true,duration:0.12,noMoveStart:true});
    var pct=Math.round((prevDist/totalDist)*100);
    $("prev-fill").style.width=pct+"%";
    $("prev-sub").textContent=pct+"% · "+(prevDist/1000).toFixed(1)+" / "+S.curRoute.distance.toFixed(1)+" km";
    prevAnim=requestAnimationFrame(tick);
  }
  prevAnim=requestAnimationFrame(tick);
}

function stopPreview(){
  if(prevAnim)cancelAnimationFrame(prevAnim);prevAnim=null;
  $("prev-bar").classList.remove("on");$("msh").classList.remove("hid");
  if(prevMk){map.removeLayer(prevMk);prevMk=null}
  if(S.curRoute&&S.curRoute._coords)map.fitBounds(L.latLngBounds(S.curRoute._coords),{padding:[50,50]});
}

$("prev-x").addEventListener("click",stopPreview);
$("prev-pp").addEventListener("click",function(){prevPaused=!prevPaused;$("prev-pp").textContent=prevPaused?"▶":"⏸"});
document.querySelectorAll(".prev-spd button").forEach(function(b){b.addEventListener("click",function(){prevSpeed=parseFloat(b.getAttribute("data-ps"));document.querySelectorAll(".prev-spd button").forEach(function(x){x.classList.remove("on")});b.classList.add("on")})});
$("prev-prog").addEventListener("click",function(e){
  var rect=this.getBoundingClientRect();var pct=(e.clientX-rect.left)/rect.width;
  if(S.curRoute&&S.curRoute._cumDist){var total=S.curRoute._cumDist[S.curRoute._cumDist.length-1];prevDist=Math.floor(pct*total)}
});

// ═══ GPS ACCURACY SYSTEM ═══
// Multi-sample Kalman-inspired GPS smoother for accurate positioning
var gpsFilter={lat:0,lng:0,acc:999,variance:999};
var GPS_MIN_ACC=20; // ignore readings worse than 20m (configurable)
var GPS_Q=3;        // process noise — how much we trust movement
var GPS_R_BASE=10;  // measurement noise base

function filterGPS(lat,lng,accuracy){
  var r=Math.max(GPS_R_BASE, accuracy||GPS_R_BASE);
  // First reading
  if(gpsFilter.variance===999){
    gpsFilter.lat=lat;gpsFilter.lng=lng;gpsFilter.variance=r*r;gpsFilter.acc=accuracy;
    return{lat:lat,lng:lng};
  }
  // Kalman gain
  var kg=gpsFilter.variance/(gpsFilter.variance+r*r);
  gpsFilter.lat=gpsFilter.lat+kg*(lat-gpsFilter.lat);
  gpsFilter.lng=gpsFilter.lng+kg*(lng-gpsFilter.lng);
  gpsFilter.variance=(1-kg)*gpsFilter.variance+GPS_Q;
  gpsFilter.acc=accuracy;
  return{lat:gpsFilter.lat,lng:gpsFilter.lng};
}

// ═══ NAVIGATION ═══
var navSI=0,navCoords=[],navProgIdx=0;
var navOffRoute=false,navOffRouteTimer=null;
var navHeadingHistory=[];

function startNav(){
  if(!S.curRoute)return;
  S.navStart=Date.now();S.drivenKm=0;S.lastGPS=null;S.gpsBearing=0;
  S.spdHistory=[];S.etaHistory=[];S.navArrived=false;S.navGpsCount=0;
  navSI=0;navProgIdx=0;navOffRoute=false;navHeadingHistory=[];
  gpsFilter={lat:0,lng:0,acc:999,variance:999};
  navCoords=S.curRoute._coords||S.curRoute.geometry.coordinates.map(function(c){return[c[1],c[0]]});
  toast("Drive started — stay safe!");
  $("navp").classList.add("on");$("sorb").classList.add("on");$("nbar").classList.add("on");
  $("msh").classList.add("hid");$("bnav").style.display="none";
  $("nav-prog-bar").style.width="0%";
  if(rtStartMk)map.removeLayer(rtStartMk);if(rtEndMk)map.removeLayer(rtEndMk);
  showNS();
  if(pMk)map.removeLayer(pMk);
  pMk=L.marker(navCoords[0],{icon:makeArrowIcon(0),zIndexOffset:1000}).addTo(map);
  map.setView(navCoords[0],17);
  if(navigator.geolocation){
    wId=navigator.geolocation.watchPosition(onGPS,onGPSErr,{
      enableHighAccuracy:true,
      maximumAge:500,    // fresh readings only
      timeout:8000
    });
  }
}

function onGPSErr(err){
  if(err.code===1)toast("GPS denied — enable location for navigation");
  else toast("GPS signal weak — finding position...");
}

function onGPS(pos){
  var rawLat=pos.coords.latitude,rawLng=pos.coords.longitude;
  var acc=pos.coords.accuracy||15;
  S.navGpsCount++;

  // Reject very inaccurate readings while we have enough data
  if(acc>80&&S.navGpsCount>5)return;

  // Apply Kalman filter for smooth, accurate position
  var filtered=filterGPS(rawLat,rawLng,acc);
  var lat=filtered.lat,lng=filtered.lng;

  // Speed: prefer device speed, fall back to calculated from movement
  var rawSpd=pos.coords.speed!=null?Math.round(pos.coords.speed*3.6):-1;
  var cur=L.latLng(lat,lng);
  if(S.lastGPS){
    var seg=S.lastGPS.distanceTo(cur);
    var dt=(Date.now()-S._lastGPSTime||1000)/1000;
    if(rawSpd<0)rawSpd=Math.round((seg/dt)*3.6);
    if(seg/1000<0.5&&seg>1)S.drivenKm+=seg/1000;
    S.gpsBearing=bearing(S.lastGPS.lat,S.lastGPS.lng,lat,lng);
  }
  S.lastGPS=cur;S._lastGPSTime=Date.now();

  // Smooth speed — reject spikes >30km/h jump
  if(S.spdHistory.length&&Math.abs(rawSpd-(S.spdHistory[S.spdHistory.length-1]||0))>30)rawSpd=S.spdHistory[S.spdHistory.length-1]||0;
  S.spdHistory.push(Math.max(0,rawSpd));if(S.spdHistory.length>6)S.spdHistory.shift();
  var avgSpd=Math.round(S.spdHistory.reduce(function(a,b){return a+b},0)/S.spdHistory.length);
  $("snum").textContent=avgSpd;

  // Speed limit colour coding
  var sorb=$("sorb");var accEl=$("sorb-acc");if(accEl)accEl.textContent=acc<10?"GPS ±"+Math.round(acc)+"m":(acc<25?"±"+Math.round(acc)+"m":"⚠ ±"+Math.round(acc)+"m");
  if(acc>40)sorb.classList.add("gps-weak");else sorb.classList.remove("gps-weak","gps-lost");if(avgSpd>110)sorb.style.borderColor="#f05050";
  else if(avgSpd>80)sorb.style.borderColor="#f0a040";
  else if(avgSpd>60)sorb.style.borderColor="var(--i)";
  else sorb.style.borderColor="var(--acc)";

  // Smooth heading with circular mean
  navHeadingHistory.push(S.gpsBearing);if(navHeadingHistory.length>4)navHeadingHistory.shift();
  var sinSum=0,cosSum=0;
  navHeadingHistory.forEach(function(h){sinSum+=Math.sin(h*Math.PI/180);cosSum+=Math.cos(h*Math.PI/180)});
  var smoothBearing=(Math.atan2(sinSum,cosSum)*180/Math.PI+360)%360;

  // Update marker
  if(pMk){pMk.setLatLng(cur);pMk.setIcon(makeArrowIcon(smoothBearing))}

  // Map follows with heading-up tilt (pan only, no jarring recentre if off-panning)
  map.panTo(cur,{animate:true,duration:0.4,noMoveStart:true});

  // Snap to nearest route point (search window grows if off-route)
  var searchWindow=navOffRoute?150:80;
  var bD=Infinity,bI=navProgIdx;
  var sS=Math.max(0,navProgIdx-5),sE=Math.min(navCoords.length,navProgIdx+searchWindow);
  for(var i=sS;i<sE;i++){
    var d=cur.distanceTo(L.latLng(navCoords[i][0],navCoords[i][1]));
    if(d<bD){bD=d;bI=i}
  }
  if(bI>=navProgIdx-3)navProgIdx=bI;
  updTrail();

  // Off-route detection: >80m from route for 5+ seconds
  if(bD>80){
    if(!navOffRoute){
      if(!navOffRouteTimer)navOffRouteTimer=setTimeout(function(){
        if(bD>80){navOffRoute=true;toast("⚠ Off route — recalculating...");navRecalc(lat,lng)}
      },5000);
    }
  }else{
    navOffRoute=false;
    if(navOffRouteTimer){clearTimeout(navOffRouteTimer);navOffRouteTimer=null}
  }

  // Progress bar
  $("nav-prog-bar").style.width=Math.min(100,Math.round((navProgIdx/(navCoords.length-1))*100))+"%";

  // Remaining distance
  var rK=0;for(var j=navProgIdx;j<navCoords.length-1;j++)rK+=L.latLng(navCoords[j][0],navCoords[j][1]).distanceTo(L.latLng(navCoords[j+1][0],navCoords[j+1][1]))/1000;

  // Adaptive ETA: use 35km/h if slow/stopped, actual speed otherwise
  var etaSpd=avgSpd>5?avgSpd:35;
  var rM=Math.round((rK/etaSpd)*60);
  S.etaHistory.push(rM);if(S.etaHistory.length>10)S.etaHistory.shift();
  // Weighted average — recent readings count more
  var wSum=0,wTotal=0;
  S.etaHistory.forEach(function(v,i){var w=i+1;wSum+=v*w;wTotal+=w});
  var smoothEta=Math.round(wSum/wTotal);
  $("neta").textContent=smoothEta;$("nkm").textContent=rK.toFixed(1);
  var etaTime=new Date(Date.now()+smoothEta*60000);
  $("neta-clock").textContent=etaTime.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});

  // Turn-by-turn
  var steps=S.curRoute.steps;
  if(navSI<steps.length){
    var st=steps[navSI];var ml=st.maneuver?st.maneuver.location:null;
    if(ml){
      var sD=cur.distanceTo(L.latLng(ml[1],ml[0]));
      var distTxt=sD<1000?Math.round(sD)+"m":(sD/1000).toFixed(1)+"km";
      $("ndist").textContent=distTxt;
      // Voice-style countdown cues
      if(sD<30&&!st._cued){st._cued=true;showNS()}
      else if(sD<50)navSI++;
    }
  }

  // Arrival detection
  var eP=L.latLng(navCoords[navCoords.length-1][0],navCoords[navCoords.length-1][1]);
  var elapsed=(Date.now()-S.navStart)/1000;
  if(cur.distanceTo(eP)<40&&navProgIdx/(navCoords.length-1)>0.6&&S.drivenKm>0.15&&elapsed>20&&S.navGpsCount>6&&!S.navArrived){
    S.navArrived=true;
    $("ndist").textContent="🏁 Arrived!";$("nroad").textContent="You reached your destination";$("nnext").textContent="";
    $("nav-prog-bar").style.width="100%";
    toast("You have arrived! "+S.drivenKm.toFixed(1)+" km driven");
    // Vibrate on arrival if supported
    if(navigator.vibrate)navigator.vibrate([200,100,200]);
  }
}

// Off-route recalculation — rejoins route at nearest upcoming point
function navRecalc(lat,lng){
  if(!S.curRoute||navCoords.length<2)return;
  var cur=L.latLng(lat,lng);
  // Find nearest remaining coord at least 200m ahead
  var targetIdx=navProgIdx;var bestD=Infinity;
  for(var i=navProgIdx+5;i<navCoords.length;i++){
    var d=cur.distanceTo(L.latLng(navCoords[i][0],navCoords[i][1]));
    if(d<bestD){bestD=d;targetIdx=i}
  }
  var endLL=L.latLng(navCoords[navCoords.length-1][0],navCoords[navCoords.length-1][1]);
  var viaLL=L.latLng(navCoords[targetIdx][0],navCoords[targetIdx][1]);
  osrm([cur,viaLL,endLL]).then(function(route){
    if(!route)return;
    var newCoords=route.geometry.coordinates.map(function(c){return[c[1],c[0]]});
    // Splice: keep driven portion + new path
    var driven=navCoords.slice(0,navProgIdx+1);
    navCoords=driven.concat(newCoords);
    var cumDist=[0];
    for(var i=1;i<navCoords.length;i++)cumDist.push(cumDist[i-1]+L.latLng(navCoords[i-1][0],navCoords[i-1][1]).distanceTo(L.latLng(navCoords[i][0],navCoords[i][1])));
    S.curRoute._coords=navCoords;S.curRoute._cumDist=cumDist;
    S.curRoute.steps=route.legs?route.legs.reduce(function(a,l){return a.concat(l.steps||[])},[]):[];
    navSI=0;navOffRoute=false;
    toast("Route updated");
    updTrail();showNS();
  });
}

function updTrail(){
  if(drvLy){map.removeLayer(drvLy);drvLy=null}
  if(rLy)map.removeLayer(rLy);if(gLy)map.removeLayer(gLy);
  var driven=navCoords.slice(0,navProgIdx+1),remaining=navCoords.slice(navProgIdx);
  if(driven.length>1)drvLy=L.polyline(driven,{color:"#556580",weight:4,opacity:0.25,lineCap:"round"}).addTo(map);
  if(remaining.length>1){
    gLy=L.polyline(remaining,{color:"#0a1428",weight:10,opacity:0.7,lineCap:"round"}).addTo(map);
    rLy=L.polyline(remaining,{color:"#22d89e",weight:5,opacity:0.95,lineCap:"round"}).addTo(map);
  }
}

function showNS(){
  var steps=S.curRoute?S.curRoute.steps:[];
  if(navSI>=steps.length){$("ndist").textContent="🏁 Arrived!";$("nroad").textContent="Destination reached";$("nnext").textContent="";return}
  var s=steps[navSI];$("nroad").textContent=s.name||"Continue";
  var man=s.maneuver?s.maneuver.modifier||"":"",typ=s.maneuver?s.maneuver.type||"":"";
  var ic="↑";
  if(typ==="arrive")ic="🏁";
  else if(typ==="roundabout"||typ==="rotary")ic="🔄";
  else if(man.indexOf("sharp right")>=0)ic="↪";
  else if(man.indexOf("sharp left")>=0)ic="↩";
  else if(man.indexOf("right")>=0)ic="↱";
  else if(man.indexOf("left")>=0)ic="↰";
  else if(man.indexOf("uturn")>=0)ic="↺";
  else if(man.indexOf("straight")>=0)ic="↑";
  $("nd").textContent=ic;
  if(navSI+1<steps.length){
    var ns=steps[navSI+1];var nm=ns.maneuver?ns.maneuver.modifier||"":"";var ntyp=ns.maneuver?ns.maneuver.type||"":"";
    var nic="↑";
    if(ntyp==="roundabout")nic="🔄";
    else if(nm.indexOf("right")>=0)nic="↱";
    else if(nm.indexOf("left")>=0)nic="↰";
    $("nnext").textContent="Then "+nic+" "+(ns.name||"continue");
  }else $("nnext").textContent="";
}

function stopNav(){
  if(navOffRouteTimer){clearTimeout(navOffRouteTimer);navOffRouteTimer=null}
  $("navp").classList.remove("on");$("sorb").classList.remove("on");$("nbar").classList.remove("on");
  $("msh").classList.remove("hid");$("bnav").style.display="";
  if(wId!==null){navigator.geolocation.clearWatch(wId);wId=null}
  if(pMk){map.removeLayer(pMk);pMk=null}
  if(drvLy){map.removeLayer(drvLy);drvLy=null}
  if(S.curRoute&&S.curRoute._coords){
    if(rLy)map.removeLayer(rLy);if(gLy)map.removeLayer(gLy);
    gLy=L.polyline(S.curRoute._coords,{color:"#0a1428",weight:10,opacity:0.7,lineCap:"round"}).addTo(map);
    rLy=L.polyline(S.curRoute._coords,{color:"#22d89e",weight:5,opacity:0.95,lineCap:"round"}).addTo(map);
    var firstPt=S.curRoute._coords[0],lastPt=S.curRoute._coords[S.curRoute._coords.length-1];
    var isLoop=L.latLng(firstPt[0],firstPt[1]).distanceTo(L.latLng(lastPt[0],lastPt[1]))<300;
    if(rtStartMk)map.removeLayer(rtStartMk);if(rtEndMk)map.removeLayer(rtEndMk);rtStartMk=rtEndMk=null;
    if(isLoop)rtStartMk=L.marker(firstPt,{icon:iLoop,zIndexOffset:900}).addTo(map);
    else{rtStartMk=L.marker(firstPt,{icon:iA,zIndexOffset:900}).addTo(map);rtEndMk=L.marker(lastPt,{icon:iB,zIndexOffset:900}).addTo(map)}
  }
  var elapsed=S.navStart?Math.round((Date.now()-S.navStart)/60000):0;
  var drivenDist=S.drivenKm.toFixed(1);
  navSI=0;navProgIdx=0;S.lastGPS=null;S.navStart=null;S.spdHistory=[];S.etaHistory=[];S.navArrived=false;S.navGpsCount=0;
  navOffRoute=false;navHeadingHistory=[];gpsFilter={lat:0,lng:0,acc:999,variance:999};
  if(elapsed>=1){
    $("ml-dt").value=new Date().toISOString().split("T")[0];
    $("ml-du").value=elapsed;$("ml-sp").value=S.profile.supervisor||"";
    $("ml-nt").value="Drove "+drivenDist+" km in "+elapsed+" min";
    document.querySelectorAll("#ml-ch .ch").forEach(function(c){c.classList.remove("on")});
    $("ml").classList.add("on");
    toast("Drive complete! "+drivenDist+" km driven.");
  }
}
$("nx").addEventListener("click",stopNav);$("nstop").addEventListener("click",stopNav);
$("nlog").addEventListener("click",function(){
  var elapsed=S.navStart?Math.round((Date.now()-S.navStart)/60000):0;
  $("ml-dt").value=new Date().toISOString().split("T")[0];
  $("ml-du").value=elapsed>0?elapsed:"";$("ml-sp").value=S.profile.supervisor||"";
  $("ml-nt").value="In-progress: "+S.drivenKm.toFixed(1)+" km driven";
  document.querySelectorAll("#ml-ch .ch").forEach(function(c){c.classList.remove("on")});
  $("ml").classList.add("on");
});

function expGM(){
  if(!S.curRoute||!S.curRoute._coords||!S.startLL)return;
  var pts=S.curRoute._coords,s=S.startLL,e={lat:pts[pts.length-1][0],lng:pts[pts.length-1][1]};
  var step=Math.max(1,Math.floor(pts.length/10)),wps=[];
  for(var i=step;i<pts.length-step;i+=step){if(wps.length>=8)break;wps.push(pts[i][0]+","+pts[i][1])}
  window.open("https://www.google.com/maps/dir/?api=1&origin="+s.lat+","+s.lng+"&destination="+e.lat+","+e.lng+"&waypoints="+wps.join("|")+"&travelmode=driving","_blank");
}
