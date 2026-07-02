// Example: boolean toggle with REACTIVE skin/style/string (react-pebble's
// "toggle" equivalent) — this is the on-device proof of the setProp
// skin/style path. select = flip. Build: APP=toggle ./build.sh
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "24px Gothic", color: "white" });
const onSkin = new Skin({ fill: "white" });
const onStyle = new Style({ font: "24px Gothic", color: "black" });

const [on, setOn] = useState(false);

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}
		onPressSelect={() => setOn((v: boolean) => !v)}>
		<Column>
			<Label width={120} height={40} string={() => on() ? "ON" : "OFF"}
				skin={() => on() ? onSkin : bg} style={() => on() ? onStyle : base} />
		</Column>
	</Container>
), { skin: bg, style: base });
