// Grid demo — a 3-column tile layout (app-launcher / icon-picker shape). Nine
// colored 50x50 Content tiles laid out row-major by <Grid>; the caller's `cell`
// builds each tile from its color. Proves the N-column layout on gabbro+emery.
// Build: APP=grid
import { render } from "runtime/jsx-runtime";
import { Grid } from "runtime/grid";

const bg = new Skin({ fill: "black" });
const dim = new Style({ font: "18px Gothic", color: "#FFAA55" });

// One Skin per tile color, built once at module scope (example = app code, not a
// preloaded runtime module, so module-scope Skins are fine here).
const COLORS = ["#FF5555", "#FFAA00", "#FFFF55", "#55FF55", "#55FFFF", "#5555FF", "#FF55FF", "#FFFFFF", "#AAAAAA"];
const skins = COLORS.map((fill) => new Skin({ fill }));

render(() => (
	<Container left={0} right={0} top={0} bottom={0}>
		<Column>
			<Grid
				columns={3}
				items={skins}
				cell={(skin) => <Content width={50} height={50} skin={skin} />}
			/>
			<Label style={dim} string="Grid · 3 columns" />
		</Column>
	</Container>
), { skin: bg, style: dim });
