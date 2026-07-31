// fontface — CUSTOM FONT proof: a clock in Liberation Serif (SIL OFL, TTF
// shipped in-repo at fontface/fonts/). The fonts/ convention does the rest:
// gen-manifest sees the non-system `font:` literal, finds
// fonts/LiberationSerif-Bold.ttf, and emits the "*-alpha" resource entry;
// mcrun rasterizes the TTF into LiberationSerif-Bold-32.fnt + .png (FLASH,
// not arena) at build; the port's PiuStyleLookupFont falls back to exactly
// those resources when the system table misses — the `words` example's
// mechanism, now one convention away for any app.
//
// It is also the SUBSET proof. `fonts/fonts.json` declares
// `{"LiberationSerif-Bold": {"characters": "0123456789:"}}`, so the build
// trims the face to the 11 glyphs a clock draws — 370,196 -> 8,968 B, and the
// rasterized digits are pixel-identical to the full face. The trade is the
// point and it is VISIBLE here: the serif style may now only draw those 11
// characters, so the prose labels are system Gothic. Want serif prose? Widen
// the declaration (or delete it) — a character the subset drops is a BUILD
// ERROR, never a blank on the watch.
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const serif = new Style({ font: "bold 32px LiberationSerif", color: "white" });
const gothic = new Style({ font: "18px Gothic", color: "white" });

const two = (n: number) => (n < 10 ? "0" : "") + n;
const [hhmm, setHhmm] = useState("");
const tick = () => {
	const d = new Date();
	setHhmm(two(d.getHours()) + ":" + two(d.getMinutes()));
};
tick();
setInterval(tick, 1000);

render(() => (
	<Container left={0} right={0} top={0} bottom={0}>
		<Column>
			<Label style={serif} string={() => hhmm()} />
			<Label style={gothic} string="serif clock, from a TTF" />
			<Label style={gothic} string="subset to 0-9 and :" />
		</Column>
	</Container>
), { skin: bg, style: gothic });
