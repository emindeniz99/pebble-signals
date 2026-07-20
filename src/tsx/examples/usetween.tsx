// useTween — the runtime/anim tween hook, on-device. UP/DOWN cycle through a few
// fixed targets; the big number smoothly EASES to each new target (RN Reanimated's
// withTiming). Retargeting mid-glide picks up from the current partial value — it
// never snaps back. Buttons only (touch crashes QEMU). Build: APP=anim
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";
import { useTween } from "runtime/anim";
import { quadInOut } from "runtime/easing";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "18px Gothic", color: "white" });
const big = new Style({ font: "bold 24px Gothic", color: "white" });
const dim = new Style({ font: "18px Gothic", color: "#FFAA55" });

const targets = [0, 60, 140, 200, 100];
// The index is a plain module-scope signal (safe to preload — no effect/graph).
const [i, setI] = useState(0);

render(
	() => {
		// useTween lives INSIDE the build (runtime), never at module scope: its
		// driving effect must not create the reactive graph at preload (a preload-
		// built graph freezes into ROM and dies on the first write — signals gotcha).
		const value = useTween(() => targets[i()], { duration: 500, easing: quadInOut });
		return (
			<Container
				left={0}
				right={0}
				top={0}
				bottom={0}
				focus={true}
				onPressUp={() => setI((v) => (v + 1) % targets.length)}
				onPressDown={() => setI((v) => (v + targets.length - 1) % targets.length)}
			>
				<Column>
					{/* Read i() too, so this binding re-subscribes to the freshly-created
					    tween signal on each retarget — animate() mints a NEW signal per
					    tween, so a value()-only read would freeze after the first swap. */}
					<Label
						style={big}
						string={() => {
							i();
							return String(Math.round(value()));
						}}
					/>
					<Label style={dim} string={() => "UP / DOWN  ->  " + targets[i()]} />
				</Column>
			</Container>
		);
	},
	{ skin: bg, style: base },
);
