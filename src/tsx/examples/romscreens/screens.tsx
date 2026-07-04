// SCREENS FROM ROM — the smart-split dream, screen half. This PURE module
// (const builders only, no local imports, no side effects) is frozen into
// the mod archive by --preload-pure: the builders' code AND function
// objects live in flash; main.js carries none of it. Few, FAT functions on
// purpose: the measured per-function boot cost (playbook "code in ROM")
// makes screen builders the ideal ROM tenant — a screen is naturally one
// big function. Explicit thunks only (no lower/auto-thunk inside pure
// modules).
// (no module-scope Style/Skin: the v1 classifier rightly rejects load-time
// host constructors; screens inherit the render() dict's base style)
import { jsx } from "runtime/jsx-runtime";

export const one = () => (
	<Column>
		<Label string="ROM screen 1" />
		<Label string="frozen builder, flash" />
	</Column>
);

export const two = () => (
	<Column>
		<Label string="ROM screen 2" />
		<Label string="pushed from ROM" />
		<Label string="main.js: 0 bytes of this" />
	</Column>
);

export const three = () => (
	<Column>
		<Label string="ROM screen 3" />
		<Label string="back pops as usual" />
	</Column>
);
