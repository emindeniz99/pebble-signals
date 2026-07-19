import { render } from "runtime/jsx-runtime";
import { Show } from "runtime/flow";

const bg = new Skin({ fill: "black" });
const st = new Style({ font: "bold 28px Gothic", color: "white" });

render(() => (
	<Container left={0} right={0} top={0} bottom={0} skin={bg} style={st}>
		<Show left={10} right={10} top={40} bottom={40} when={() => true}>
			{() => <Label string="LRTB OK" />}
		</Show>
	</Container>
));
