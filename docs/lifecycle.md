# App lifecycle — from power-on to kill

Where every piece lives and when it runs, for a signal-piu app on Pebble
(Moddable XS + Alloy/Piu, SDK 4.17). Two memories matter throughout:
**flash** (256KB resource area + the mod archive — cheap, persistent, ROM)
and the **32KB JS heap** (the "arena" — the scarce one).

## Build time (on your machine, `./build.sh`)
1. **tsc** compiles `src/tsx/**` → `src/embeddedjs/app/**.js` (JSX → `jsx()`
   calls; types erased, `noCheck`).
2. **esbuild --bundle** stitches the chosen entry + its local `./imports` into
   ONE `app/main.js`; `runtime/*` is left **external** (so it stays a separate
   preloaded module, not pulled into main). ← this is what makes multi-file
   apps work.
3. **lower.mts** rewrites `useState`/`signal`/`computed` in `main.js` to the
   packed `S.*` integer API (or bails to the object API where unsafe).
4. **esbuild --minify** shrinks `main.js`.
5. **pebble build** (Moddable `mcconfig`) reads `manifest.json`:
   - modules in **`preload`** (`runtime/signals`, `runtime/jsx-runtime`,
     `runtime/flow`) have their top-level bodies **run at build time** and the
     resulting slots **frozen into flash/ROM** — ~zero heap at runtime.
   - `main` is NOT preloaded — it ships as bytecode in the archive.
   - the C shim `src/c/mdbl.c` compiles into the firmware app; `assets/*` and
     any `*.pdc` become entries in the 256KB resource area.
   Output: `signal-piu.pbw` (the mod archive `mc.xsa` + resources + C app).

## Install / boot (on the watch)
6. `pebble install` writes the `.pbw` to flash.
7. On launch, `mdbl.c`'s `main()` creates the window and the **XS machine**
   (32KB static heap, cloned from the firmware's built-in creation config —
   only the instrumentation `.flags` take effect; see the file's measured
   notes).
8. The Pebble host maps the archive out of SPI flash and, via an
   **`ArchiveCompartment`**, calls `import("main")`. Preloaded runtime modules
   are already resident (ROM, from step 5); `main`'s bytecode is linked and its
   top-level body **loads into the 32KB heap now**.
9. `main`'s body runs: constructs `Skin`/`Style` (Piu globals from the Alloy
   host), then calls **`render(build, dict)`** → `new Application` (screen
   sized here → `screen.width/height`), runs `build()` under a root owner to
   create real **Piu nodes**, and reactive props become **effect bindings**.

## Running (steady state)
10. Piu retains the scene graph and drives the display. The watch's event loop
    delivers **button** events to the focused content's behavior (our
    `HandlerBehavior`), and **timers** (`setInterval`) fire.
11. A handler calls a setter → the packed signal's value changes → `flush`
    walks the subscriber **bitmask** and re-runs each subscribed effect → each
    effect writes ONE Piu property (`label.string = …`). No re-render, no VDOM,
    no diff. Heap stays flat (the whole point).
12. `Show`/`For`/`VirtualList`/`Navigator` mutate tree shape by disposing an
    owner subtree (its effects + nodes die, heap returns to floor) and building
    the next — the only place transient allocation spikes.

## Kill
13. When the app exits (back out, watchface change, crash), the firmware tears
    down the whole XS machine — the entire 32KB heap is reclaimed at once.
    There is no partial GC to rely on between apps; each app boots fresh.
    (An OOM mid-run is `fxAbort` "memory full" — the app dies and the watch
    returns to its face.)

## The one-line mental model
Runtime code + preloaded modules live in **flash/ROM (cheap)**; only `main`'s
own app code and the live node/effect graph live in the **32KB heap (scarce)**.
Every design decision in this repo is about keeping step 8–12 inside 32KB.
