// ClockFace suite — runtime/clockface (opt-in analog clock composed over
// runtime/draw's Canvas). Proves: ClockFace returns a Port node; node.paint()
// rasterizes 12 hour ticks (at least one span each) plus hour + minute hand
// spans; the minute hand's spans DIFFER between minutes=0 (points up) and
// minutes=15 (points right) — encoding WHY the m/60·360 angle matters; omitting
// `seconds` draws no second hand; providing `seconds` (as a thunk AND as a bare
// number) draws one; every prop default resolves; and a reactive `minutes` thunk
// re-invalidates on signal change and the next paint shows the moved hand.
// StubPort (load-runtime) records the spans and simulates a Piu repaint via
// node.paint().
import { loadRuntime, makeChecker } from "./load-runtime.mts";

const { signals, loadModule } = await loadRuntime();
const { signal, createRoot } = signals;
const { ClockFace } = await loadModule("runtime/clockface");
const { check, done } = makeChecker("clockface");

// default colors (mirror the module's `??` fallbacks)
const TICKS = "#606060";
const HAND = "white";
const SECOND = "#e01818";
const spansOf = (node: any, color: string) => node.spans.filter((s: any) => s.color === color);

// --- defaults + reactive thunks for hours/minutes, NO seconds ---
{
	const h = signal(10);
	const m = signal(0);
	const [node] = createRoot(() => ClockFace({ hours: () => h.value, minutes: () => m.value }));
	check("ClockFace returns a node", node && typeof node.paint === "function");
	check("mount runs the Canvas effect once (invalidate)", node.invalidated === 1);
	node.paint();

	// dial background: default face "black" fills the whole square first.
	const bg = node.spans.find((s: any) => s.color === "black");
	check("dial background fills the face", bg && bg.w === 144 && bg.h === 144);

	// 12 hour ticks — each tick emits >= 1 span; assert all 12 drew (>=12 spans).
	check("12 hour ticks drawn (>=1 span each)", spansOf(node, TICKS).length >= 12);
	check("tick color defaults to #606060", spansOf(node, TICKS).length > 0);
	// the 12-o'clock tick (i=0) is a vertical span at x≈center (c=72, t=2 → x=71).
	const topTick = spansOf(node, TICKS).find((s: any) => s.x === 71 && s.w === 2);
	check("top tick is a vertical mark at center-x", !!topTick);

	// hour + minute hands share HAND color; both hands drew something.
	const handSpansM0 = spansOf(node, HAND);
	check("hour + minute hands drawn", handSpansM0.length >= 2);
	// minute hand at 0 min points straight UP → a vertical span reaching the top.
	check(
		"minute hand at 0 points up (vertical span above center)",
		handSpansM0.some((s: any) => s.w === 2 && s.y < 72),
	);

	// no seconds prop → NO second-hand span in the default second color.
	check("omitting seconds draws no second hand", spansOf(node, SECOND).length === 0);

	// reactive: bump minutes 0 → 15. The thunk read inside paint auto-tracks.
	const before = JSON.stringify(handSpansM0);
	m.value = 15;
	check("minutes change re-invalidates", node.invalidated === 2);
	node.paint();
	const handSpansM15 = spansOf(node, HAND);
	check(
		"minute-hand spans differ between minutes=0 and minutes=15",
		JSON.stringify(handSpansM15) !== before,
	);
	// at 15 min the minute hand points RIGHT → a horizontal span past center-x.
	check(
		"minute hand at 15 points right (span extends past center-x)",
		handSpansM15.some((s: any) => s.h === 2 && s.x + s.w > 72),
	);
	check("ticks still drawn after change", spansOf(node, TICKS).length >= 12);
}

// --- all props provided; bare-number hours/minutes; seconds as a THUNK ---
{
	const s = signal(45);
	const [node] = createRoot(() =>
		ClockFace({
			hours: 3,
			minutes: 20,
			seconds: () => s.value,
			size: 100,
			face: "#101010",
			hand: "#00ff00",
			second: "#ffcc00",
			ticks: "#333333",
		}),
	);
	node.paint();
	// custom face color + custom size fill the whole square.
	const bg = node.spans.find((s2: any) => s2.color === "#101010");
	check("custom face + size fill the square", bg && bg.w === 100 && bg.h === 100);
	check("custom tick color forwarded", spansOf(node, "#333333").length >= 12);
	check(
		"custom hand color forwarded (non-thunk hours/minutes)",
		spansOf(node, "#00ff00").length >= 2,
	);
	// seconds provided (as a thunk) → a second hand in the custom color.
	check("seconds thunk draws a second hand", spansOf(node, "#ffcc00").length >= 1);

	// reactive second hand: bump seconds → re-invalidate + moved span.
	const before = JSON.stringify(spansOf(node, "#ffcc00"));
	s.value = 30;
	check("seconds change re-invalidates", node.invalidated === 2);
	node.paint();
	check(
		"second-hand spans move on seconds change",
		JSON.stringify(spansOf(node, "#ffcc00")) !== before,
	);
}

// --- seconds as a BARE NUMBER (non-thunk branch) ---
{
	const [node] = createRoot(() => ClockFace({ hours: 6, minutes: 30, seconds: 15 }));
	node.paint();
	check("numeric (non-thunk) seconds draws a second hand", spansOf(node, SECOND).length >= 1);
	// hours=6 (with 30 min) → hour hand sweeps to ~195°, extending BELOW center;
	// its DDA blocks are the t=3 (w===3) hand spans.
	check(
		"hour hand at 6:30 extends below center",
		spansOf(node, HAND).some((s: any) => s.w === 3 && s.y > 72),
	);
}

done();
