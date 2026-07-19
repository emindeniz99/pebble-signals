import { render } from "runtime/jsx-runtime";
import { Navigator } from "runtime/flow";

const bg = new Skin({ fill: "black" });
const st = new Style({ font: "bold 28px Gothic", color: "white" });

render(() => (
	<Container left={0} right={0} top={0} bottom={0} skin={bg} style={st}>
		<Navigator
			left={10}
			right={10}
			top={40}
			bottom={40}
			root={() => (
				<Column>
					<Label string="NAV LRTB" />
					<Label string="two labels" />
				</Column>
			)}
		/>
	</Container>
));
