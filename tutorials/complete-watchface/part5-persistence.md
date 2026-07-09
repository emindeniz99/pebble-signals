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
store instead (`Store` in `runtime/signals`): records live as BYTES outside
the object heap and `save()`/`load()` round-trip them through localStorage.
That is the shipped, device-verified `list` example: its rows persist across
launches, and the store is the same trick that keeps an unbounded list on a
32KB arena (only the visible window ever becomes JS objects).

Two measured constraints the store already handles for you, worth knowing
when you roll your own strings:

- values have a **255-byte per-string cap** on this port;
- building one giant string via a whole-blob `String.fromCharCode.apply`
  aborts the machine — chunk big payloads (the store slices at 128B).

## `device.keyValue` — the host's other API

The host also exposes `device.keyValue.open({path})` (per-app namespaced,
the Moddable storage API — files-style, typed values). It is the right
surface for bigger structured persistence, but this repo has NOT
device-verified it yet — the roadmap tracks that probe. Until then the
tutorial teaches what has receipts: `localStorage` for small state, the
byte store for records.

## Wire it to part 4

The config example's `onReadable` is the natural persistence point: apply
the parsed settings to signals, then `setItem` the raw string. At boot, read
it back before `render()` so the face starts in the user's colors — no
flash of defaults.

Next: [Part 6 — package & install](part6-package.md).
