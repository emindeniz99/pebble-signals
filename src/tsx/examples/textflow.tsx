// runtime/textflow receipt — a wrapped paragraph that re-flows reactively.
// TextFlow is DISPLAY-ONLY: the app owns the string and TextFlow wraps it (manual
// word-wrap into a Column of Label lines — NOT Piu 'Text'). The block re-wraps
// for free — `text` is a thunk read inside TextFlow's internal effect (idiom 5b),
// so a button that flips the source signal rebuilds the lines with no bind wiring.
// Buttons (QEMU touch crashes the firmware — README gotcha 2):
//   up / down / back = swap between the two paragraphs (watch the block re-flow).
import { render, screen } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { TextFlow } from "runtime/textflow";

// Module-scope host objects are FINE in an APP (only preloaded runtime/ modules
// freeze them into broken ROM). Black background + a valid-font base Style.
const bg = new Skin({ fill: "black" });
const base = new Style({ font: "18px Gothic", color: "white" });

// Two short paragraphs sized to wrap to ~4-5 lines at width 140 (charsPerLine
// defaults to floor(140/9)=15), so both fit the 144x168 screen under the header.
const PARAS = [
	"Signal Piu wraps this text into a column of label lines.",
	"Press a button and the block re-wraps and rebuilds its lines.",
];
const [which, setWhich] = useState(0);
const toggle = () => setWhich((w: number) => (w + 1) % PARAS.length);

render(
	() => (
		<Container
			left={0}
			right={0}
			top={0}
			bottom={0}
			focus={true}
			onPressUp={toggle}
			onPressDown={toggle}
			onPressBack={toggle}
		>
			<Column>
				<Label string="TextFlow" />
				{/* Center each wrapped line on a round screen (Pebble reflows centered)
				    so the ragged left edge never runs under the bezel; left on rect.
				    Evaluated at render time, so screen.round is valid. */}
				<TextFlow
					text={() => PARAS[which()]}
					width={140}
					lineHeight={20}
					align={screen.round ? "center" : "left"}
				/>
			</Column>
		</Container>
	),
	{ skin: bg, style: base },
);
