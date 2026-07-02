// Animated COLOR bitmap watchface (Round 2). Two bundled bitmaps
// (assets/ball0/1.png -> *-color.bm4 via png2bmp) are swapped on a timer
// via a reactive `skin` binding — proving bitmaps ANIMATE by frame-swap
// (Piu also has a native multi-frame Image class; this is the runtime way).
// Plus a live HH:MM:SS clock. Build: APP=imgwatch ./build.sh
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
declare const Texture: any;

const bg = new Skin({ fill: "black" });
const big = new Style({ font: "bold 42px Bitham", color: "white" });

const skinA = new Skin({ texture: new Texture("ball0.png"), x: 0, y: 0, width: 64, height: 64 });
const skinB = new Skin({ texture: new Texture("ball1.png"), x: 0, y: 0, width: 64, height: 64 });

const two = (n: number) => (n < 10 ? "0" : "") + n;
const [time, setTime] = useState("");
const [frame, setFrame] = useState(0);
function tick() {
	const d = new Date();
	setTime(two(d.getHours()) + ":" + two(d.getMinutes()) + ":" + two(d.getSeconds()));
}
tick();
setInterval(tick, 1000);
setInterval(() => setFrame((f: number) => f + 1), 450);	// animate the bitmap

render(() => (
	<Container left={0} right={0} top={0} bottom={0}>
		<Column>
			<Content width={64} height={64} skin={() => frame() % 2 ? skinB : skinA} />
			<Label style={big} string={() => time()} />
		</Column>
	</Container>
), { skin: bg, style: big });
