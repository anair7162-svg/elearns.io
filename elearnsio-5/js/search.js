// ═══ SEARCH & AUTOCOMPLETE ═══
var acTimer=null;
$("sinp").addEventListener("input",function(){
  var q=this.value.trim();
  clearTimeout(acTimer);
  if(q.length<2){$("ac-drop").classList.remove("on");return}
  acTimer=setTimeout(function(){
    fetch("https://nominatim.openstreetmap.org/search?format=json&q="+encodeURIComponent(q)+" NSW Australia&limit=6&addressdetails=1")
    .then(function(r){return r.json()}).then(function(results){
      var drop=$("ac-drop");
      if(!results.length){drop.innerHTML='<div class="ac-item"><span class="ac-icon">❌</span><span class="ac-text">No results</span></div>';drop.classList.add("on");return}
      drop.innerHTML="";
      results.forEach(function(r){
        var d=document.createElement("div");d.className="ac-item";
        var short=r.display_name.split(",").slice(0,3).join(",");
        var type=r.type||"";type=type.charAt(0).toUpperCase()+type.slice(1);
        d.innerHTML='<span class="ac-icon">📍</span><div style="flex:1;min-width:0"><div class="ac-text">'+short+'</div><div class="ac-sub">'+type+'</div></div>';
        d.addEventListener("click",function(){
          $("sinp").value=short;drop.classList.remove("on");
          pinLocation(parseFloat(r.lat),parseFloat(r.lon),r.display_name);
        });
        drop.appendChild(d);
      });
      drop.classList.add("on");
    }).catch(function(){});
  },280);
});
$("sinp").addEventListener("keypress",function(e){if(e.key==="Enter"){$("ac-drop").classList.remove("on");doDestSearch()}});
$("sbtn").addEventListener("click",function(){$("ac-drop").classList.remove("on");doDestSearch()});
document.addEventListener("click",function(e){if(!e.target.closest(".mtop"))$("ac-drop").classList.remove("on")});

function doDestSearch(){
  var q=$("sinp").value.trim();if(!q)return;
  fetch("https://nominatim.openstreetmap.org/search?format=json&q="+encodeURIComponent(q)+" NSW Australia&limit=1")
  .then(function(r){return r.json()}).then(function(d){
    if(!d.length){toast("Not found");return}
    pinLocation(parseFloat(d[0].lat),parseFloat(d[0].lon),d[0].display_name);
  }).catch(function(){toast("Search failed")});
}

// ─── Pinned location banner (works before AND after route generation) ───
var pinnedLocation=null,pinnedMarker=null;

function pinLocation(lat,lng,label){
  var short=label.split(",").slice(0,2).join(",");
  pinnedLocation={lat:lat,lng:lng,label:short};
  if(pinnedMarker)map.removeLayer(pinnedMarker);
  pinnedMarker=L.marker([lat,lng],{icon:iDest,zIndexOffset:800}).addTo(map).bindPopup(short).openPopup();
  map.setView([lat,lng],15);
  showPinnedBanner(short,lat,lng);
}

function showPinnedBanner(label,lat,lng){
  var banner=$("mban");
  if(!banner){banner=document.createElement("div");banner.id="mban";banner.className="mban";$("s-map").appendChild(banner)}
  banner.className="mban on";
  banner.innerHTML=
    '<div style="font-size:18px;flex-shrink:0">📍</div>'+
    '<div style="flex:1;min-width:0">'+
      '<div style="color:var(--t1);font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+label+'</div>'+
      '<div style="font-size:11px;color:var(--t3);margin-top:1px">'+(S.curRoute?'Add to existing route':'Add as waypoint for loop')+'</div>'+
    '</div>'+
    '<button class="btn ba" id="mban-add" style="flex:none;padding:9px 14px;font-size:12px;white-space:nowrap">+ Waypoint</button>'+
    '<button class="bg" id="mban-x" style="font-size:20px;padding:4px 10px;color:var(--t3);flex-shrink:0">✕</button>';
  $("mban-add").addEventListener("click",function(){addWaypoint(lat,lng,label)});
  $("mban-x").addEventListener("click",dismissBanner);
}

function dismissBanner(){
  var banner=$("mban");if(banner)banner.classList.remove("on");
  if(pinnedMarker){map.removeLayer(pinnedMarker);pinnedMarker=null}
  pinnedLocation=null;$("sinp").value="";
}

// ═══ WAYPOINTS (unified — used both before and after route generation) ═══
if(!S.waypoints)S.waypoints=[];

function mkWaypointIcon(num){
  var d=document.createElement("div");d.className="mk-label mk-label-wp";d.textContent=num;
  return L.divIcon({className:"",html:d.outerHTML,iconSize:[28,28],iconAnchor:[14,14]});
}

function addWaypoint(lat,lng,label){
  var short=(label||"").split(",").slice(0,2).join(",");
  if(pinnedMarker){map.removeLayer(pinnedMarker);pinnedMarker=null}
  var idx=S.waypoints.length+1;
  var mk=L.marker([lat,lng],{icon:mkWaypointIcon(idx),zIndexOffset:900}).addTo(map)
           .bindPopup("Waypoint "+idx+": "+short);
  S.waypoints.push({lat:lat,lng:lng,label:short,marker:mk});
  dismissBanner();
  toast("Waypoint "+idx+" added");

  if(S.curRoute&&S.genRoutes.length){
    // Route already exists → extend it to include this waypoint
    extendRouteViaWaypoint(lat,lng,short);
  }else{
    showWaypointSheet();
  }
}

// Extend existing route: find nearest insertion point on current polyline,
// detour via the new waypoint and come back to the same insertion point,
// then continue to the end. This preserves the original route geometry.
function extendRouteViaWaypoint(lat,lng,label){
  if(!S.curRoute||!S.startLL)return;
  var coords=S.curRoute._coords;
  if(!coords||coords.length<2){toast("No route to extend");return}

  var newPt=L.latLng(lat,lng);

  // Find the nearest point on the existing route to branch off from
  var nearestIdx=0,nearestDist=Infinity;
  for(var i=0;i<coords.length;i++){
    var d=newPt.distanceTo(L.latLng(coords[i][0],coords[i][1]));
    if(d<nearestDist){nearestDist=d;nearestIdx=i}
  }

  var insertLL=L.latLng(coords[nearestIdx][0],coords[nearestIdx][1]);

  // Only route the small detour: insertionPoint → waypoint → insertionPoint
  // Then splice it into the existing coords array. The main route is untouched.
  osrm([insertLL,newPt,insertLL]).then(function(detour){
    if(!detour){toast("Could not reach waypoint from route");return}

    // Splice: original[0..nearestIdx] + detour coords + original[nearestIdx..end]
    var detourCoords=detour.geometry.coordinates.map(function(c){return[c[1],c[0]]});

    // Build the spliced full polyline
    var before=coords.slice(0,nearestIdx+1);    // up to and including insertion point
    var after=coords.slice(nearestIdx);           // from insertion point to end (original)
    var spliced=before.concat(detourCoords.slice(1,detourCoords.length-1)).concat(after);

    // Recompute cumulative distances for the spliced line
    var cumDist=[0];
    for(var i=1;i<spliced.length;i++){
      cumDist.push(cumDist[i-1]+L.latLng(spliced[i-1][0],spliced[i-1][1]).distanceTo(L.latLng(spliced[i][0],spliced[i][1])));
    }
    var totalDist=cumDist[cumDist.length-1]/1000;

    // Merge detour steps into existing steps at the right position
    var detourSteps=detour.legs?detour.legs.reduce(function(a,l){return a.concat(l.steps||[])},[]):[];
    var existingSteps=S.curRoute.steps||[];
    // Insert detour steps after the step closest to nearestIdx
    var stepsBefore=existingSteps.slice(0, Math.min(Math.floor(nearestIdx/Math.max(coords.length/existingSteps.length,1))+1, existingSteps.length));
    var stepsAfter=existingSteps.slice(stepsBefore.length);
    var newSteps=stepsBefore.concat(detourSteps).concat(stepsAfter);

    var newRd={
      distance:totalDist,
      duration:S.curRoute.duration+(detour.duration/60),
      steps:newSteps,
      geometry:{type:"LineString",coordinates:spliced.map(function(c){return[c[1],c[0]]})},
      _coords:spliced,
      _cumDist:cumDist
    };

    S.genRoutes[S.genIdx]=newRd;
    // Manually update drawRoute's internal state without full redraw losing the spliced coords
    S.curRoute=newRd;
    S.curRoute._coords=spliced;
    S.curRoute._cumDist=cumDist;

    // Redraw just the polyline, don't regenerate
    if(rLy)map.removeLayer(rLy);if(gLy)map.removeLayer(gLy);
    gLy=L.polyline(spliced,{color:"#0a1428",weight:10,opacity:0.6,lineCap:"round",lineJoin:"round"}).addTo(map);
    var totalD=cumDist[cumDist.length-1];
    var segGroup=L.layerGroup().addTo(map);
    var segSize=Math.max(4,Math.floor(spliced.length/40));
    for(var si=0;si<spliced.length-1;si+=segSize){
      var ei=Math.min(si+segSize+1,spliced.length);
      var seg=spliced.slice(si,ei);if(seg.length<2)continue;
      var frac=totalD>0?cumDist[si]/totalD:0;
      var r2=Math.round(34+(77-34)*frac),g2=Math.round(216+(158-216)*frac),b2=Math.round(158+(255-158)*frac);
      L.polyline(seg,{color:"rgb("+r2+","+g2+","+b2+")",weight:5,opacity:0.95,lineCap:"round",lineJoin:"round"}).addTo(segGroup);
    }
    rLy=segGroup;
    map.fitBounds(L.latLngBounds(spliced),{padding:[50,50]});
    showResult();
    toast("Waypoint added — "+Math.round(detour.duration/60)+" min detour");
  });
}

function removeWaypoint(idx){
  var wp=S.waypoints[idx];if(!wp)return;
  map.removeLayer(wp.marker);
  S.waypoints.splice(idx,1);
  S.waypoints.forEach(function(w,i){
    map.removeLayer(w.marker);
    w.marker=L.marker([w.lat,w.lng],{icon:mkWaypointIcon(i+1),zIndexOffset:900}).addTo(map)
              .bindPopup("Waypoint "+(i+1)+": "+w.label);
  });
  toast("Waypoint removed");
  if(S.curRoute)showResult();
  else if(S.waypoints.length)showWaypointSheet();
  else showWelcome();
}

function clearWaypoints(){
  S.waypoints.forEach(function(w){if(w.marker)map.removeLayer(w.marker)});
  S.waypoints=[];
}

function showWaypointSheet(){
  if(!S.waypoints.length){showWelcome();return}
  var h='<h3>📍 Waypoints <span class="pill pill-i">'+S.waypoints.length+'</span></h3>';
  h+='<p style="font-size:12px;color:var(--t2);margin-bottom:10px;line-height:1.5">Search above or tap the map to add more. All waypoints will be included in your loop.</p>';
  h+=renderWaypointList();
  h+='<div class="ar" style="margin-top:10px">';
  h+='<button class="btn ba" id="wp-gen">🚀 Build Loop Route</button>';
  h+='<button class="btn bs" id="wp-clr" style="flex:none;padding:12px 14px">✕</button>';
  h+='</div>';
  h+='<div class="wp-tap-hint">💡 Tap the map to add a waypoint</div>';
  $("sh").innerHTML=h;
  $("wp-gen").addEventListener("click",openW);
  $("wp-clr").addEventListener("click",function(){clearWaypoints();showWelcome()});
  document.querySelectorAll(".wp-del").forEach(function(btn){
    btn.addEventListener("click",function(e){e.stopPropagation();removeWaypoint(parseInt(btn.getAttribute("data-wi")))});
  });
}

function renderWaypointList(){
  if(!S.waypoints||!S.waypoints.length)return'';
  var h='<div class="stop-list">';
  S.waypoints.forEach(function(w,i){
    h+='<div class="stop-item">'+
      '<span class="stop-num wp-num">'+(i+1)+'</span>'+
      '<span class="stop-name">'+w.label+'</span>'+
      '<button class="stop-del wp-del" data-wi="'+i+'">✕</button>'+
    '</div>';
  });
  h+='</div>';
  return h;
}

// ─── Map tap → waypoint ───
// Works in two cases:
// 1. No route yet → tap adds a pre-route waypoint
// 2. "Add waypoint" panel is open (S.addingStop=true) → tap adds waypoint to existing route
map.on("click",function(e){
  if(S.addingStop){
    // Panel is open — add waypoint to existing route via tap
    S.addingStop=false;
    reverseGeocode(e.latlng.lat,e.latlng.lng,function(label){
      addWaypoint(e.latlng.lat,e.latlng.lng,label);
    });
    return;
  }
  // No route exists — tap adds a pre-route waypoint
  if(!S.curRoute&&!S.genRoutes.length){
    reverseGeocode(e.latlng.lat,e.latlng.lng,function(label){
      addWaypoint(e.latlng.lat,e.latlng.lng,label);
    });
  }
});

function reverseGeocode(lat,lng,cb){
  fetch("https://nominatim.openstreetmap.org/reverse?format=json&lat="+lat+"&lon="+lng)
  .then(function(r){return r.json()}).then(function(d){
    var label=d.display_name?d.display_name.split(",").slice(0,2).join(","):"Pin "+lat.toFixed(4)+","+lng.toFixed(4);
    cb(label);
  }).catch(function(){cb("Pin "+lat.toFixed(4)+","+lng.toFixed(4))});
}

// ─── Locate button ───
$("lbtn").addEventListener("click",function(){
  if(!navigator.geolocation){toast("Not supported");return}
  toast("Finding location...");
  navigator.geolocation.getCurrentPosition(function(p){
    S.userLL={lat:p.coords.latitude,lng:p.coords.longitude};
    S.startLL={lat:S.userLL.lat,lng:S.userLL.lng};
    map.setView([S.userLL.lat,S.userLL.lng],16);
    if(sMk)map.removeLayer(sMk);
    sMk=L.marker([S.startLL.lat,S.startLL.lng],{icon:iS}).addTo(map);
    toast("Location updated");
  },function(){toast("Location access denied")},{enableHighAccuracy:true,timeout:8000});
});

// ─── clr / clrAll ───
function clr(){
  [sMk,rLy,gLy,rCir,pMk,drvLy,rtStartMk,rtEndMk].forEach(function(l){if(l)map.removeLayer(l)});
  sMk=rLy=gLy=rCir=pMk=drvLy=rtStartMk=rtEndMk=null;
  if(poiLy){map.removeLayer(poiLy);poiLy=null}
  if(S.destMk){map.removeLayer(S.destMk);S.destMk=null}
  if(pinnedMarker){map.removeLayer(pinnedMarker);pinnedMarker=null}
  clearStopMarkers();
}
function clrAll(){clr();clearWaypoints();}

// ═══ STOP MARKERS (legacy — now waypoints handle rerouting) ═══
function clearStopMarkers(){S.stopMarkers.forEach(function(m){map.removeLayer(m)});S.stopMarkers=[]}

// renderStopUI — renamed: in result panel we show "+ Add Waypoint" not "Add a stop"
function renderStopUI(){
  // Waypoints are shown separately above; this section adds new waypoints post-generation
  var h='';
  // Show the "add waypoint" inline search
  h+='<div class="add-stop-bar'+(S.addingStop?" active":"")+'" id="add-stop-btn">➕ Add waypoint to route</div>';
  if(S.addingStop){
    h+='<div style="font-size:11px;color:var(--t3);padding:4px 2px 6px;display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:var(--i);display:inline-block;flex-shrink:0"></span>Tap anywhere on the map, or search below</div>';
    h+='<input type="text" class="stop-search" id="stop-sinp" placeholder="Search location..."/>';
    h+='<div class="stop-results" id="stop-results"></div>';
  }
  return h;
}

function bindStopEvents(){
  document.querySelectorAll(".wp-del").forEach(function(btn){
    btn.addEventListener("click",function(e){e.stopPropagation();removeWaypoint(parseInt(btn.getAttribute("data-wi")))});
  });
  var addBtn=$("add-stop-btn");
  if(addBtn)addBtn.addEventListener("click",function(){
    S.addingStop=!S.addingStop;showResult();
    if(S.addingStop)toast("Search a location to add it to your route");
  });
  var sinp=$("stop-sinp");
  if(sinp){
    sinp.focus();
    var stTimer=null;
    sinp.addEventListener("input",function(){
      var q=this.value.trim();clearTimeout(stTimer);
      if(q.length<2){$("stop-results").innerHTML="";return}
      stTimer=setTimeout(function(){
        fetch("https://nominatim.openstreetmap.org/search?format=json&q="+encodeURIComponent(q)+" NSW Australia&limit=5")
        .then(function(r){return r.json()}).then(function(results){
          var box=$("stop-results");
          if(!results.length){box.innerHTML='<div class="ac-item"><span class="ac-icon">❌</span><span class="ac-text">No results</span></div>';return}
          box.innerHTML="";
          results.forEach(function(r){
            var d=document.createElement("div");d.className="ac-item";
            var short=r.display_name.split(",").slice(0,3).join(",");
            d.innerHTML='<span class="ac-icon">📍</span><span class="ac-text">'+short+'</span>';
            d.addEventListener("click",function(){
              S.addingStop=false;
              addWaypoint(parseFloat(r.lat),parseFloat(r.lon),short);
            });
            box.appendChild(d);
          });
        }).catch(function(){});
      },280);
    });
    sinp.addEventListener("keypress",function(e){
      if(e.key==="Enter"){
        var q=this.value.trim();if(!q)return;
        fetch("https://nominatim.openstreetmap.org/search?format=json&q="+encodeURIComponent(q)+" NSW Australia&limit=1")
        .then(function(r){return r.json()}).then(function(d){
          if(!d.length){toast("Not found");return}
          S.addingStop=false;
          addWaypoint(parseFloat(d[0].lat),parseFloat(d[0].lon),d[0].display_name.split(",").slice(0,2).join(","));
        });
      }
    });
  }
}

$("sh").innerHTML='<h3>elearn.sio</h3><p style="font-size:13px;color:var(--t2);margin-bottom:12px;line-height:1.5">Getting your location...</p>';
