# Garagem NFS Heat

A **desktop 3D garage** for building and customizing the vehicles extracted from
*Need for Speed Heat*: pick a car, swap parts one by one across the variants in
the customization catalogue, mount the wheels at the right size, paint it, and
look at the result in a rendered showroom — with a HUD styled after the game.
**Code only — no game data is included.** Bring your own legally obtained copy.

[Português](README.md) · **English**

> **Work paused.** Development of this project has stopped. What is here works
> and stays open: **anyone who wants to modify it may** — change the code, add
> parts, fix whatever looks wrong. No permission needed, no one to ask. The code
> is MIT.

---

## This repository ships no game files

There is only **code** here. No model, texture or part from Need for Speed Heat
comes with the repository — that material belongs to **Electronic Arts**. The
`.gitignore` blocks `*.obj`, `*.mtl`, `*.png`, `*.fbx` and `*.csv` precisely so
that a slip does not publish an asset.

No icon, font or interface texture was copied from the game: every icon is an
original SVG, every showroom surface is drawn on canvas, and the typography uses
**Bahnschrift**, which already ships with Windows.

This project has no affiliation with Electronic Arts or Criterion Games.

## What you need

- **Windows 10/11** with WebView2 (already included in Windows 11)
- **Python 3.11+** with `numpy`
- **`pywebview`** for the desktop window — `py -3.11 -m pip install -r requirements.txt`
- The **extracted library**: the folder with `_indice.csv` and the `car_*` folders,
  produced by the tools in the `nfs-heat-car-tools` repository

## How to open it

```
Garagem.bat
```

Or, if the library is not in `F:\CarsNfSHeat`:

```
Garagem.bat --acervo "D:\CarsNfSHeat"
```

Without `pywebview`, you can run it in the browser:

```
py -3.11 garagem.py --acervo "D:\CarsNfSHeat"
```

The library folder is resolved in this order: `--acervo` → environment variable
`NFSHEAT_ACERVO` → `%LOCALAPPDATA%\NFSHeatGaragem\config.json` → `F:\CarsNfSHeat`.

**With no library at all, the app still opens.** It does not refuse to start, and
it does not dump an error into a terminal that probably is not even open: it shows
a screen explaining that the models do not ship with the program, with a button to
the extraction tools and, in the desktop window, a **Choose folder…** that opens
the Windows picker. The server comes up in no-library mode, serves the page, and
answers **503** on any route that needs the files — 503 and not 404, because the
resource exists: what is missing is the folder.

The "Choose folder" button uses **no** `js_api` bridge (that one hung this window
once) and no write route on the server. The page navigates to `/escolher-pasta`
and the launcher, which owns the window, **reads** the URL and reacts — read-only,
one way.

## What you can do

| | |
|---|---|
| **168 vehicles** | picker with search by make, model and year |
| **13,834 parts** | swapped by slot, with a rendered thumbnail of each one |
| **Wheels** | rim and tire mounted from `_rodas_eixos.csv`, at the game's size |
| **Paint** | 16 colors, a custom color and 7 finishes, with procedural metallic flake |
| **Spec sheet** | power, torque, mass, redline, drivetrain and torque curve, read from the game's tuning EBX |
| **Showroom** | dark showroom, polished floor, cyan LED, softboxes on the ceiling |
| **Language** | Portuguese or English, chosen on first open and switchable in the footer |

Shortcuts: drag to rotate, wheel to zoom, `↑ ↓` changes category, `← →` changes
part, `R` recenters, `Esc` closes the picker.

## How it works inside

**The OBJ becomes binary on the server, not in the browser.** A 6.9 MB body is
converted in 0.16 s with numpy and comes out as 2.7 MB of buffer (`NFSG1`: a JSON
header plus positions, normals, UVs and indices). As text JSON it would be ~20 MB
plus the parse. The decoder on the browser side returns *views* over the
`ArrayBuffer`, copying nothing.

**Normals are computed during the conversion.** No OBJ in the library carries `vn` —
Heat stores the normal compressed in TangentSpace and the extraction never unpacked
it. Smoothing is done **per object, after the vertices are merged**, so the edge
between the hood and the body stays hard, which is right on a car.

**The paint is procedural.** Heat has no body-paint texture: it is color plus
finish, composed at run time. Checked across the whole library — there is not a
single `*carpaint*` file in any `textures/` folder.

**The thumbnails use a single offscreen renderer.** One per card would blow past the
WebGL context limit within seconds of scrolling. `IntersectionObserver` queues only
what is on screen and the queue runs serially, yielding the frame between one item
and the next.

**One parts folder serves several cars.** The 168 vehicles come out of 115 game
folders: convertible, roadster and special edition share body and parts.
`_mods_mapa.csv` says who uses what, and the inspector shows when a car is using
another car's part.

## Verify

```
py -3.11 -m nfsgaragem.verificar --acervo "D:\CarsNfSHeat" --tudo
```

Converts **all 168 bodies and all 13,834 parts** and writes a CSV with objects,
vertices, triangles, time and defects, plus the material histogram. It takes about
3 minutes. It is the check that proves the reader survives the real files, and not
just the three you test by hand.

On the last run: **14,171 files, 0 failures, 52 million triangles**, in 147 s. A
single stray group across the whole library — the `fenderfr_setf.obj` fender of the
240ZG, with a chunk 62.8 m away from the rest of the part — and 29 occurrences of
materials with no role assigned, all of them Maya scratch names (`lambert1`,
`blinn1`) or scenery props.

It was the sweep that found two bugs of my own: the fixed 5 m threshold for a stray
group was discarding the legitimate plate of a 24 m trailer (it became a threshold
relative to the part's size), and the British spelling `Aluminium` was missing from
the material table, which dumped 10 materials into the generic one.

## The spec sheet comes from the game

`ferramentas/extrair_ficha.ps1` reads the tuning EBX (`Vehicles/Tuning/...`) through the
same Frosty path that extracts the meshes, and writes `_ficha_tecnica.csv` into the
library. Run it once:

```
powershell -ExecutionPolicy Bypass -File ferramentas\extrair_ficha.ps1
```

Where each number comes from: `RaceVehicleChassisConfigData` (mass, wheelbase,
track width), `RaceVehicleEngineConfigData` (torque curve, redline) and
`RaceVehicleTransmissionConfigData` (gears, final drive, differential). Power is
derived from the curve — metric hp (cv), as `cv = N·m × rpm ÷ 7127`, stepping in
250 rpm increments up to the cut.

The curve is a list of 10 `Vec3` in Frostbite's format: `[0]` and `[1]` are the
rpm and N·m bounds, `[2..9]` are the normalized points.

**It checks out against the real world:** the M3 E46 comes out at 1,495 kg and a
2.736 m wheelbase; the real car has 1,495 kg and 2.731 m. The hp figures are the
game's, stock — in Heat the car starts detuned and climbs with performance parts.

There are **146 tuning folders for 168 cars**, with different spellings
(`car_nissan_180sx_typex_1996` against `car_nissan_180sxtypex_1996`) and variants
that inherit from the base car. Matching runs by rules, in order — exact name, no
underscore, no year, no edition suffix, the parts donor's spec sheet, common
prefix — and **each car records how it matched**, visible in the panel. Only one
name needed a hand-written alias, and it is commented.

Targa and convertible carry their own mass and no engine: in the game they use the
coupe's. The code borrows only the engine and keeps their mass.

Result: **163 of the 168 with an engine**. The five left out are the 2 helicopters,
the trailer, the truck — which have no engine configuration — and the 991 GT3, which
has no tuning folder in the game. For those, the spec sheet **says it has none**
instead of making one up.

One difference worth knowing: the physics track width (1,640 mm on the M3) does not
match the half-track width in `_rodas_eixos.csv` (740 mm, or 1,480 of track width).
They are different measurements — the first comes from the physics model, the second
was adjusted on the mesh so the wheel would land in the wheel arch. The panel shows
both, each with its own label.

## The wheel: the rim seats on the bead

The underlying mistake was in the premise, not in the arithmetic. The library's
`montar_rodas.py` scales the **rim** by the same factor as the **tire**, assuming
every rim was modeled against the same reference as the shared tire mesh. Measuring
the 166 cars, it was not: the rim's native radius ranges from **0.18 to 0.50 m**.

It showed up like this: on the Polestar 1 the native rim (0.3163) is the size of the
whole tire (0.3165), so the wheel came out as a smooth disc, with no tire; on the
trailer the rim mounted at 0.87 m on a 0.55 tire and simply went straight through
the rubber.

What holds for any car is that **the rim seats on the tire's bead**. So the rim is
scaled for its outer radius to land on the inner radius of the already-scaled tire,
with a 2% lip (`rodas.escala_do_aro`). Measured across the 166:

| | visible tire height |
|---|---|
| old rule (tire factor) | −317 to 131 mm, **2 cars with the rim going through** |
| rim on the bead | **65 to 126 mm, none outside the range** |

The M3, which was already right, goes from 72 to 75 mm — the fix does not break what
was working. The audit runs at any time:

```
py -3.11 -m nfsgaragem.verificar --rodas
```

## Three smaller things, from the same hunt

The wheel came out as a white disc floating in the wheel arch. Three causes, and
only the third was the one that fooled me:

1. **The default tire compound came from alphabetical order.** `pneus[0]` is
   `drift01`, not the `race01` that the reference build (`montar_rodas.py`) uses.
   And the tire chosen sets the scale of the **rim** as well — rim and tire get the
   same scale, taken from the tire, because they were modeled to match at native
   size. With the wrong tire, the rim came out 5.7% too wide.

2. **The tire was getting no texture at all.** It is a shared mesh and its
   textures live in `_texturas_rodas/tires/`, not in the car's folder, so the
   lookup by convention found nothing. Flat black with no relief, inside a dark
   wheel arch, simply disappears — and what is left is the chrome rim, which with a
   strong environment blows out to white.

3. **The ETag and the cache key were built in different places** and drifted
   apart: the ETag for `/api/pneu/` did not include the compound. Combined with
   `Cache-Control: private, max-age=3600`, the browser served the stale copy **for
   an hour without talking to the server** — I would fix the server and nothing
   changed on screen. Today `App.chave_de()` is the single function for both, and
   the binary goes out with `no-cache` (which means "store it, but ask before
   using it", not "do not store it"): over loopback revalidation costs nothing and
   the 304 avoids the download.

The tire's `_m` mask was left **out** on purpose: it packs
metal/smoothness/occlusion and Three.js reads `roughnessMap` from the green
channel, which in that format is smoothness — the inverse of what it expects.
Until the meaning of the channels is measured, better no map than the wrong map.

## The fourth cause: Three was throwing away `envMapIntensity`

The three above were real and none of them was the main one. The wheel stayed
wrong, and the cause was in the renderer. Three r166 does this every frame:

```js
if ( material.isMeshStandardMaterial && material.envMap === null
     && scene.environment !== null ) {
    m_uniforms.envMapIntensity.value = scene.environmentIntensity;   // 1.0
}
```

A material lit by `scene.environment`, with no `envMap` of its own, has its
`envMapIntensity` **replaced by 1.0**, with no error and no warning. And
`MeshPhysicalMaterial` is also `isMeshStandardMaterial`. The result: the five
values written in `materiais.mjs` — glass 1.6, paint 1.4, chrome 1.8, rim 0.6,
tire 0.12 — never reached the shader. The tire was running at **8× the intended
environment** and the rim at 1.7×, which is exactly a tire that is too light and a
blown-out rim reflecting the showroom's cyan LED and magenta wall.

Measured before concluding: zeroing the rim's `envMapIntensity` did not change
**a single byte** of the frame; `cena.environment = null` dropped the rim's
luminance from 131 to 8. That is, 97% of the rim's appearance came from an
intensity the code never chose.

The fix is to give the material its own `envMap` (`FabricaMateriais` takes the
scene and does `m.envMap = cena.environment`), which makes the condition fail and
hands control back to the file. After that **the numbers had to be recalibrated**,
because none of them had ever rendered: the tire's 0.12, once it actually took
effect, wiped out the rubber (average luminance 4.2, no tread and no sidewall).
Sweeping from 0.08 to 1.0, the value that gives dark but still legible rubber is
**0.85**.

Checked on 10 cars of different profiles (M3, 180SX, 240ZG, 911, Beetle,
Polestar, LaFerrari, Raptor, NSX and a bike): tire 28–32 luminance, rim 75–101,
none out of range, and **zero** materials without `envMap` in any of them.

`app.mjs` now runs `conferirAmbienteDosMateriais()` after each load: if any
material ends up without `envMap` while the scene has an environment, a warning
goes to the console instead of turning into a bug hunt months later.

### How to measure appearance without fooling yourself

Three traps, all of them mine, found in this very case:

- **`visible = false` on a `Light` turns the light off.** Three's `projectObject`
  skips invisible objects, lights included. Hiding the whole scene to isolate one
  mesh measures in the dark. Hide **only** `isMesh`/`isLine`/`isPoints`/`isSprite`.
- **The sentinel background leaks at the edge.** Antialiasing blends the
  silhouette pixel with the background and tints the average — a black tire
  reported "magenta". Render with **two different** backgrounds and count only the
  pixel that does not change between the two.
- **The average hides the change.** Swapping the normal map changed 83% of the
  rim's pixels by more than 30 levels, and the average barely moved, because the
  light redistributes without adding up or disappearing. Measure **per-pixel
  delta**, not the average.

## The window and `js_api`

The window opened grey, with "not responding", while the WebView2 behind it
rendered normally — the renderer kept piling up CPU and the pywebview shell sat
frozen at 0.8 s. The cause is the **`js_api`** bridge in `create_window`: its
handshake hangs the message loop on this combination of pywebview 6.2.1 with
WebView2 on Windows 11.

Since the page never calls `window.pywebview`, the bridge is gone. The `Ponte`
bridge class is still in the file, ready for when there is real use for it
(saving an image, picking a folder) — and then it has to come back by a path
that does not freeze, probably `webview.start(func)` exposing only what is
needed.

`Garagem.bat` falls back to the browser if the window does not come up.

## Language

On **first open** the app asks for the language, in Portuguese and in English — it
is the only screen that stays bilingual forever, because asking "which language?"
in a language the person may not read solves nothing. The choice lives in
`localStorage`, and the footer has a `PT / EN` switch to change it at any time,
without reloading.

The question comes **before** the library loads, on purpose: that way even the
progress messages come out in the chosen language, instead of flashing in
Portuguese and switching halfway.

All the text lives in `static/textos.mjs`, 143 keys with both columns side by
side — scattering translation across the modules is the sure way to leave one
Portuguese sentence on a screen nobody opens often. Plurals go in as functions,
not as placeholders: "1 opção"/"2 opções" changes the word, and solving that in
the screen code spreads grammar where it does not belong.

**The number separator is part of the translation.** The formatter was hardcoded
to `pt-BR`; in English `1.495 kg` reads as 1,495 — the car's mass wrong by a
factor of a thousand. It now comes from `Intl.NumberFormat` with the chosen
locale, and the document's `lang` follows, which is what makes a screen reader
pick the right voice.

The server stays **language-neutral**: it sends each category's `id` and the
front-end translates by key. A new category with no translation shows up with the
name the server sent, instead of disappearing from the rail.

## Known limits

- **The spec sheet is the stock one.** Heat raises power with performance parts,
  which are a separate system; swapping a body part changes no hp, neither here
  nor in the game.
- **No vinyls yet.** The 258 stock liveries and the 1,691 decals in the library
  are not applied; the car comes out in a solid color.
- **No saving a project.** The build lives in the session.
- Mirrored slots (fenders, mirrors, doors) are applied to both sides with the
  same variant; when one side has no equivalent part, it stays on the original.

## License

Code: **MIT** (see `LICENSE`). The license covers only the code in this
repository — none of the game material, which still belongs to Electronic Arts.

The Three.js bundled in `static/three/` is MIT, from the three.js project.
