// runtime/dialog receipt — a centered modal card. A single Dialog paints a bold
// "Alert" title over a wrapping "Battery low" message with a "SELECT ok" dismiss
// hint at the bottom, centered on the screen over a black backdrop. It is a
// hand-built composition (Container + Column of Labels, explicit width + height
// — gotcha 16), NOT a Canvas, so there is nothing to invalidate: it just lays
// out and draws.
import { render } from "runtime/jsx-runtime";
import { Dialog } from "runtime/dialog";

const bg = new Skin({ fill: "black" });

render(() => (
	<Container left={0} right={0} top={0} bottom={0}>
		<Dialog title="Alert" message="Battery low" hint="SELECT ok" />
	</Container>
), { skin: bg });
