// easing — the runtime/easing curves made visible. SELECT drops a box 120px
// down over 1s using `backOut`, whose overshoot-and-settle is obvious to the
// eye (the box shoots past its target, then springs back up to it). UP/DOWN
// swap the active curve, so you can watch the SAME 0->120 move under different
// timing (linear vs the springy backOut vs the decelerating expoOut). Build: APP=easing
import { render, screen } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { Move, animate } from "runtime/flow";
import { backOut, expoOut, linear } from "runtime/easing";

const bg = new Skin({ fill: "black" });
const box = new Skin({ fill: "white" });
const st = new Style({ font: "bold 18px Gothic", color: "white" });

const curves = [
	{ name: "backOut", fn: backOut },
	{ name: "expoOut", fn: expoOut },
	{ name: "linear", fn: linear },
];
const [i, setI] = useState(0);
const [tween, setTween] = useState<(() => number) | null>(null);

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}
		onPressUp={() => setI((v) => (v + 1) % curves.length)}
		onPressDown={() => setI((v) => (v + curves.length - 1) % curves.length)}
		onPressSelect={() => setTween(() => animate(0, 120, 1000, curves[i()].fn))}>
		{/* On round, drop the title below the bezel (top:6 clips) — it auto-centers
		    with no left/right anchor; push the box down to clear it. */}
		<Label top={screen.round ? 42 : 6} style={st} string={() => `${curves[i()].name} — SELECT`} />
		<Move left={65} top={screen.round ? 74 : 30} width={30} height={30}
			y={() => { const t = tween(); return t ? t() : 0; }}>
			<Container width={30} height={30} skin={box} />
		</Move>
	</Container>
), { skin: bg, style: st });
