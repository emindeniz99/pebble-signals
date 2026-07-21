# Part 5 — persistence

Goal: settings and state that survive a relaunch (and a firmware reboot).

## The device-proven path: `localStorage` + the byte store

The host gives every mod a synchronous `localStorage` (backed by the
firmware's key-value storage, namespaced per app). For small state — a
settings object — use it directly:

```tsx
const s = JSON.parse(localStorage.getItem("cfg") ?? "{}");
const [invert, setInvert] = useState(!!s.invert);

function applyConfig(next: { invert?: number }) {
  setInvert(!!next.invert);
  localStorage.setItem("cfg", JSON.stringify(next)); // persist what you apply
}
```

For RECORD data — a todo list, log entries — go through the library's byte
store instead (`createStore` in `runtime/signals`): records live as BYTES outside
the object heap and `save()`/`load()` round-trip them through localStorage.
That is the shipped, device-verified `list` example: its rows persist across
launches, and the store is the same trick that keeps an unbounded list on a
32KB arena (only the visible window ever becomes JS objects).

Two measured constraints the store already handles for you, worth knowing
when you roll your own strings:

- values have a **255-byte per-string cap** on this port;
- building one giant string via a whole-blob `String.fromCharCode.apply`
  aborts the machine — chunk big payloads (the store slices at 128B).

## `device.keyValue` — the host's other API (also device-proven)

The host also exposes `device.keyValue.open({path})` — the Moddable storage
API, per-app namespaced, with typed values via `format`. Device-verified by
the `kvprobe` example (receipt `screenshots/kvprobe-gabbro.png`): it writes
a string and a persistent launch counter, and after a REINSTALL the watch
shows "kv works boot=2" — the data survived the relaunch:

```tsx
const kv = device.keyValue.open({ path: "probe" });
kv.format = "string";
kv.write("greet", "kv works");
const back = String(kv.read("greet"));   // reads back across launches
```

Note `read()` THROWS on a missing key (wrap the first read), and the store
speaks one `format` at a time. Pick by shape: `localStorage` for a settings
blob, the byte store for record lists, `keyValue` when you want typed keys
without JSON round-trips.

## Wire it to part 4

The config example's `onReadable` is the natural persistence point: apply
the parsed settings to signals, then `setItem` the raw string. At boot, read
it back before `render()` so the face starts in the user's colors — no
flash of defaults.

Next: [Part 6 — package & install](part6-package.md).
