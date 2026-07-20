// runtime/imagebackground receipt — the RN `<ImageBackground>` analog: a live
// HH:MM clock centered OVER a bitmap backdrop. The sloth is assets/sloth.png; the
// build packs it automatically because the bare "sloth.png" string LITERAL appears
// in this app source (gen-manifest scans it). A single centered <Label> child
// rides on TOP of the 120x120 texture Skin (a bare Container paints its skin first,
// then centers the lone unanchored child over it) — reads on both the 260x260
// round (gabbro) and 200x228 rect (emery) panels. The reactive `string={() =>
// time()}` is the one whitelisted reactive prop (jsx-runtime REACTIVE_PROPS); the
// backdrop's width/height stay construction-time (gotcha 16). Valid clock font
// "bold 28px Gothic" (tools/fontcheck) — "12:34" fits 120px centered.
// Build: APP=imagebackground ./build.sh
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { ImageBackground } from "runtime/imagebackground";

const bg = new Skin({ fill: "black" });
const clock = new Style({ font: "bold 28px Gothic", color: "white" });

const two = (n: number) => (n < 10 ? "0" : "") + n;
const [time, setTime] = useState("");
function tick() {
	const d = new Date();
	setTime(two(d.getHours()) + ":" + two(d.getMinutes()));
}
tick();
setInterval(tick, 1000);

render(
	() => (
		<Container left={0} right={0} top={0} bottom={0}>
			<ImageBackground src="sloth.png" width={120} height={120}>
				<Label style={clock} string={() => time()} />
			</ImageBackground>
		</Container>
	),
	{ skin: bg, style: clock },
);
