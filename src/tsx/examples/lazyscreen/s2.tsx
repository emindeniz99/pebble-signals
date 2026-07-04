// The LAZY screen — ships as non-preloaded module `app/s2`; bytecode loads
// from flash on the first `importNow("app/s2")` (lazyscreen.tsx, SELECT).
// Symbol diet on purpose: the ONLY export is `default` (a host-known
// symbol), so this module's boot cost is ~just its module id — see the
// entry's header comment and playbook "The boot floor". The Style is
// created at module load, i.e. also deferred until first visit.
const dim = new Style({ font: "18px Gothic", color: "#AAAAAA" });

export default () => (
	<Column>
		<Label string="screen 2" />
		<Label style={dim} string="(loaded lazily)" />
	</Column>
);
