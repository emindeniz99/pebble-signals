// movebox — the <Move> reactive-position helper, on-device. Coordinates are
// construction-time statics on this port; <Move> repositions a MOUNTED
// subtree via content.moveBy deltas (the probe-proven safe mutation).
// Two sources drive the same mechanism:
//  - UP/DOWN write a signal (deterministic ±20px steps — the receipt)
//  - SELECT fires an animate() tween (0 -> 60px down over 1.2s, eased)
import { render } from "runtime/jsx-runtime";
import { Move, animate } from "runtime/flow";
import { useState } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const box = new Skin({ fill: "white" });
const st = new Style({ font: "bold 18px Gothic", color: "white" });
const [x, setX] = useState(0);
const [tween, setTween] = useState<(() => number) | null>(null);

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}
		onPressUp={() => setX((v) => v + 20)}
		onPressDown={() => setX((v) => v - 20)}
		onPressSelect={() => setTween(() => animate(0, 60, 1200, (t) => t * (2 - t)))}>
		<Label top={10} style={st} string={() => `x=${x()}`} />
		<Move left={20} top={60} width={30} height={30}
			x={() => x()}
			y={() => { const t = tween(); return t ? t() : 0; }}>
			<Container width={30} height={30} skin={box} />
		</Move>
	</Container>
), { skin: bg, style: st });
