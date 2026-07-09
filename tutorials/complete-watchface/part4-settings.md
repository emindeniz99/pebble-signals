# Part 4 — a settings page (the Clay flow)

Goal: a config page on the phone whose choices change the watchface — the
part every store-quality face has. Device-verified end to end: the `config`
example + `screenshots/config-roundtrip-gabbro.png` ("hi from config",
inverted colors — both settings applied through signals).

## How the pieces talk

```
[settings web page] --closes with a JSON fragment--> [pkjs, on the phone]
      --AppMessage key 10000--> [watch: pebble/message] --> signals --> UI
```

- **Phone side** (`src/pkjs/index.ts`): two listeners. `showConfiguration`
  opens your settings page URL; `webviewclosed` forwards the page's result
  string to the watch under ONE well-known key. This is exactly the surface
  [Clay](https://github.com/pebble-dev/clay) generates pages for — Clay
  slots in unchanged if you'd rather not hand-write HTML.
- **Watch side** (`src/tsx/examples/config.tsx`): `pebble/message` is
  preloaded in the Alloy host, so the import ships no code of its own:

  ```tsx
  const Message = (importNow("pebble/message") as MessageMod).default;
  new Message({
    keys: ["config"],            // first key -> code 10000, what pkjs sends
    onReadable(this: MessageChannel) {
      const s = JSON.parse(String(this.read().get("config") ?? "{}"));
      if (s.text !== undefined) setText(s.text);
      setInvert(!!s.invert);
    },
  });
  ```

  Settings land in signals, so they drive the UI like any other state —
  the example's `invert` flips skin AND style with one write.

## Testing without a phone (or a browser)

The emulator's phone side (pypkjs) implements the whole flow, and
`tools/config-drive.py` speaks its protocol directly:

```bash
APP=config node build.mts && pebble install --emulator gabbro
python3 tools/config-drive.py gabbro '{"text":"hi from config","invert":1}'
```

The driver triggers `showConfiguration`, catches the page URL your pkjs
opened, and answers as if the user pressed Save — CI-able, no webview.
(Leave pypkjs RUNNING for this — the opposite of the button-driver's
requirement.)

## Design notes that survive contact with the platform

- **One key, JSON payload.** Forwarding the raw result string under a single
  key keeps pkjs generic and puts the schema where it belongs — in your app.
  Add fields freely; old watch code ignores unknown ones.
- **Persist what you apply** — a config that resets on relaunch feels broken.
  That's part 5.

Next: [Part 5 — persistence](part5-persistence.md).
