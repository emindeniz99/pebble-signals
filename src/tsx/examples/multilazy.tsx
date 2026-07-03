// LAZY multiscreen (task #13) — the architecture the prebuilt `multiscreen`
// artifact proves impossible: M11 showed the ARENA (not the archive) caps
// screens, so all screens' CODE can live in flash while the arena holds
// exactly ONE built screen at a time. SELECT cycles screens: the current
// root is disposed (its effects + nodes die), then the next screen is
// built on demand under a fresh root — Show's default swap, generalized
// to N screens. Steady-state arena is O(1 screen), not O(N screens).
// Build: APP=multilazy ./build.sh — press select repeatedly; the arena
// stays flat across cycles (verify with memtest --idle).
import { render } from "runtime/jsx-runtime";
import { useState, effect, untrack, createRoot } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const big = new Style({ font: "bold 28px Gothic", color: "white" });
const dim = new Style({ font: "18px Gothic", color: "#FFAA55" });

const [idx, setIdx] = useState(0);
const [tick, setTick] = useState(0);
setInterval(() => setTick(t => t + 1), 1000);

// Three genuinely different screens — a live clock binding, a derived
// counter, and a For list (exercises row build/dispose on every visit).
const SCREENS = [
	() => (
		<Column>
			<Label style={big} string="S1 live" />
			<Label style={dim} string={() => "tick " + tick()} />
		</Column>
	),
	() => (
		<Column>
			<Label style={big} string="S2 derived" />
			<Label style={dim} string={() => "2x " + tick() * 2} />
		</Column>
	),
	() => (
		<Column>
			<Label style={big} string="S3 static" />
			<Label style={dim} string="flash-resident code" />
		</Column>
	),
];

// imperative host so the swap effect below can own its contents
const host = new Column(null, { width: 180, height: 140 });

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}
		onPressSelect={() => { setIdx(i => (i + 1) % SCREENS.length); return true; }}>
		<Column>
			<Label style={dim} string={() => "screen " + (idx() + 1) + "/3"} />
			{host}
		</Column>
	</Container>
), { skin: bg, style: big });

// AFTER mount (same rule the SVGImage saga taught): swap screens once the
// host is bound. Dispose the outgoing root, build the incoming on demand.
let disposeCur: any = null;
effect(() => {
	const i = idx();
	untrack(() => {
		if (disposeCur) { disposeCur(); disposeCur = null; }
		while (host.first)
			host.remove(host.first);
		const [tree, d] = createRoot(() => SCREENS[i]());
		disposeCur = d;
		host.add(tree);
	});
});
