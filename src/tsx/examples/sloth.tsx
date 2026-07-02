// Animated COLOR sloth watchface (Round 2) 🦥 — a single sprite-sheet
// bitmap (assets/sloth.png: 3 frames = eyes open / half / closed) shown one
// frame at a time via the reactive `variant` prop. ONE texture is decoded
// once (native-heap friendly); animation is just `variant` swapping on a
// slow timer — sloths blink slowly. Live HH:MM below + a seconds dot.
// The image lives in FLASH (resources) + native framebuffer, NOT the 32KB
// JS arena — see README "Bitmaps". Build: APP=sloth ./build.sh
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
declare const Texture: any;

const bg = new Skin({ fill: "black" });
const big = new Style({ font: "bold 42px Bitham", color: "white" });
const dim = new Style({ font: "18px Gothic", color: "white" });

// one sheet, 104px frames, variant N = the Nth 104px slice
const sheet = new Skin({ texture: new Texture("sloth.png"), x: 0, y: 0, width: 104, height: 104, variants: 104 });

// slow, mostly-open blink loop: open ... open, then a quick blink down+up
const BLINK = [0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 1];
const two = (n: number) => (n < 10 ? "0" : "") + n;
const [time, setTime] = useState("");
const [sec, setSec] = useState("");
const [step, setStep] = useState(0);
function tick() {
	const d = new Date();
	setTime(two(d.getHours()) + ":" + two(d.getMinutes()));
	setSec(two(d.getSeconds()));
}
tick();
setInterval(tick, 1000);
setInterval(() => setStep((s: number) => (s + 1) % BLINK.length), 220);

render(() => (
	<Container left={0} right={0} top={0} bottom={0}>
		<Column>
			<Content width={104} height={104} skin={sheet} variant={() => BLINK[step()]} />
			<Label style={big} string={() => time()} />
			<Label style={dim} string={() => sec()} />
		</Column>
	</Container>
), { skin: bg, style: big });
