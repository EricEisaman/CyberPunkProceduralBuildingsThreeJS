# NEON//DISTRICT: design brainstorm

Three procedural cyberpunk buildings. Each one stands alone on a wet street at
night, so the detail is seen from close up, not lost in a skyline. Everything is
generated in code from a seed. There are no downloaded models or textures:
geometry, materials, signs and lettering are all procedural.

## The three buildings

| | HIVE | ARCOLOGY | CAPSULE |
| --- | --- | --- | --- |
| Inspired by | Kowloon Walled City, Hong Kong tenements | Megacorp HQ towers (Blade Runner, GITS) | Metabolist capsule towers on a night-market podium |
| Silhouette | Dense, lumpy block; every bay cantilevers differently | Tall, clean, chamfered tower with setbacks and a crown | Two concrete cores with pods plugged in at random |
| Feel | Lived-in, illegal additions, clutter | Cold, corporate, screens and light lines | Retro-future, porthole pods, street food below |
| Hero signs | Stacked vertical blade signs over the street | Giant animated LED screens, rooftop logo halo | 3D neon tube lettering, lantern strings, podium marquee |

## Element catalogue

### Structure
- Floor slabs with stained slab edges, stepped parapets, corner piers
- Cantilevered "illegal" room boxes per bay (HIVE)
- Chamfered (octagonal) floor plates, setbacks, vertical fins (ARCOLOGY)
- Concrete service cores with stair slits, bridges between cores (CAPSULE)
- Rounded capsule pods with bolted brackets and porthole windows (CAPSULE)

### Facade
- Windows with frames, mullions and sills
- **Interior-mapped rooms** behind every window: a parallax room (back wall, side walls,
  floor, ceiling) plus furniture/person silhouettes, blinds, curtains, TV flicker.
  Light colours: tungsten, fluorescent, magenta/cyan LED, many dark
- Window security cages and grilles, louvred vents
- Procedural grime: rain streaks under ledges, tile/panel seams, rust, roughness variation
- Wet sheen on up-facing surfaces when it rains

### Services and clutter
- AC condensers on brackets (fan grille, coil fins, drip pipe)
- Vertical drainpipes and conduits with brackets and elbows
- Sagging cable bundles (catenaries) across facades and over the street
- Junction boxes, electric meters
- Laundry poles with clothes, potted plants
- Rooftop water tanks on legs, HVAC boxes, exhaust fans, ladders
- Satellite dishes, antenna forests, aircraft-warning beacons (blinking)
- Fire-escape stairs and railings

### Signs and light
- **Neon tube lettering**: real 3D tubes from a hand-made single-stroke font, with
  back-plate, standoffs and flicker
- Vertical blade signs with kanji/katakana (lightbox and neon-on-dark styles)
- Lightbox shop signs, menu boards
- Scrolling LED tickers (animated shader)
- Giant animated advertising screens (scanlines, glitch, scrolling copy)
- Rooftop billboards on steel scaffolds
- Neon edge strips and chasing LED lines on fins
- Holographic rotating logo (ARCOLOGY)
- Light spill: coloured glow on the wall around each big sign, plus a few real
  point lights so signs light the facade and street
- Lantern strings (CAPSULE night market)

### Street
- Wet asphalt with **planar reflections** (blurred, streaky), puddles, rain ripples
- Paved sidewalk with tiles and curb, lane markings, zebra crossing
- Shopfronts: glass, roll-up shutters, awnings, vending machines
- Street lamps, bollards, utility pole with transformer, manholes with steam

### Atmosphere and camera
- Rain (ported from the RainSystemThreeJS streaks), height fog, steam vents
- Sky dome with light-pollution glow, background city of lit towers
- Bloom, ambient occlusion, film grade (vignette, chromatic aberration, grain)
- Camera shots: Hero, Street, Worm's-eye, Aerial, Detail; auto-orbit
- Neon palettes: Kabukicho (pink/cyan), Toxic (green/magenta), Amber (orange/teal), Vapor (violet/blue)
