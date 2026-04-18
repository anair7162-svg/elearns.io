# eLearns.io — Premium UI refresh

NSW Learner & Provisional Route Builder. GPS-tracked practice drives,
wizard-built loop routes, and a 120-hour logbook.

## Contents

```
elearns-io/
├── index.html          ← Entry point
├── manifest.json       ← PWA manifest
├── css/
│   └── styles.css      ← All styling, animations, theme variables
└── js/
    ├── icons.js        ← Inline SVG icon library (loads first)
    ├── config.js       ← toast(), $(), Supabase endpoints
    ├── state.js        ← S object, bottom nav, tab routing
    ├── auth.js         ← Sign-in / sign-up / session restore
    ├── theme.js        ← Dark/light toggle, weather rendering
    ├── search.js       ← Nominatim autocomplete, waypoints
    ├── wizard.js       ← Route-builder wizard
    ├── routes.js       ← Route generation, POI landmarks, result sheet
    ├── nav.js          ← Turn-by-turn navigation, GPS tracking
    └── data.js         ← Logbook, routes list, profile, modals
```

## Running locally

No build step. Serve the folder with any static file server and
open `index.html`.

```
# Python (if installed)
python3 -m http.server 8000

# Node (if installed)
npx serve .
```

Then open http://localhost:8000. The app needs a web server rather
than `file://` for geolocation and the Leaflet/tile CDN calls to work.

## Script load order

`index.html` loads scripts in dependency order. Do not reorder them.

```
leaflet → icons → config → state → auth → theme →
search → wizard → routes → nav → data
```

`icons.js` must come before the others because several modules call
`icn(name)` to generate SVG markup.

## What changed in this refresh

Behavioural:
  • Distance (km) field in the log-drive modal, auto-filled from
    the GPS-tracked drive distance and editable in the logbook.
  • POI landmarks show a persistent "Loading landmarks — this can
    take 10-20 seconds" toast during Overpass API calls.
  • Guest sign-in flow now takes you back to the tab you were trying
    to open, so the Logbook refreshes automatically after login.
  • All emojis/Unicode glyphs replaced with inline SVG icons.

Visual:
  • Inter typeface, tightened heading letter-spacing.
  • Layered shadow scale (--sh-xs through --sh-xl).
  • Spring + ease-out motion curves.
  • Page transitions, staggered list reveals, card hover lifts,
    button press feedback, input focus glow rings.
  • Glassmorphism on the bottom nav, search bar, map sheet, and
    banners.
  • Original teal / green palette preserved. L / P1 / P2 licence
    themes all cascade through the new styles.

## Brand palette (unchanged)

  --acc  #22d89e   (teal green — primary)
  --acc2 #1bc98f
  --w    #f0a040   (amber — warning)
  --d    #f05050   (red — danger)
  --i    #4d9eff   (blue — info)
  --p    #9d7aff   (purple — accent)

  L theme:  #e6b800 (yellow)
  P1 theme: #e84040 (red)
  P2 theme: #22d89e (keeps the teal default)
