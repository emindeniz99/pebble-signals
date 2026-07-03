import { signal } from "runtime/signals";
const big = new Style({ font: "bold 28px Gothic", color: "white" });
const seen = signal(0);   // a submodule-local signal (lowered in the bundle)
export const Readout = (props: { value: () => number }) => {
	seen.value = seen.value + 1;
	return <Label style={big} string={() => "count " + props.value()} />;
};
