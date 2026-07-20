// runtime/vectorimage receipt — the PDC vector sloth (assets/slothvec.pdc, a
// 60px viewbox of flat vector paths) rendered resolution-independently at 2x
// (120px, ZERO pixel RAM) with a slow reactive SWING. VectorImage applies its
// transforms POST-mount (the onDisplaying hook — mandatory on this port) and
// RE-applies the reactive `rotate` thunk on every signal change (idiom 5b): the
// angle signal is nudged every 150ms and the sloth swings for free, no bind
// wiring. Mirrors the device-proven slothvec.tsx shape — pivot at the branch grip
// (center + translate 30,7), scale 2 — but driven entirely through the component.
// Build: APP=vectorimage ./build.sh
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { VectorImage } from "runtime/vectorimage";

const bg = new Skin({ fill: "black" });
const cap = new Style({ font: "bold 24px Gothic", color: "#FFAA55" });

// The swing angle (radians) — a signal nudged every 150ms. VectorImage reads it
// inside its reactive-transform effect, so rotate() re-applies on each change; the
// sin() keeps it a swing, not a spin (rotate is absolute — rule d).
const [angle, setAngle] = useState(0);
let phase = 0;
setInterval(() => {
	phase += 0.25;
	setAngle(0.12 * Math.sin(phase));
}, 150);

render(
	() => (
		<Container left={0} right={0} top={0} bottom={0}>
			<Column>
				<VectorImage
					src="slothvec.pdc"
					width={120}
					height={120}
					center={[30, 7]}
					translate={[30, 7]}
					scale={2}
					rotate={() => angle()}
				/>
				<Label style={cap} string="vector" />
			</Column>
		</Container>
	),
	{ skin: bg, style: cap },
);
