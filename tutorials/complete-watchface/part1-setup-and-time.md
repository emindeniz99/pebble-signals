# Part 1 — setup & a ticking face

Goal: a running watchface on the emulator, and the shape every later part
builds on.

## Project setup

Inside this repo an "app" is one file: `src/tsx/examples/<name>.tsx`. Build
and run any of them with:

```bash
APP=watchface node build.mts        # build for gabbro + emery
pebble install --emulator gabbro    # boot it
```

(Consuming signal-piu as an npm package instead of working in-repo is covered
by `docs/packaging.md` — the tutorial stays in-repo for tight loops.)

## The face

The smallest complete watchface — module-scope state, one binding per line of
text (this is the shipped `watchface` example, trimmed):

```tsx
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const big = new Style({ font: "bold 42px Bitham", color: "white" });
const small = new Style({ font: "18px Gothic", color: "white" });

const two = (n: number) => (n < 10 ? "0" : "") + n;
const [hhmm, setHhmm] = useState("");
const [ss, setSs] = useState("");

function tick() {
  const d = new Date();
  setHhmm(two(d.getHours()) + ":" + two(d.getMinutes()));
  setSs(two(d.getSeconds()));
}
tick();
setInterval(tick, 1000);

render(() => (
  <Container left={0} right={0} top={0} bottom={0}>
    <Column>
      <Label style={big} string={() => hhmm()} />
      <Label style={small} string={() => ss()} />
    </Column>
  </Container>
), { skin: bg, style: small });
```

Two things make this a watchface and not a demo:

- **Same-value writes are free.** `setHhmm` runs every second but the value
  only CHANGES once a minute — the signal dedupes, so the big Label repaints
  60× less often than the seconds line. You get the classic "only redraw the
  layer that changed" watchface optimization without writing it.
- **Packaging as a real watchface** (launcher treats it as the active face)
  is one manifest flag — `watchapp.watchface: true` — covered in part 6; the
  `lazyauto` example ships that way and is device-verified.

Prefer no `render()` boilerplate at all? `export default` a `Component` and
the build generates it (the root-component entry, README "root component
entry"; the `rootapp` example).

## Verify like the repo does

```bash
node tools/device-smoke.mts --apps counter   # the runner's recipe on one app
```

Every part of this series ends on a device receipt, because the three boot
budgets (32KB arena, boot symbols, 384-slot value stack) only exist on the
firmware — green tests on the desktop prove the LIBRARY, not your face.

Next: [Part 2 — custom fonts](part2-custom-fonts.md).
