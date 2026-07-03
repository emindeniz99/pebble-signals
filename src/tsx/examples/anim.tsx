// animate() demo — SELECT launches a 0→100 ease-in tween; the big Label reads
// the eased value live (val() returns the current tween getter, val()() its
// value). Proves the Reanimated-style helper on-device. Build: APP=anim
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { animate } from "runtime/flow";

const bg = new Skin({ fill: "black" });
const big = new Style({ font: "bold 42px Bitham", color: "white" });
const dim = new Style({ font: "18px Gothic", color: "#FFAA55" });

// val holds the CURRENT tween getter; starts as a constant 0-getter.
const [val, setVal] = useState(() => 0);
const ease = (t: number) => t * t;

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}
		onPressSelect={() => setVal(() => animate(0, 100, 600, ease))}>
		<Column>
			<Label style={big} string={() => "" + Math.round(val()())} />
			<Label style={dim} string="SELECT = tween 0-100" />
		</Column>
	</Container>
), { skin: bg, style: big });
