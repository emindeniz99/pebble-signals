// watchinfo — a first-boot receipt for the one-shot device + screen facts:
// runtime/watchinfo's watchInfo() (model / firmware / 12-24h clock) plus
// useDisplayBounds() for the WxH + panel shape. Everything here is CONSTANT per
// boot, so the Labels use STATIC strings (not reactive thunks — a thunk would
// subscribe to nothing and could never re-fire). Both hooks are called INSIDE
// the render() build, where `screen` has already been measured (calling at
// module scope would read the screen fields as 0). No buttons: nothing to drive
// — the values change only with the HARDWARE. Install to gabbro (round 260x260)
// vs emery (rect 200x228) to watch the same app report two different shapes.
import { render } from "runtime/jsx-runtime";
import { useDisplayBounds, watchInfo } from "runtime/watchinfo";

const bg = new Skin({ fill: "black" });
const title = new Style({ font: "bold 24px Gothic", color: "white" });
const body = new Style({ font: "18px Gothic", color: "#AAAAAA" });

render(
	() => {
		const info = watchInfo();
		const { width, height, round } = useDisplayBounds();
		const fw = info.firmware;
		return (
			<Column>
				<Label style={title} string="watchInfo" />
				<Label style={body} string={"model " + info.model} />
				<Label style={body} string={"fw " + fw.major + "." + fw.minor + "." + fw.patch} />
				<Label style={body} string={width + "x" + height + " " + (round ? "round" : "rect")} />
				<Label style={body} string={info.color ? "color panel" : "b/w panel"} />
				<Label style={body} string={info.hour12 ? "12h clock" : "24h clock"} />
			</Column>
		);
	},
	{ skin: bg, style: body },
);
