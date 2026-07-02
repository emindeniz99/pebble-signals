// M11 — multi-screen example app: four of react-pebble's canonical
// examples in ONE mod, switched at RUNTIME (their "multiview" pattern):
// 0 = dynamic mixed-type list (store) · 1 = digital clock watchface ·
// 2 = counter · 3 = toggle.
//
// ARCHITECTURE (arena-driven, all measured): screens are PREBUILT during
// the initial render and swapped by reference with replace() — but only
// the list screen uses signal bindings. The clock/counter/toggle screens
// update IMPERATIVELY (module-held Label refs, direct .string writes):
// each prebuilt binding costs an effect + closures of arena slots, and
// four fully-reactive prebuilt screens pushed the boot floor past the
// 32KB arena (silent startup OOM — measured by bisection: +3 useState
// alone was the difference between booting at 95% and dying). Signals
// where structure/data flows (the list); imperative writes where a
// single label changes (the escape hatch this platform wants).
//
// Buttons: select = next screen · up/down = act on the current screen
// (list: push/remove · counter: +/- · toggle: flip · clock: none).
import { render } from "runtime/jsx-runtime";
import { useState, createStore, effect, track } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "24px Gothic", color: "white" });

// -- screen 0: dynamic mixed-type list over the byte-record store --------
const W = 3;
const st = createStore(256);
const [count, setCount] = useState(0);
let nextId = 1;

function push() {
	const n = st.push(nextId % 2 ? "s" + nextId : nextId);
	if (n >= 0) {
		nextId++;
		setCount(n);
	}
}

function drop() {
	const n = st.remove(0);
	if (n >= 0)
		setCount(n);
}

function row(slot: number) {
	const n = count();
	const i = (n > W ? n - W : 0) + slot;
	if (i >= n)
		return "";
	const v = st.get(i);
	return typeof v === "number" ? "#" + v : String(v);
}

// -- screens 1-3: imperative labels (no signals — see header) --------------
let clkL: any = null;
const two = (n: number) => (n < 10 ? "0" : "") + n;

function tick() {
	if (!clkL)
		return;
	const d = new Date();
	clkL.string = two(d.getHours()) + ":" + two(d.getMinutes()) + ":" + two(d.getSeconds());
}
// setInterval(tick, 1000);	// bisect

// -- navigation ------------------------------------------------------------
const TITLES = ["list", "clock"];
const [scr, setScr] = useState(0);

function up() {
	const v = scr();
	if (v === 0) push();
}

function down() {
	const v = scr();
	if (v === 0) drop();
}

render(() => {
	clkL = <Label string="--:--:--" />;
	const screens = [
		<Column width={180} height={140}>
			<Label string={() => "n" + count()} />
			<Label string={() => row(0)} />
			<Label string={() => row(1)} />
			<Label string={() => row(2)} />
		</Column>,
		<Column width={180} height={140}>{clkL}</Column>,
	];
	const host = new Container(null, { width: 180, height: 140 });
	let cur = screens[0];
	host.add(cur);
	track(effect(() => {
		const next = screens[scr()];
		if (next !== cur) {
			host.replace(cur, next);
			cur = next;
		}
	}));
	return (
		<Container left={0} right={0} top={0} bottom={0} focus={true}
			onPressUp={up} onPressDown={down}
			onPressSelect={() => setScr((v: number) => (v + 1) % 2)}>
			<Column>
				<Label string={() => TITLES[scr()]} />
				{host}
			</Column>
		</Container>
	);
}, { skin: bg, style: base });
