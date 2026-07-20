// Example: SectionList — a grouped list (RN <SectionList>) of section HEADERS
// (bold) interleaved with item ROWS (normal) over the windowed VirtualList. The
// app owns the selected ITEM index (a signal); up/down step it (wrapping) and
// SectionList highlights that row + scrolls to keep it in view. Headers are never
// selectable, so stepping walks row-to-row ACROSS sections, skipping the headers.
// 3 sections (7 rows) in a 5-slot window (10 flat records) so the list overflows
// and actually scrolls as the selection walks past a section boundary.
// up = previous item (wraps) · down = next item (wraps).
// Build: APP=sectionlist ./build.sh
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { SectionList } from "runtime/sectionlist";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "18px Gothic", color: "white" });

const SECTIONS = [
	{ header: "Fruit", rows: ["Apple", "Banana", "Cherry"] },
	{ header: "Veg", rows: ["Carrot", "Kale"] },
	{ header: "Grain", rows: ["Rice", "Oats"] },
];
// total selectable ROWS (headers excluded) — the selection wraps over these
const TOTAL = SECTIONS.reduce((n, s) => n + s.rows.length, 0);

const [sel, setSel] = useState(0);
const next = () => setSel((s: number) => (s + 1) % TOTAL);
const prev = () => setSel((s: number) => (s - 1 + TOTAL) % TOTAL);

render(
	() => (
		<Container
			left={0}
			right={0}
			top={0}
			bottom={0}
			focus={true}
			onPressUp={prev}
			onPressDown={next}
		>
			<SectionList
				sections={() => SECTIONS}
				renderHeader={(h: string) => h}
				renderRow={(r: string) => r}
				selected={sel}
				rows={5}
				height={170}
			/>
		</Container>
	),
	{ skin: bg, style: base },
);
