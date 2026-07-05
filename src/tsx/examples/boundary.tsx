// Example: the OPT-IN per-subtree <ErrorBoundary> (Solid parity).
// The lower "value" line is wrapped in a boundary and throws once n reaches 3;
// the boundary swaps in a fallback showing the error WHILE the "n=" line above
// it (outside the boundary) keeps updating — only the wrapped subtree is
// replaced. up/down change n; select calls the fallback's reset (lower n below
// 3 first). Contrast crashdemo.tsx, where the same throw with NO inner boundary
// hits render()'s top-level crash screen. Kept deliberately lean (one Style)
// because pulling flow's ErrorBoundary rides near the boot-slot floor.
// Build: APP=boundary node build.mts
import { ErrorBoundary } from "runtime/flow";
import { render } from "runtime/jsx-runtime";
import { useState } from "runtime/signals";

const bg = new Skin({ fill: "black" });
const base = new Style({ font: "24px Gothic", color: "white" });

const [n, setN] = useState(0);
let reset: (() => void) | null = null;

render(
	() => (
		<Column
			left={0}
			right={0}
			top={0}
			bottom={0}
			focus={true}
			onPressUp={() => setN((v: number) => v + 1)}
			onPressDown={() => setN((v: number) => (v > 0 ? v - 1 : 0))}
			onPressSelect={() => reset?.()}
		>
			<Label string={() => "n=" + n()} />
			<ErrorBoundary
				width={180}
				height={40}
				fallback={(e, r) => {
					reset = r;
					return <Label string={"X: " + (e as Error).message} />;
				}}
			>
				{() => (
					<Label
						string={() => {
							if (n() >= 3) throw new Error("n" + n());
							return "ok" + n();
						}}
					/>
				)}
			</ErrorBoundary>
		</Column>
	),
	{ skin: bg, style: base },
);
