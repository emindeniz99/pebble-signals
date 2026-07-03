// >32 live effects on real XS (#21). The packed core caps effect bits at
// one u32 word (32 effects); more than that forces the subscriber mask +
// used/quarantine sets to grow to a multi-word stride. To prove the stride
// on the tiny 32KB heap we keep the heap cost near zero: ONE signal, ONE
// shared watcher closure, registered as 36 SEPARATE effects (36 distinct
// ids, all subscribing to the same signal). That alone crosses the 32-bit
// word — if the cap were still there, boot would throw fx:max. A press bumps
// the signal and re-fires all 36 watchers plus the Label's binding effect;
// `n` counts total watcher runs so the number visibly jumps by 36.
// Build: APP=manyfx ./build.sh
import { render } from "runtime/jsx-runtime";
import { effect, S } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "24px Gothic", color: "white" });

const N = 36;					// > 32: forces the stride from 1 word to 2
const trigger = S.sig(0);
let n = 0;
const watch = () => { S.get(trigger); n++; };	// one closure, reused
for (let k = 0; k < N; k++) effect(watch);	// 36 distinct effect ids

render(() => (
	<Container left={0} right={0} top={0} bottom={0} focus={true}
		onPressUp={() => S.set(trigger, S.get(trigger) + 1)}>
		<Column>
			<Label style={base} string={() => {
				S.get(trigger);			// re-run this binding on each bump
				return "fired " + n + " (+" + N + ")";
			}} />
		</Column>
	</Container>
), { skin: bg, style: base });
