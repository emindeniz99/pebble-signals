// SPIKE — WORK IN PROGRESS, does NOT render yet (kept as an artifact like
// `multiscreen`). Goal: de-risk the SVGImage (Pebble PDC vector) path so a
// vector sloth could scale for free (no per-scale pixel cost, unlike a raster
// Texture). Status: the .pdc bundles (Resource finds it) and SVGImage boots
// with no crash, but the draw-command image fails to render — likely
// gdraw_command_image_validate rejecting it via the Moddable Resource/path
// route (a PDCI_DATA_OFFSET / data-partition detail not inspectable without
// firmware headers). Next: test a REAL svg2pdc-generated .pdc to isolate
// bytes-vs-bundling, or try the native Pebble resource `id` route.
// See README "Vector images (SVGImage / PDC)". Build: APP=slothvec ./build.sh
import { render } from "runtime/jsx-runtime";
declare const SVGImage: any;

const bg = new Skin({ fill: "black" });
const big = new Style({ font: "bold 24px Gothic", color: "white" });

// imperative construct so we can call the transform methods (scale/rotate
// are methods, not construction props); dropped into the tree as a child.
const svg = new SVGImage(null, { path: "testcircle.pdc", width: 100, height: 100 });
// SVGImage only draws after a transform is set at least once (the draw path
// reads a command list that's built lazily inside the transform branch), so
// scale(1,1) is REQUIRED even for native size.
svg.scale(1, 1);

render(() => (
	<Container left={0} right={0} top={0} bottom={0}>
		<Column>
			{svg}
			<Label style={big} string="SVG 2x" />
		</Column>
	</Container>
), { skin: bg, style: big });
