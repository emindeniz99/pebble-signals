// runtime/roundsafe receipt — a StatusBar strip + body Label wrapped in a
// RoundSafeArea, so the top strip is no longer clipped behind gabbro's bezel.
// On a ROUND screen (gabbro) the whole tree is inset ~18px on all sides into the
// safe band; on a RECT screen (emery) RoundSafeArea passes through full-bleed, so
// the same source renders edge-to-edge there. Compare against statusbar.tsx (the
// un-inset version) on gabbro to see the fix.
import { render } from "runtime/jsx-runtime";
import { RoundSafeArea } from "runtime/roundsafe";
import { StatusBar } from "runtime/statusbar";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "18px Gothic", color: "white" });

render(
	() => (
		<RoundSafeArea>
			<StatusBar title="Inbox" background="#202020" />
			<Label top={40} style={base} string="3 unread messages" />
		</RoundSafeArea>
	),
	{ skin: bg, style: base },
);
