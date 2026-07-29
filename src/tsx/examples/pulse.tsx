// pulse — the FLAGSHIP showcase: every proven mechanism, one polished face.
//   custom TTF clock (fonts/ convention)     · fine-grained seconds/date
//   pulsing accent dot (<Move> + animate())  · themes on UP/DOWN (persisted)
//   greeting via the config page (pkjs bridge)
//   SELECT -> lazy log screen (importNow + VirtualList + byte store)
// Ships as a watchAPP (buttons; the host blocks pebble/button for true
// watchfaces — see tutorial part 6). Composition is the point: this is the
// integration test the 60 single-mechanism examples don't give us, run at
// real arena pressure. DEPTH NOTE: the face renders under Navigator like
// navreactive (the near-wall canary) — keep the JSX tree SHALLOW; nesting
// added here must be boot-verified on both platforms.
import { render, screen } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";

// ---- themes (UP/DOWN cycle; index persisted) -------------------------------
const bg = new Skin({ fill: "black" });
const accents = [
	new Skin({ fill: "white" }),
	new Skin({ fill: "#55ffaa" }),
	new Skin({ fill: "#ffaa55" }),
];
const clockStyle = new Style({ font: "bold 32px LiberationSerif", color: "white" });
const lineStyle = new Style({ font: "18px Gothic", color: "white" });
const dimStyle = new Style({ font: "14px Gothic", color: "#aaaaaa" });

const [theme, setTheme] = useState(Number(localStorage.getItem("pulse-theme")) || 0);
const cycleTheme = (d: number) =>
	setTheme((t) => {
		const n = (t + d + accents.length) % accents.length;
		localStorage.setItem("pulse-theme", String(n));
		return n;
	});

// ---- clock ------------------------------------------------------------------
const two = (n: number) => (n < 10 ? "0" : "") + n;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// dot pulse: the 1s clock tick doubles as the beat (skin swap — the
// <Move>+animate() version was cut in the boot diet; zero extra machinery)
const [on, setOn] = useState(false);
const [hhmm, setHhmm] = useState("");
const [sub, setSub] = useState("");
const tick = () => {
	const d = new Date();
	setOn((v) => !v);
	setHhmm(`${two(d.getHours())}:${two(d.getMinutes())}`);
	setSub(`${DAYS[d.getDay()]} ${two(d.getDate())}.${two(d.getMonth() + 1)}  ·  :${two(d.getSeconds())}`);
};
tick();
setInterval(tick, 1000);

// ---- deferred init: moved to the LAZY app/boot module ----------------------
// First build died at module load (`fxAbort memory full`) — main.js itself
// was the boot cost. main = FIRST PAINT ONLY; config channel + log load run
// from app/boot 400ms later (see pulse/boot.ts for the full story).
const [name, setName] = useState(localStorage.getItem("pulse-name") || "");
setTimeout(() => {
	(importNow("app/boot") as { default: (c: object) => void }).default({
		// WRAPPED on purpose: useState setters are LOWERED AWAY (packed S.set)
		// — passing one as a bare VALUE emits a dangling identifier (found by
		// this app dying at the 400ms timer). An arrow keeps it a CALL, which
		// the lowering rewrites. (lint-reads rule 5 now catches the escape.)
		setName: (v: string) => setName(v),
	});
}, 400);

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}
				onPressUp={() => cycleTheme(1)}
				onPressDown={() => cycleTheme(-1)}
				>
				<Column top={screen.round ? 30 : 12}>
					<Label style={dimStyle} string={() => (name() ? `hi ${name()}` : "pulse")} />
					<Label style={clockStyle} string={() => hhmm()} />
					<Label style={lineStyle} string={() => sub()} />
					<Content top={6} width={12} height={12} skin={() => (on() ? accents[theme()] : bg)} />
				</Column>
	</Container>
), { skin: bg, style: lineStyle });
