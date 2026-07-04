# Memory map — every place a byte can live, and what belongs where

The companion to [`xs-heap-playbook.md`](xs-heap-playbook.md): the playbook
is the *shrinking manual* for the 32KB XS arena; this file is the *map* —
which memory spaces exist on a Moddable Pebble, what each is good for, which
signal-piu feature uses which, and where a given kind of data SHOULD live.
All sizes are measured on gabbro/SDK 4.17 (see the playbook's partition
table for the receipts) unless marked firmware/est.

## The map

```
WATCH ──────────────────────────────────────────────────────────────────┐
│                                                                       │
│  RAM (volatile)                       FLASH (persistent / ROM)        │
│  ┌─────────────────────────┐          ┌────────────────────────────┐  │
│  │ XS arena  32,768 B      │          │ mod archive (mc.xsa)       │  │
│  │  ├ slot heap ~8,176 B*  │◄─loads───│  main.js bytecode + all    │  │
│  │  ├ chunk heap 8,192 B*  │   boot   │  preloaded modules (frozen)│  │
│  │  └ stack 6,144 B        │          │  symbols intern AT BOOT    │  │
│  │  (firmware-fixed; the   │          ├────────────────────────────┤  │
│  │   scarce resource)      │          │ resource area  256 KB RO   │  │
│  ├─────────────────────────┤          │  Resource() views IN PLACE │  │
│  │ native app heap ~122 KB │          │  — zero arena copy         │  │
│  │  Piu native structs,    │          ├────────────────────────────┤  │
│  │  the C side of every    │          │ persist KV (persist_*)     │  │
│  │  Content/Label/Skin     │          │  shared app ↔ worker       │  │
│  ├─────────────────────────┤          └────────────────────────────┘  │
│  │ worker pool 10.5 KB     │                                          │
│  │  C only — NO XS machine │                                          │
│  └─────────────────────────┘                                          │
└───────────────────────────────────────────────────────────────────────┘
          ▲
          │ AppMessage / bluetooth
          ▼
PHONE ──────────────────────────────────────────────────────────────────┐
│  PKJS sandbox: fetch, XMLHttpRequest, localStorage, geolocation —     │
│  effectively unlimited RAM/storage from the watch's point of view     │
└───────────────────────────────────────────────────────────────────────┘

* initial sizes; slot and chunk grow into each other within the 32KB arena.
```

## The spaces, one by one

| Space | Size | What it is | What it's good for | Failure mode |
|---|---|---|---|---|
| **XS slot heap** | ~8,176 B initial (grows in arena) | 16 B slots: every JS object, closure, array header, module record, export | Live program state you cannot avoid: signal cores, effect closures, JSX wrappers | `fxAbort` boot death — THE limit that kills apps (#29) |
| **XS chunk heap** | 8,192 B initial (grows in arena) | Variable-size blocks, GC-compacted: TypedArray contents, string chars | Bulk data at 1 byte/byte — ByteStore, packed-core tables, bitmasks | Arena pressure (shares the 32KB with slots) |
| **XS stack** | 6,144 B fixed | JS call stack | — | Deep recursion (keep trees shallow) |
| **Mod archive (flash ROM)** | no byte ceiling — costs boot SLOTS (every symbol interns at map time; every module = records + 2 ids) + CHUNK (bytecode) | The `.xsa`: main.js bytecode + preloaded (frozen) modules | Code + frozen constants that never mutate | At a saturated class +1 symbol or +1 module = silent boot death (playbook "The boot floor") |
| **Resource area (flash RO)** | 256 KB | Read-only files bundled via manifest resources | Big static data: fonts, images, tables — `Resource()` maps it with ZERO arena copy | Read-only; 256 KB total |
| **Native app heap** | ~122 KB | The C heap (the `Heap Usage … <122600B>` log) | Piu's native halves of every content/skin/style live here for free (from the arena's view) | Not ours to allocate from JS directly |
| **Worker pool** | 10.5 KB | Separate background-worker RAM | C-only logic that outlives the app | NO XS machine (compile-error receipt) and no resource access |
| **Persist KV** | cap unmeasured — probe before relying | `persist_*` key-value flash, shared app ↔ worker | Small durable state: settings, counters, last-known values | Rule 2: don't assume the classic 4 KB cap without measuring |
| **PKJS localStorage** | cap unmeasured | Phone-side string KV | Overflow shelf for strings (memory ladder step 3) | Round-trip latency; needs the phone |
| **Phone (PKJS)** | effectively unlimited | fetch/XHR/localStorage/geolocation in the phone sandbox | Everything heavy: network, parsing big JSON, caching | Only reachable via AppMessage; async |

## Which signal-piu feature uses which space

| Feature | Slot heap | Chunk heap | Mod archive | Resources | Native heap | Persist/phone |
|---|---|---|---|---|---|---|
| **signals packed core** | ~0/signal (index-based) | state + bitmask tables | core code | | | |
| **effects / JSX thunks** | the one unavoidable cost (closures) | | | | | |
| **ByteStore** | handful (the view objects) | ALL payload bytes | | | | |
| **JSX render / hosts** | thin JS wrapper per node | | jsx-runtime code | | native struct per Content/Label (the *second ledger*) | |
| **Export pruning (#29 fix)** | fewer boot slots | | −36% archive on clock | | | |
| **PRELOAD_PURE (v1, OFF — dead end)** | ADDS boot slots (module records + interned symbols; v1.5 matrix) | | +1 module in the archive | | | |
| **importNow lazy screens (#27)** | saves ARENA bytecode only — archive symbols still intern at boot | | screen modules still cost records + symbols at map time | | | |
| **`Resource()` data** | | | | payload mapped in place | | |
| **createResource + PKJS** | tiny state machine | | | | | fetch/parse on the phone |
| **Background worker example** | | | | | | C heartbeat + persist KV shared with app |

## What belongs where — the decision table

| You have… | Put it in… | Not in… | Why |
|---|---|---|---|
| Mutable app state (counters, flags) | Signals (slot heap) | Plain object graphs | Packed core makes a signal an integer index |
| Bulk mutable bytes (lists, buffers) | ByteStore / TypedArray (chunk) | Arrays of objects/strings | 1 byte costs 1 byte; objects cost 16 B/slot ×N |
| Static tables, big constants | Flash **resources** via `Resource()` | main.js or preloaded modules | Resources map in place: zero arena, zero boot symbols; archive data costs chunk and archive structure costs boot slots |
| Code every screen needs (runtime, nav) | Mod archive, preloaded + pruned | — | Frozen code; export pruning keeps only what the app imports |
| Code for rarely-visited screens | Separate non-preloaded modules via `importNow` (#27) | main.js | Bytecode loads on first push, not at boot — but the module's SYMBOLS still intern at boot (playbook "The boot floor"), so this needs slot headroom |
| Derived values | Recompute (plain function) | `computed` | CPU is free, RAM is not — `computed` caches, i.e. spends RAM to save CPU |
| Strings for display | Derive on read / bytes in chunk | Stored JS strings | Strings cost slot + chunk; derive at render |
| Durable small state | Persist KV | XS arena (lost on exit) | Survives restarts; shared with the worker |
| Network, JSON parsing, caching | The **phone** (PKJS + createResource) | The watch | Phone RAM is unlimited; ship only the reduced answer over AppMessage |
| Background periodic work | Worker (C) + persist KV | Keeping the app alive | 10.5 KB pool, survives app exit; no JS there — keep it dumb, let the app render |

## The two ledgers (don't optimize the wrong one)

Every rendered node is billed TWICE: a thin JS wrapper in the **XS slot
heap** (ours to shrink — recycle nodes, VirtualList) and a native struct in
the **~122 KB native heap** (Piu's, roomy today, but unmeasured per node —
the roadmap's "Piu native node halves" task is the Rule-2 pass over that
second ledger). When a screen dies at boot it is almost always ledger one
(slots — including the boot symbol/module costs) — check those before
suspecting Piu.
