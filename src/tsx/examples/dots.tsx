// runtime/dots receipt — a page/step DotIndicator whose active dot follows a
// signal. The highlight moves for free: `active` is read inside the composed
// Canvas's paint, so its reads auto-track (active change → Canvas effect →
// invalidate → repaint) with no bind wiring.
// Buttons (QEMU touch crashes the firmware — handbook gotcha 2):
//   up = previous page (wraps) · down = next page (wraps).
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { DotIndicator } from "runtime/dots";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "24px Gothic", color: "white" });

const PAGES = 4;
const [page, setPage] = useState(0);
const next = () => setPage((p: number) => (p + 1) % PAGES);
const prev = () => setPage((p: number) => (p - 1 + PAGES) % PAGES);

render(
	() => (
		<Container left={0} right={0} top={0} bottom={0} focus={true} onPressUp={prev} onPressDown={next}>
			<Column>
				<Label string={() => "page " + (page() + 1) + "/" + PAGES} />
				<DotIndicator count={PAGES} active={page} on="#00d0ff" />
			</Column>
		</Container>
	),
	{ skin: bg, style: base },
);
