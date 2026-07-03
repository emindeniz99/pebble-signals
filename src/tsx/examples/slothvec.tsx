// SPIKE — vector (SVGImage/PDC) path, close but not fully confirmed on-device.
// Goal: scale an icon for free (no per-scale pixels, unlike a raster Texture).
//
// PROVEN so far (see README "Vector images"):
//  - bytes: tools/gen_pdc.py output is BYTE-IDENTICAL to the real svg2pdc.py,
//    so the PDC data is correct.
//  - loading: the on-screen probe below shows `len=29 b0=80` — new Resource()
//    returns the intact 29-byte file (starts with 'P'), so bundling works.
//  - validation: with NO explicit width/height the SVGImage still sizes itself
//    to the PDC's 100x100 bounds, so gdraw_command_image_validate SUCCEEDS
//    (dci is valid). The image IS parsed.
// CONCLUSION: the PDC never renders despite all of the above. Exhaustively
// ruled out on-device (gabbro + emery): color (a big WHITE circle is equally
// invisible), positioning (center(0,0) and center(50,50) both blank), and
// the transform trigger (scale set pre-mount AND re-applied post-mount by a
// timer). dci validates and DrawAux's math checks out on paper, yet
// gdraw_command_list_draw produces no visible pixels. This looks like a
// limitation of the SVGImage `path`/Resource route on this Alloy firmware
// build, not something fixable from JS. Not-yet-tried: the native Pebble
// resource `id` route (needs the generated RESOURCE_ID plumbed into JS).
// Build: APP=slothvec ./build.sh
import { render } from "runtime/jsx-runtime";
declare const SVGImage: any;
declare const Resource: any;

const bg = new Skin({ fill: "black" });
const big = new Style({ font: "bold 24px Gothic", color: "white" });

// ON-SCREEN diagnostic (trace() doesn't reach the app log in this build):
// prove whether the bundled .pdc actually loads and how many bytes it is.
let info: string;
try {
	const r = new Resource("testcircle.pdc");
	info = "len=" + r.byteLength + " b0=" + new Uint8Array(r)[0];
} catch (e) {
	info = "ERR " + e;
}

// NO explicit width/height: force the SVGImage to size from the PDC bounds,
// which only happens if dci validated — a size probe for validation success.
const svg = new SVGImage(null, { path: "testcircle.pdc" });
// _create does NOT initialize the transform fields (r/tx/ty/cx/cy) — set them
// all explicitly so the draw matrix isn't built from garbage.
// DrawAux offsets the draw box by (cx,cy); command coords are top-left, so
// keep cx=cy=0 or the image shifts by half. center(0,0) => circle at its
// own (50,50) lands at the content's (50,50) center.
svg.center(0, 0);
svg.rotate(0);
svg.translate(0, 0);
svg.scale(1, 1);

render(() => (
	<Container left={0} right={0} top={0} bottom={0}>
		<Column>
			{svg}
			<Label style={big} string={info} />
		</Column>
	</Container>
), { skin: bg, style: big });
