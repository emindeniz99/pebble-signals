// timeprobe — device receipt for the opt-in `runtime/hosttime` module (the host
// `time` + `timer` modules, both named in build/devices/pebble/manifest.json's
// `modules` AND `preload`). Five rows, each a live fact the source alone cannot
// prove:
//   ticks: the boot reading of `Time.ticks`. A plain number here means
//          importNow("time") resolved through the mod compartment's loadNowHook
//          — the whole binding stands on that.
//   up:    elapsed(t0) recomputed on every fire. It must only ever GROW; a
//          negative or frozen value would say Time.delta is not what the source
//          claims.
//   fires: the fire count and the MEASURED gap between fires. This is the row
//          that matters: the timer starts at 1000 ms and reschedule()s ITSELF to
//          250 ms on the 3rd fire, so a gap that drops 1000 -> 250 without the
//          timer being destroyed is `Timer.schedule` re-aiming a live record in
//          place — the one operation setInterval/clearInterval cannot do.
//   mode:  which interval is armed, or "paused".
// UP pauses / resumes (`Timer.schedule` with no delay, then a reschedule) — the
// second host-only operation, driven by hand so a screenshot can catch both
// states.
// Buttons only (QEMU touch crashes the firmware — README gotcha 2).
// Build: APP=timeprobe node build.mts — no TREESHAKE_FORCE needed: the importNow
// literals live inside the runtime module, not this entry, so the closure scan
// never sees an unresolvable dynamic import.
import { elapsed, ticks, useHostTimer } from "runtime/hosttime";
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "18px Gothic", color: "white" });
const title = new Style({ font: "bold 24px Gothic", color: "#22cc55" });

// Read ONCE at boot, before render: the reference point every "up" row measures
// from, and itself the receipt that the host `time` module resolved.
const boot = ticks();

const [up, setUp] = useState(0);
const [fires, setFires] = useState(0);
const [gap, setGap] = useState(0);
const [mode, setMode] = useState("1000ms");

const App = () => {
	// Timer state lives in this call's closure — `last` is the previous fire's
	// tick reading, so `gap` is a MEASURED interval and not the one we asked for.
	let last = boot;
	let n = 0;
	let paused = false;
	// The hook is called inside the component (Rule 5) so the render root owns
	// the host timer and a teardown cancels it.
	const t = useHostTimer(() => {
		n++;
		setGap(elapsed(last));
		last = ticks();
		setUp(elapsed(boot));
		setFires(n);
		// On the 3rd fire, re-aim the SAME host record at 250 ms. No clear, no
		// re-create — if the gap row follows, reschedule() is device-proven.
		if (n === 3) {
			t.reschedule(250);
			setMode("250ms (rescheduled)");
		}
	}, 1000);
	return (
		<Container
			left={0}
			right={0}
			top={0}
			bottom={0}
			focus={true}
			onPressUp={() => {
				paused = !paused;
				if (paused) {
					t.pause(); // schedule() with NO delay — the timer survives
					setMode("paused");
				} else {
					t.reschedule(250); // resume the very same record
					setMode("250ms (resumed)");
				}
			}}
		>
			<Column>
				<Label style={title} string="timeprobe" />
				<Label string={"ticks: " + boot} />
				<Label string={() => "up: " + up() + "ms"} />
				<Label string={() => "fires: " + fires() + " gap " + gap()} />
				<Label string={() => mode()} />
			</Column>
		</Container>
	);
};

render(() => <App />, { skin: bg, style: base });
