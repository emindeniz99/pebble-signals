// runtime/roundsafe receipt — arbitrary content wrapped in a RoundSafeArea so it
// stays inside gabbro's circle instead of clipping under the bezel. On a ROUND
// screen the whole tree is inset by the corner-safe ~0.29·radius into the safe
// band, so the top title, the body, and the bottom hint all read fully; on a RECT
// screen (emery) RoundSafeArea passes through full-bleed, so the same source
// renders edge-to-edge. Compare against statusbar.tsx on gabbro to see the fix.
import { render } from "runtime/jsx-runtime";
import { RoundSafeArea } from "runtime/roundsafe";

const bg = new Skin({ fill: "black" });
const title = new Style({ font: "bold 24px Gothic", color: "white", horizontal: "center" });
const base = new Style({ font: "18px Gothic", color: "#aaaaaa", horizontal: "center" });

// Title at top:0, body centered, hint pinned to bottom:0 — a full-height layout
// whose corners would clip on a round screen WITHOUT the safe-area inset. All
// three Labels are full-width + centered so they read on both shapes.
render(
	() => (
		<RoundSafeArea>
			<Label left={0} right={0} top={0} height={28} style={title} string="Inbox" />
			<Label left={0} right={0} style={base} string="3 unread messages" />
			<Label left={0} right={0} bottom={0} height={22} style={base} string="UP · reply" />
		</RoundSafeArea>
	),
	{ skin: bg, style: base },
);
