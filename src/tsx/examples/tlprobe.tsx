// tlprobe — does the FIRMWARE's tween engine actually MOVE a Piu node on the
// watch, and could it stand in for runtime/anim? hostprobe's gabbro frame proved
// only presence (`typeof importNow("piu/Timeline") === "object"`); this drives it:
// one Label swept across the screen by a Timeline, plus a tick counter so a stale
// frame can't masquerade as a live one.
//
// What the SDK source forces (read BEFORE writing this, Rule 1):
//  * modules/piu/All/piuTimeline.js — `Timeline` is the DEFAULT export and
//    importNow hands back the NAMESPACE (hence `.default`, as config/devlog do).
//    `to(target, props, ms, easing, delay)` SNAPSHOTS `target[name]` as the FROM at
//    DECLARE time, so the target must already be MOUNTED — and there is NO ticker
//    anywhere in the module: `seekTo(ms)` is the only driver, so the frame loop is
//    ours to ship (the SDK's own examples/piu/timeline/main.js borrows Piu's
//    Content clock — `duration`/`time`/`start()` + an onTimeChanged Behavior,
//    piuContent.c:1073/1240/1491 — which our JSX surface does not expose).
//  * piuTimeline.c:50 — a tween IS `xsSet(target, id, number)`. For `x` that lands
//    in PiuContent_set_x (piuContent.c:1262), which is `moveBy(new - current)`, and
//    PiuContentMoveBy (:409-412) ZEROES dx unless horizontal is left-only or
//    left+width. A centered / left+right / width-only Label silently would not move
//    — hence the explicit left+width on the mover below.
//  * PiuCoordinate is int16 on Pebble (piu/Pebble/piuPlatform.h:23) and
//    xsToPiuCoordinate TRUNCATES, so the eased float lands as whole pixels; the
//    setter re-reads the current x on every write, so nothing accumulates drift.
//  * easing is invoked `easing.call(Math, fraction)` on a plain `(t) => t` — the
//    exact shape runtime/easing exports, so those curves are drop-in. Inlined here
//    (movebox.tsx's quadOut) to keep the probe dependency-free.
//
// VERDICT — replace the runtime/anim JS tween loop with piu/Timeline? NO as a
// replacement; worth it only as an opt-in extra. It is genuinely ZERO archive
// bytes (the mod compartment's loadNowHook maps the specifier straight through to
// firmware — build/devices/pebble/host/main.js:105-111), but bytes are not the
// gap. Timeline is a SEEK engine, not the hook contract: it owns no timer (we
// still ship the ~30fps interval below), it WRITES Piu properties instead of
// returning a `() => number` getter that feeds signals, it has no owner, no
// `.stop()`, nothing for `track()` to dispose, and `to`/`from` freeze both
// endpoints at declare time — a mid-flight retarget means building a NEW Timeline,
// where useTween re-aims in place from the current partial value. Arena cost is
// per-instance, not zero: Timeline + tweens array + Tween + properties array +
// a host-chunk TweenProperty is ~4 objects PER animated property, against
// useTween's one signal and one closure. And the target must be a mounted Piu node
// with movable coordinates, so it cannot animate the plain numbers our bindings
// consume. Where it WOULD earn its keep: an opt-in `runtime/timeline` wrapper for
// MULTI-TARGET staggered choreography — `when` plus a NEGATIVE `delay` buys
// overlap for free, the one thing useSequence cannot express across targets —
// driven by flow's existing ticker with a track()ed stop. Additive. runtime/anim
// stays as-is.
//
// Build: APP=tlprobe node build.mts — treeshake SELF-DISABLES here: build.mts's
// host-preload allowlist (:229) covers `pebble/` and `embedded:` but not `piu/`,
// so this literal reads as an unresolvable dynamic import and the full runtime
// ships. Harmless for a probe; a one-token widening if the pattern spreads.
import { render, screen } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";

// The firmware module's surface, narrowed to what this probe calls (the SDK's own
// typings/piu/Timeline.d.ts is the fuller declaration).
type PiuTimeline = {
	duration: number;
	to(
		target: object,
		props: object,
		ms: number,
		easing?: ((t: number) => number) | null,
		delay?: number,
	): PiuTimeline;
	seekTo(time: number): void;
};

const bg = new Skin({ fill: "black" });
const st = new Style({ font: "18px Gothic", color: "white", horizontal: "center" });
const mv = new Style({ font: "bold 24px Gothic", color: "white", horizontal: "center" });
const STEP = 33; // ~30fps — flow.ts/anim.ts's cadence; the memory-LCD flush rate is the limiter
const MW = 40; // mover width — wide enough for "TL" at bold 24px Gothic
const PAD = 16; // travel margin; safe on gabbro's circle because the mover rides the middle row

const [tick, setTick] = useState(0);
const [note, setNote] = useState("tl probe");
// Assigned once the mover is mounted; the tick binding reads its LIVE x so a
// single frame proves the tween is being applied, not just that a timer runs.
let mover: Content | null = null;

// top/bottom 40 keeps both captions inside gabbro's round bezel (qrprobe's
// receipt) and clear of the mover's middle row.
const app = render(() => (
	<Container left={0} right={0} top={0} bottom={0}>
		<Label left={0} right={0} top={40} height={22} style={st}
			string={() => `t${tick()} x=${mover ? mover.x : -1}`} />
		<Label left={0} right={0} bottom={40} height={22} style={st} string={() => note()} />
	</Container>
), { skin: bg, style: st });

try {
	const Timeline = (importNow("piu/Timeline") as { default: new () => PiuTimeline }).default;
	// Hand-built Piu node add()ed next to the JSX tree — coexist.tsx's proven
	// migration idiom, and the only way to hand Timeline a target it can write:
	// jsx-runtime rejects bind-time coordinate writes, and `<Move>` owns its own
	// moveBy effect, which would fight the tween for the same coordinate.
	const label = new Label(null, {
		left: PAD, top: (screen.height - 30) >> 1, width: MW, height: 30,
		style: mv, string: "TL",
	});
	app.add(label); // MUST precede the tween: `x` reads undefined until bound
	mover = label;
	const tl = new Timeline();
	tl.to(label, { x: screen.width - PAD - MW }, 1200, (t: number) => t * (2 - t), 0);
	// The build-time snapshot, on screen: `x0` NaN/0 would mean `to` read an
	// unmounted target, which fails silently (NaN -> xsToInteger -> 0) rather than
	// throwing. Showing it makes that failure legible instead of a puzzling frame.
	setNote(`x0=${label.x} d=${tl.duration}`);
	// Ping-pong the seek head so the sweep repeats without a jump-cut back to the
	// left edge. Timeline.seekTo already no-ops on an unchanged time, so the
	// one-tick dwell at each end costs nothing.
	let t = 0;
	let dir = 1;
	let timer: number | null = setInterval(() => {
		// A throw HERE would otherwise be an unhandled timer callback = fxAbort with
		// no on-watch explanation. Catch, name it in the caption, release the timer.
		try {
			t += dir * STEP;
			if (t >= tl.duration) {
				t = tl.duration;
				dir = -1;
			} else if (t <= 0) {
				t = 0;
				dir = 1;
			}
			tl.seekTo(t);
			setTick((k: number) => k + 1);
		} catch (e) {
			if (timer !== null) {
				clearInterval(timer);
				timer = null;
			}
			setNote("SEEK " + String((e as Error).message).slice(0, 16));
		}
	}, STEP);
} catch (e) {
	setNote("ERR " + String((e as Error).message).slice(0, 18));
}
