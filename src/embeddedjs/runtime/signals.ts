// Reactive core — Solid-style signals, ownership, and the React-flavored
// hooks layer in ONE module. Logically these are three units (signals,
// owner, hooks); they share a file because every XS module costs RAM and
// the firmware-fixed 32KB arena is tight enough that two extra module
// records were the difference between the combined demo booting or dying
// with "fxAbort memory full" (measured on SDK 4.17 / gabbro).
// XS-safe: closures, arrays, accessors only. No Proxy/Reflect/WeakMap.
//
// WARNING (measured, README gotcha 13): the firmware's alias budget has
// almost zero headroom. Adding top-level `function`/`class` declarations
// to any preloaded module — even never-called ones — kills the app at
// startup. New module-level helpers must be `const` bindings, and every
// export costs runtime RAM: make it earn its keep.

// Optional host/app diagnostic hook: notify() routes reaction errors here so a
// throwing effect can't abort the XS machine. Declared on globalThis (erases).
// `console` is the Pebble host's logger (host-interned name — free at boot);
// notify() falls back to it so an unhandled reaction error is VISIBLE in
// `pebble logs` instead of a silent blank Label.
declare global {
	// eslint-disable-next-line no-var
	var __spError: ((e: unknown) => void) | undefined;
}

// A reaction is a plain thunk; an effect id indexes into the graph below.
/** A zero-arg effect/cleanup function — the currency of {@link effect}, {@link dispose} and {@link onCleanup}. */
export type EffectFn = () => void;
// console method shape for the notify() fallback logger (the Pebble host
// console only has `log`; Node/browsers have `error` too)
type LogFn = (...args: unknown[]) => void;

// The one lazily-created state record (see the block comment below). Typed as
// an interface so every `G.xxx` access is checked; the runtime keeps it as a
// plain object literal (no class — a class would add a top-level declaration to
// this preloaded module, gotcha 13).
interface Graph {
	e: (EffectFn | null)[]; // effect id -> reaction (null = disposed)
	f: unknown[]; // packed signal id -> value
	sub: Uint32Array; // subscription matrix, s words per signal row
	s: number; // stride: words per row (= 1 + hi-word count)
	n: number; // rows used
	h: number; // word 0 of the live effect-id set
	r: number; // word 0 of the quarantined effect-id set
	m: Uint32Array | null; // live-set hi-words (ids 32+)
	i: Uint32Array | null; // quarantine hi-words
	b: number; // notification cascade depth
	E: number; // batch() nesting depth
	t: number[] | null; // rows whose notify is deferred (settle turns)
	// EVERY property name in this interface is a SINGLE LETTER the firmware
	// ALREADY interns (measured against the gabbro SDK debug ELF —
	// tools/host-symbols.py; the free set is E,b,c,e,f,h,i,m,r,s,t,w,x,y,z).
	// Reason: every archive symbol interns at boot (playbook "The boot floor")
	// and a name the host does NOT know costs one boot slot. Descriptive names
	// (eff/val/st/dep/bat/pend + the single letters n/u/q) were each new-to-host
	// — renaming them to free letters MEASURED navmany 44 → 35 new-to-host
	// (−9 boot slots; only `n` had no free letter left and stays). See the
	// block comment above for the role→field mapping. The three fields below
	// were the first to adopt this, hence their own note:
	y: number; // global write version — lazy computeds validate against it
	// lazy-computed state (SoA triple, one property): x[0][row] fn,
	// x[1][row] last-validated version (-1 = never), x[2][row]
	// forward-effect id. null until the first computed exists.
	x: [((() => unknown) | undefined)[], number[], number[]] | null;
	// running-owner: w[e] = disposables created while effect e ran — nested
	// effects AND tracked cleanups (this subsumed the old separate cln
	// array: a tracked cleanup closure has the exact same timing). null
	// until some running effect tracks something — most never do.
	w: (Disposable[] | null)[] | null;
	// ErrorBoundary routing (2026-07). `c` = the boundary handler in scope
	// RIGHT NOW (set during a boundaried effect's run / a withBoundary build,
	// null otherwise); `z[e]` = the boundary that OWNS effect e, captured at
	// its creation so re-runs (which happen outside the build) still route.
	// Both live on the Graph (chunk memory) rather than as new top-level
	// `let`s: adding a module-scope writable binding would spend an XS alias
	// slot from a near-empty budget (gotcha 13); a Graph field is free of that
	// budget, and `z` stays null until the first ErrorBoundary exists — so
	// apps that never use one pay nothing. NAMES ARE SINGLE LETTERS on purpose
	// (like y/x/w above): a/z single letters are already in the symbol table
	// via the minified runtime, so they cost ZERO new boot symbols — a `cb`/
	// `bnd` pair MEASURED +2 symbols and helped tip a saturated app to death.
	c: ((e: unknown) => void) | null; // current boundary handler
	z: (((e: unknown) => void) | undefined)[] | null; // effect id -> owning boundary
}

let current = -1; // id of the running effect, -1 = none

// ---- packed effect graph (task #15 Stage 1 — measured ~2x cheaper) ----
// An effect is an INTEGER ID, not an object. Tables live in ONE lazily
// created state record (a preload-time buffer would be frozen into ROM):
// NOTE the Graph property names are DELIBERATELY host-known single letters
// (e/f/s/n/h/r/m/i/b/E/t/y/x/w/c/z) — see the interface's rationale block. The
// mnemonics used below (eff/sub/u/q/uh/qh/st) name the ROLES, not the wire
// property; the field each maps to is shown in parentheses.
//   e[id]    (e)   reaction fn (null = disposed — doubles as the zombie guard)
//   sub      (sub) Uint32Array, `s` words per SIGNAL row (32 effect bits each);
//            subscribe is one OR — and the old per-effect dependency
//            array is GONE: reverse edges are implied by the forward
//            masks, so unsubscribe is one AND-NOT pass over the rows.
//   used/qtn (h/r) word 0 of the used / quarantined effect-id sets (effects
//            0-31, the fast path); hi-words (m/i) hold words 1..s-1 and stay
//            null until a 33rd live effect forces the stride to grow (#21).
//   stride   (s)   words per signal row AND (1 + m.length). Starts at 1
//            (single-word core, zero overhead); grows lazily so apps with
//            <=32 effects pay nothing.
// Freed ids are QUARANTINED while a notification cascade is running
// (cascade-depth field b > 0): a set() snapshots masks by value, so without
// quarantine a stale bit could run a freshly reused id.
let G: Graph | null = null;

const gi = (): Graph => {
	let g = G;
	if (g === null)
		// lazy: a preload-time table would be frozen in ROM
		G = g = {
			e: [],
			f: [],
			sub: new Uint32Array(8),
			s: 1,
			n: 0,
			h: 0,
			r: 0,
			m: null,
			i: null,
			b: 0,
			E: 0,
			t: null,
			y: 0,
			x: null,
			w: null,
			c: null,
			z: null,
		};
	return g;
};

const grow = (g: Graph): number => {
	// allocate one subscription row (s words wide). Row capacity is DERIVED
	// (sub.length / s) instead of stored — one division per grow buys back a
	// Graph slot + a boot symbol (CPU for RAM, as always).
	const i = g.n++;
	if ((i + 1) * g.s > g.sub.length) {
		// rows packed contiguously — a flat copy preserves layout
		const s2 = new Uint32Array(g.sub.length << 1);
		s2.set(g.sub);
		g.sub = s2;
	}
	return i;
};

// Widen the stride by one word: every signal row gains a word and the
// used/quarantine hi-word arrays extend. O(rows) copy, run only when the
// live-effect count crosses a 32-bit boundary (32, 64, ...), so amortized
// to nothing. Preserves each row's existing words in place.
const growStride = (g: Graph): void => {
	const os = g.s,
		ns = os + 1;
	const nsub = new Uint32Array((g.sub.length / os) * ns);
	for (let r = 0; r < g.n; r++) for (let w = 0; w < os; w++) nsub[r * ns + w] = g.sub[r * os + w];
	g.sub = nsub;
	if (g.m === null) {
		g.m = new Uint32Array(1);
		g.i = new Uint32Array(1);
	} else {
		const u2 = new Uint32Array(ns - 1);
		u2.set(g.m);
		g.m = u2;
		const q2 = new Uint32Array(ns - 1);
		q2.set(g.i!); // m non-null (this branch) implies i non-null (invariant)
		g.i = q2;
	}
	g.s = ns;
};

const relQ = (g: Graph): void => {
	// cascade over: release quarantined ids. Sole caller is settle()'s
	// finally, which only runs at depth 0 (nested settles bail up front) —
	// so no depth guard is needed here anymore.
	g.h &= ~g.r;
	g.r = 0;
	const uh = g.m;
	if (uh !== null)
		// m non-null implies i non-null (invariant); `!` erases, emit unchanged
		for (let k = 0; k < uh.length; k++) {
			uh[k] &= ~g.i![k];
			g.i![k] = 0;
		}
};

// Drain deferred notifications in COALESCED TURNS (the glitch-free half of
// the 2026-07 core round). Each turn unions the subscriber masks of every
// row touched since the last turn, so an effect reached via several paths
// (the diamond) runs ONCE per turn; writes made BY those effects queue the
// next turn instead of cascading recursively. Skips when a batch() or an
// outer settle is active — that drainer owns the queue.
const settle = (g: Graph): void => {
	if (g.E > 0 || g.b > 0) return;
	g.b++;
	try {
		while (g.t !== null) {
			const rows = g.t;
			g.t = null; // writes during this turn queue the NEXT turn
			const st = g.s,
				sub = g.sub;
			for (let wi = 0; wi < st; wi++) {
				// union the touched rows' masks — effect-level dedupe (Solid
				// batch semantics, now on EVERY write)
				let acc = 0;
				for (let k = 0; k < rows.length; k++) acc |= sub[rows[k] * st + wi];
				const off = wi << 5;
				while (acc) {
					const b = acc & -acc;
					acc &= acc - 1;
					notify(off + 31 - Math.clz32(b));
				}
			}
		}
	} finally {
		g.b--;
		relQ(g);
	}
};

const flush = (g: Graph, i: number): void => {
	// defer + dedupe the row, then drain unless a batch/turn already owns it
	const p = g.t || (g.t = []);
	if (p.indexOf(i) < 0)
		// linear: turn queues are few rows (no Set — XS rule)
		p.push(i);
	settle(g);
};

// Signals keep the object API (`.value`) — Stage 1 packs only the graph.
// `i` is the signal's row in G.sub, allocated LAZILY on first subscribe:
// never-watched signals own no row at all.
/**
 * The object-API signal cell returned by {@link signal}: read/write through
 * `.value` (reads inside an effect/binding subscribe; same-value writes are
 * dropped). Exported as a TYPE ONLY — construct with `signal(v)`, never
 * `new`; the class itself stays module-private (packed-core internals).
 */
class Signal<T> {
	v: T;
	i: number;
	constructor(value: T) {
		this.v = value;
		this.i = -1;
	}
	get value(): T {
		// eff[current] check: an effect disposed WHILE RUNNING (its subtree
		// torn down by an outer effect it triggered) must not re-subscribe
		// as a permanent zombie.
		if (current >= 0 && G!.e[current]) {
			const g = G!;
			let i = this.i;
			if (i < 0) i = this.i = grow(g);
			g.sub[i * g.s + (current >> 5)] |= 1 << (current & 31);
		}
		return this.v;
	}
	set value(value: T) {
		if (value === this.v) return;
		this.v = value;
		const g = G;
		if (g !== null) g.y++; // lazy computeds re-validate on read
		const i = this.i;
		if (i < 0)
			// never subscribed
			return;
		flush(g!, i); // deferred + coalesced (see settle)
	}
}

/**
 * A derived, read-only reactive value — what {@link computed} returns. Reading
 * `.value` inside an effect subscribes; writing it is a type error (a computed
 * is recomputed from its dependencies, never assigned).
 */
export interface ReadonlySignal<T> {
	readonly value: T;
}

// Format a caught reaction error for the console fallback — dump EVERYTHING
// we can (type, message, stack) so a would-be silent blank becomes a loud,
// complete log line. XS may or may not populate `.stack`; whatever it gives
// us, we print.
function fmtError(err: unknown): string {
	if (err && typeof err === "object") {
		const e = err as { name?: string; message?: string; stack?: string };
		const head = (e.name || "Error") + (e.message ? ": " + e.message : "");
		const st = e.stack;
		if (!st) return head;
		// XS and V8 stacks already open with the "Name: message" line — don't
		// print it twice (measured on the gabbro crash screen, where every
		// duplicated line costs visible space).
		return st.indexOf(head) === 0 ? st : head + "\n" + st;
	}
	return String(err);
}

// Top-level failure sink, installed by render() (jsx-runtime). Three states:
//   fn    — render()'s default boundary: report() hands the error over and
//           the fn paints the crash screen (2026-07 redesign).
//   true  — strict boundary (`render(..., {boundary:false})`): report() logs
//           the FULL error first, then RETHROWS so the failure propagates
//           (on device: fxAbort + stack — dead but loud).
//   null  — no boundary (bare core / tests / render never called): report()
//           logs and CONTAINS, the pre-boundary behavior.
let sink: ((err: unknown, msg: string) => void) | true | null = null;

/**
 * Install the top-level error sink — the jsx-runtime's `render()` calls this;
 * apps normally never do. A function receives every escalated error (plus the
 * formatted message) and owns what happens next; `true` means "log fully,
 * then rethrow"; `null` restores the bare log-and-contain default.
 */
export function setSink(s: ((err: unknown, msg: string) => void) | true | null): void {
	sink = s;
}

/**
 * Report a caught reactive error — the shared "loud failure" channel. The
 * escalation ladder (2026-07 redesign — owner decision: telling the wearer
 * the app crashed beats a silently frozen watchface):
 * 1. `globalThis.__spError` installed → the handler owns the policy entirely
 *    (contain by returning, escalate by rethrowing — dev strict mode). It
 *    also owns LOGGING — report() prints nothing for it.
 * 2. Else: log the FULL error (type, message, stack, raw object) through the
 *    host console — ALWAYS, even when a boundary is about to catch it
 *    (owner decision: a caught error is still worth seeing in the log;
 *    on release firmware the line is a trace no-op anyway, so it is free
 *    where it can't be read and visible everywhere it can).
 * 3. Then dispatch: the nearest `<ErrorBoundary>` in scope catches it (its
 *    fallback shows the error); else the sink — render()'s default sink
 *    paints the crash screen, the strict sink (`boundary:false`) rethrows,
 *    no sink (bare core) means the log was it: contain.
 *
 * Hard-won constraints baked in (device receipts, 2026-07):
 * - The Pebble host console is `Object.freeze({log})` — NO `.error`. An
 *   unconditional `.error()` call here threw inside notify()'s catch and
 *   fxAbort'ed the machine on gabbro. So: prefer error, fall back to log,
 *   and the logger itself must NEVER throw.
 * - On release firmware JS `trace` (which host console.log wraps) is a
 *   no-op, so the log line only reaches `pebble logs` on debug hosts/xsbug —
 *   but `__spError` always works, Node tests always see it, and the crash
 *   screen is visible on the WATCH itself.
 * - console/error/log are host-interned names — zero boot-symbol cost.
 * Exported for the jsx-runtime binding guard (which adds prop/node
 * context); apps may also call it from their own try/catch.
 */
export function report(err: unknown, ctx: string): void {
	// 1. __spError is the ultimate override (dev/strict) — it sees EVERY error,
	//    even inside an ErrorBoundary, so a rethrowing handler still crashes
	//    loudly for debugging.
	const h = globalThis.__spError;
	if (h) {
		h(err);
		return;
	}
	// 2. log FIRST, unconditionally — boundary-caught errors included (owner
	//    call: harmless where invisible, useful where visible).
	const msg = "[signal-piu] " + ctx + ":\n" + fmtError(err);
	const c = (globalThis as { console?: { error?: LogFn; log?: LogFn } }).console;
	const f = c && (c.error || c.log);
	// Pass BOTH a fully-formatted string (nothing lost on consoles that
	// can't expand objects) AND the raw error (everything shown on ones
	// that can). Over-logging is harmless on a rare failure path.
	if (f) f.call(c, msg, err);
	// 3. the nearest ErrorBoundary in scope catches it (the fallback receives
	//    the error and shows it). g.c is set during a boundaried effect's run
	//    (see run()) and re-set by notify() around this call for the
	//    uncaught-effect path.
	const g0 = G;
	if (g0 !== null && g0.c !== null) {
		g0.c(err);
		return;
	}
	// 4. no boundary: the terminal sink (crash screen / strict rethrow / contain).
	const s = sink;
	if (s === true) throw err; // strict: logged in full above, now die loudly
	if (s !== null) s(err, msg); // render()'s boundary: paint the crash screen
}

// Route subscriber exceptions through report() instead of letting them
// abort the machine unseen — the installed sink/handler decides whether the
// app shows a crash screen, dies loudly (strict), or contains (bare core).
// A BINDING catches inside its own guard (jsx-runtime) while g.c is still
// set by run(); this catch is for effects whose fn threw UNCAUGHT (useEffect,
// a computed's forward effect), where run()'s finally already cleared g.c —
// so re-establish the effect's boundary before report() consults it.
function notify(e: number): void {
	try {
		run(e);
	} catch (err) {
		const g = G!;
		const pb = g.c;
		g.c = (g.z && g.z[e]) || null;
		try {
			report(err, "uncaught in reactive update (effect #" + e + ")");
		} finally {
			g.c = pb;
		}
	}
}

const run = (e: number): void => {
	const g = G!;
	const fn = g.e[e];
	if (!fn)
		// disposed mid-notification — do not resurrect
		return;
	unsubscribe(e);
	const prev = current;
	const po = owner;
	const pb = g.c; // ErrorBoundary in scope for THIS effect (and its children)
	current = e;
	owner = e; // running-owner (B9): trackables created during the run belong
	// to THIS effect and are disposed before its next run / at its disposal
	// Re-establish the effect's owning boundary so its binding guard reports
	// to it AND any nested effect it creates inherits it (bnd null = no cost).
	g.c = (g.z && g.z[e]) || null;
	try {
		fn();
	} finally {
		current = prev;
		owner = po;
		g.c = pb;
	}
};

// Drain a disposables list UNTRACKED and contained. Untracked (Solid):
// cleanups can fire while ANOTHER effect is mid-run (a creation-run write
// cascading into a re-run) — a signal read inside a cleanup must not
// subscribe that on-stack effect (reproduced). Contained: a THROWING cleanup
// must not orphan its sibling disposables (reproduced) — report() it, finish
// the drain. Lives as a SEPARATE helper on purpose: its try/catch scaffolding
// would otherwise sit in unsubscribe's frame, which is live at MAX render
// depth on every effect creation (Round 7 stack budget — measured: inlining
// this tipped navmany over the 384-slot value stack).
const drainDisposables = (list: Disposable[]): void => {
	const pc = current;
	current = -1;
	try {
		for (let i = list.length - 1; i >= 0; i--)
			try {
				dispose(list[i]);
			} catch (err) {
				report(err, "cleanup threw during dispose");
			}
	} finally {
		current = pc;
	}
};

// Runs the user cleanup (if any) and drops every subscription of effect e
// in ONE masked pass over the signal rows (CPU for RAM: rows are few and
// the pass allocates nothing). Called both before every re-run and on
// disposal, giving useEffect the React contract: cleanup fires before the
// next run and once more at dispose.
function unsubscribe(e: number): void {
	const g = G!;
	// running-owner: dispose everything the PREVIOUS run created — nested
	// effects and tracked cleanups alike (this list replaced the old cln
	// array: a tracked cleanup closure runs at exactly the same moments,
	// before every re-run and once more at disposal)
	const list = g.w !== null && g.w[e];
	if (list) {
		g.w![e] = null;
		drainDisposables(list);
	}
	// effect e lives in word (e>>5) of every row; clear just that word.
	const sub = g.sub,
		st = g.s,
		word = e >> 5,
		m = ~(1 << (e & 31)),
		rows = g.n;
	for (let s = 0; s < rows; s++) sub[s * st + word] &= m;
}

/**
 * Create a reactive value. Reading `.value` inside an {@link effect} (or a JSX
 * binding thunk) subscribes to it; writing `.value` notifies subscribers. The
 * build lowers `const s = signal(v)` to the packed integer {@link S} API.
 * @param value initial value
 */
export function signal<T>(value: T): Signal<T> {
	return new Signal(value);
}

// ---- packed signals — the Stage 2 lowering target -------------------------
// A packed signal is an INTEGER: the id doubles as its subscription row and
// indexes G.f (ONE slot per value instead of a ~4-slot Signal object).
// build.mts lowers `const [x, setX] = useState(v)` to this API at compile
// time (tools/lower.py): x() -> S.get(x), setX(e) -> S.set(x, e). Authoring
// DX is unchanged and the per-state getter/setter closures never exist at
// runtime. set() keeps useState's functional-update contract.
/**
 * Packed lowering target — integer-id signals with zero per-signal objects.
 * `build.mts` rewrites `useState`/`signal`/`computed` to this at compile time;
 * you rarely call it by hand.
 */
export const S = {
	/** Allocate a packed signal, return its integer id. */
	sig(v: unknown): number {
		const g = gi();
		const i = grow(g);
		g.f[i] = v;
		return i;
	},
	/** Read packed signal `i` (subscribes the current effect; pulls a stale computed). */
	get<T>(i: number): T {
		const g = G!;
		// subscribe the reader to this row FIRST — before any recompute below.
		// A computed whose fn() THROWS rethrows out of get() (poisoned-computed
		// contract), which would skip a subscribe placed after the recompute;
		// the reader would then never be notified when a dependency later
		// changes, so a boundaried UI could not recover. Idempotent bit-set.
		if (current >= 0 && g.e[current]) g.sub[i * g.s + (current >> 5)] |= 1 << (current & 31);
		const cx = g.x;
		if (cx !== null) {
			// lazy computed pull (glitch-free): recompute on READ when any
			// write happened since this row last validated — the recursion
			// through the sources' own S.get reads IS the topological order.
			// A disposed computed (forward effect gone) freezes at its last
			// value instead of recomputing.
			const fn = cx[0][i];
			if (fn !== undefined && cx[1][i] !== g.y && g.e[cx[2][i]]) {
				cx[1][i] = g.y; // before fn: a re-entrant read sees "current"
				const e = cx[2][i];
				unsubscribe(e); // re-track sources on every recompute
				const prev = current;
				const po = owner;
				current = e;
				owner = e; // trackables created by fn belong to the computed
				let ok = false;
				try {
					g.f[i] = fn();
					ok = true;
				} finally {
					// throw path: stay INVALID — a poisoned computed must rethrow
					// on EVERY read until a dep changes, never serve the stale
					// cache as valid (reproduced). Flag-in-finally instead of a
					// catch clause: a catch adds XS value-stack scaffolding to a
					// frame that is live at MAX render depth (Round 7 budget).
					if (!ok) cx[1][i] = -1;
					current = prev;
					owner = po;
				}
			}
		}
		return g.f[i] as T;
	},
	/** Functional-update write (the `useState` setter contract). */
	set<T>(i: number, v: T | ((prev: T) => T)): void {
		const g = G!;
		if (typeof v === "function") v = (v as (prev: unknown) => unknown)(g.f[i]) as T;
		if (v === g.f[i]) return;
		g.f[i] = v;
		g.y++;
		flush(g, i);
	},
	// RAW write — no functional-update unwrap. The Stage-3 target for direct
	// `s.value = e`: the object API stores a function value verbatim, so the
	// lowered form must too (S.set would CALL it as an updater — measured
	// semantic drift, not a theoretical one).
	/** RAW write — stores a function verbatim (the `signal.value =` contract). */
	put<T>(i: number, v: T): void {
		const g = G!;
		if (v === g.f[i]) return;
		g.f[i] = v;
		g.y++;
		flush(g, i);
	},
	// Packed LAZY computed (glitch-free core round, 2026-07): one value slot
	// + a FORWARD effect that only propagates "something upstream changed" to
	// the row's subscribers — it never recomputes. Recompute happens on READ
	// (S.get above), validated against G.gv, pulling each source first. The
	// forward effect is auto-registered with the current owner (running
	// effect or root), so disposing the subtree freezes the computed.
	/** Packed lazy memo: one value slot + one forward (mark) effect. */
	computed(fn: () => unknown): number {
		const g = gi();
		const i = grow(g);
		const cx = g.x || (g.x = [[], [], []]);
		cx[0][i] = fn;
		cx[1][i] = -1; // never validated — first read computes
		cx[2][i] = effect(() => {
			flush(g, i);
		});
		return i;
	},
};

// Returns the effect ID (an integer — costs ZERO slots), not an object or
// a disposer closure. Dispose with dispose(id) (or register with track(),
// whose owner terminates closures and ids alike).
/**
 * Run `fn` now and re-run it whenever a signal it READ changes. Dependencies
 * are re-tracked every run (conditional deps work). Returns an integer effect
 * id — dispose with {@link dispose}, or {@link track} it to an owner. A bare
 * `effect()` is NOT auto-owned; the hooks ({@link useEffect}) track for you.
 */
export function effect(fn: EffectFn): number {
	const g = gi();
	let e!: number; // every branch below assigns it before use (definite-assign)
	const m0 = ~(g.h | g.r); // word 0 — the fast path (effects 0-31)
	if (m0) {
		const b = m0 & -m0;
		e = 31 - Math.clz32(b);
		g.h |= b;
	} else {
		// word 0 full: scan hi-words, else widen the stride by one word
		let wi = 1;
		for (; wi < g.s; wi++) {
			const mh = ~(g.m![wi - 1] | g.i![wi - 1]);
			if (mh) {
				const b = mh & -mh;
				e = (wi << 5) + 31 - Math.clz32(b);
				g.m![wi - 1] |= b;
				break;
			}
		}
		if (wi === g.s) {
			// all words full — grow, take bit 0 of the new word
			growStride(g);
			g.m![wi - 1] |= 1;
			e = wi << 5;
		}
	}
	g.e[e] = fn;
	// ErrorBoundary capture: if an <ErrorBoundary> is in scope, remember which
	// one owns this effect so a LATER re-run (which happens outside the build)
	// still routes its throw to the fallback. `bnd` is allocated on the first
	// boundary ever — a boundary-free app keeps it null and pays nothing.
	if (g.c !== null) (g.z || (g.z = []))[e] = g.c;
	// Running-owner (B9): auto-register with the innermost context — the
	// running effect or the current root — BEFORE the first run, so a
	// throwing initial run is still torn down by its root. A top-level
	// effect (no context) stays manual, as before.
	track(e);
	run(e);
	return e;
}

// Terminal disposal for anything an owner can hold: a plain closure (root
// disposers, onCleanup callbacks) or a packed effect id.
/** Terminal disposal for a closure disposer or a packed effect id. */
export function dispose(d: number | EffectFn): void {
	if (typeof d === "function") {
		d();
		return;
	}
	const g = G;
	if (!g || !g.e[d]) return;
	g.e[d] = null; // run() becomes a no-op — no resurrection
	if (g.z) g.z[d] = undefined; // drop the boundary tag so a reused id can't inherit it
	// If d was a computed's FORWARD effect, clear the computed's fn so the
	// freeze is permanent: without this, a later reuse of the id makes
	// `g.e[cx[2][i]]` truthy again and S.get resurrects the recompute path —
	// running unsubscribe(d) against the INNOCENT reusing effect (reproduced:
	// wiped its subscriptions and re-ran the "frozen" computed).
	const cx = g.x;
	if (cx !== null) {
		const fw = cx[2];
		// clear EVERY row whose forward-id is d, no `break`: a reused id can
		// leave more than one cx[2] entry === d (an earlier disposed computed's
		// stale entry plus the one being disposed now). Stopping at the first
		// match left the newer computed's fn in place, so a later reuse of the
		// id resurrected its recompute path and unsubscribed the innocent
		// reusing effect. Clearing all matches freezes every one permanently.
		for (let k = 0; k < fw.length; k++) if (fw[k] === d) cx[0][k] = undefined;
	}
	unsubscribe(d);
	const word = d >> 5,
		b = 1 << (d & 31);
	if (g.b > 0) {
		// freed mid-cascade: quarantine until it completes
		if (word === 0) g.r |= b;
		else g.i![word - 1] |= b;
	} else {
		if (word === 0) g.h &= ~b;
		else g.m![word - 1] &= ~b;
	}
}

// LAZY computed (2026-07 core round) — a facade over the packed lazy memo:
// recompute happens on READ (validated against the global write version,
// pulling sources first), never on notify, which is what makes the diamond
// glitch-free (conformance law 12 = MATCH). The forward effect registers
// with the current owner via effect()'s auto-tracking, so disposing the
// subtree that created the computed freezes it.
/**
 * Memoized derived signal, LAZY and glitch-free: `fn` re-runs on read when a
 * dependency changed, and its value is cached across reads. Costs one internal
 * effect — prefer a plain thunk `() => a.value + b.value` unless the value is
 * read in many places.
 */
export function computed<T>(fn: () => T): ReadonlySignal<T> {
	const i = S.computed(fn);
	return {
		get value(): T {
			return S.get(i);
		},
	};
}

// Batch writes: N sets inside fn produce ONE notification pass per touched
// signal, after fn returns — subscribers see final values only. On the 32KB
// arena this is the cheap way to update several signals from one button press
// without re-running shared effects N times. Nests; exception-safe (the
// deferred flushes still run). Values are written eagerly (reads inside the
// batch see the new value); only NOTIFICATION is deferred — Solid's contract.
/**
 * Coalesce writes: N `.value` sets inside `fn` produce ONE notification per
 * subscriber (union of touched signals), after `fn` returns. Reads inside the
 * batch see new values eagerly; only notification defers (Solid semantics).
 */
export function batch<T>(fn: () => T): T {
	const g = gi();
	g.E++;
	try {
		return fn();
	} finally {
		--g.E;
		// settle() owns the coalescing (every write goes through the same
		// union-of-masks turn since the glitch-free round); a batch just
		// holds the turn open until it exits. No-op while nested.
		if (g.t !== null) settle(g);
	}
}

/** Read signals inside `fn` WITHOUT subscribing to them. */
export function untrack<T>(fn: () => T): T {
	const prev = current;
	current = -1;
	try {
		return fn();
	} finally {
		current = prev;
	}
}

// ErrorBoundary plumbing (the <ErrorBoundary> component in flow.ts is the only
// caller). `const` arrow form, not `export function` — a new top-level
// function declaration spends an XS alias slot (gotcha 13); both are also
// pruned out of the archive for apps that never import ErrorBoundary (the
// build's export-prune pass), so a boundary-free app carries zero cost.

// Run `fn` with `handler` installed as the boundary in scope: every effect
// created during `fn` is tagged (see effect()) so its later throws route to
// `handler`. Restores the previous boundary on exit (nesting-safe).
// `handler` may be null — that runs `fn` with NO boundary in scope, which is
// how ErrorBoundary escalates OUT of itself (a fallback that threw routes to
// the parent boundary, or to the terminal sink when there is no parent —
// never back into the boundary that is already failing).
/** Run `build` with `handler` as the active ErrorBoundary (internal — see flow's ErrorBoundary). */
export const withBoundary = <T>(handler: ((e: unknown) => void) | null, fn: () => T): T => {
	const g = gi();
	const prev = g.c;
	g.c = handler;
	try {
		return fn();
	} finally {
		g.c = prev;
	}
};

/** The ErrorBoundary handler currently in scope (null = none) — for nesting a fallback under its parent. */
export const getBoundary = (): ((e: unknown) => void) | null => (G ? G.c : null);

// ---- ownership & disposal ----------------------------------------------
// Every effect created while building a subtree is registered on the
// current owner; disposing the owner disposes the subtree. Leaked effects
// are the #1 correctness risk in this design.

// An owner holds the disposables (effect ids or closures) created in its
// subtree. Since the running-owner round (B9), the owner context is either a
// root's Owner OBJECT or the NUMERIC id of the currently-running effect —
// the numeric form costs nothing per run; its disposables list (G.own[e])
// is only allocated when a run actually tracks something.
/** What {@link track} accepts: a cleanup function, or an effect id returned by {@link effect}. */
export type Disposable = number | EffectFn;
interface Owner {
	d: Disposable[];
}
let owner: Owner | number | null = null;

/**
 * Run `fn` under a fresh owner; returns `[result, disposer]`. Calling the
 * disposer tears down every effect/cleanup {@link track}ed during `fn`.
 */
export function createRoot<T>(fn: () => T): [T, () => void] {
	const o: Owner = { d: [] };
	const prev = owner;
	owner = o;
	const disposer = () => {
		drainDisposables(o.d); // untracked + contained (see the helper)
		o.d.length = 0;
	};
	let result: T;
	try {
		result = fn();
	} catch (e) {
		// build threw: restore the owner, tear down whatever effects it already
		// created (else they leak — the disposer never reaches the caller), rethrow.
		owner = prev;
		disposer();
		throw e;
	}
	owner = prev;
	return [result, disposer];
}

/** Register a cleanup to run when the current owner is disposed. */
export function onCleanup(fn: EffectFn): void {
	track(fn);
}

// Register a disposable (effect id or closure) with the innermost owner
// context: a running effect (numeric — its list lives in G.own, disposed
// before every re-run and at disposal) or a createRoot owner object.
/** Register an effect id / disposer with the current owner; returns it. */
export function track(disposable: Disposable): Disposable {
	const o = owner;
	if (o !== null) {
		if (typeof o === "number") {
			const g = G!; // a numeric owner implies a running effect, so G exists
			// Owner already disposed ITSELF mid-run (an effect that stops its own
			// root): nothing will ever drain w[o] again — dispose the trackable
			// NOW instead of parking it on a dead id, where it would leak and
			// then fire when an unrelated effect reuses the id (reproduced).
			if (!g.e[o]) {
				dispose(disposable);
				return disposable;
			}
			const own = g.w || (g.w = []);
			(own[o] || (own[o] = [])).push(disposable);
		} else o.d.push(disposable);
	}
	return disposable;
}

// ---- hooks — React-flavored comfort layer --------------------------------
// Differences from React (see README): components run once; read state by
// CALLING the getter (count()); pass reactive props as thunks.

/**
 * React-style state, Solid semantics: returns `[getter, setter]` where the
 * getter is a CALL — `count()`, not `count`. The setter takes a value or a
 * functional update `setCount(c => c + 1)`. Lowered to the packed {@link S} API.
 */
export function useState<T>(init: T): [() => T, (v: T | ((prev: T) => T)) => void] {
	const s = new Signal(init);
	return [
		() => s.value as T,
		(v: T | ((prev: T) => T)) => {
			// the updater's prev-read is RAW (s.v, not s.value): a tracked read
			// would subscribe the CALLING effect to its own state — an idiomatic
			// setCount(c => c+1) inside an effect then loops settle forever
			// (reproduced). Also matches the lowered S.set, which reads g.f raw.
			s.value = typeof v === "function" ? (v as (prev: T) => T)(s.v as T) : v;
		},
	];
}

// No dependency array — tracking is automatic. An optional returned
// function becomes the cleanup: it runs before every re-run of the effect
// and once more when the owning subtree is disposed (stored on the Effect
// itself — registering with the owner would only capture the FIRST run's
// cleanup, since re-runs happen outside any owner context).
/**
 * Auto-tracked effect (no dependency array). An optional returned function is
 * the cleanup: it runs before every re-run and once more at dispose.
 */
export function useEffect(fn: () => void | EffectFn): void {
	// effect() auto-registers with the innermost owner (running-owner round);
	// a returned cleanup is simply TRACKED on the running effect — the owned
	// list runs it before the next re-run and once more at disposal, which is
	// exactly the React contract the old dedicated cln array implemented.
	effect(() => {
		const out = fn();
		if (typeof out === "function") track(out);
	});
}

// PERF: like computed(), this allocates ONE internal effect to keep the
// derived value live. Cheap (effect ids are integers, and the cap is now
// unlimited — #21), but a screen with dozens of useMemo/computed pays one
// effect each; prefer a plain thunk `() => a() + b()` when you don't need the
// value cached across reads.
/** Memoized getter over {@link computed}: `const total = useMemo(() => a() + b())`. */
export function useMemo<T>(fn: () => T): () => T {
	const c = computed(fn);
	return () => c.value;
}

/**
 * Mutable box that never notifies — React's useRef. (useCallback is
 * deliberately absent: components run ONCE here, so a plain closure is
 * already stable; there is nothing to memoize against.)
 */
export function useRef<T>(v: T): { current: T } {
	return { current: v };
}

/**
 * React's useReducer, trivially over useState. `dispatch(action)` applies the
 * reducer as a functional update, so it composes with batching and lowering.
 */
export function useReducer<S, A>(
	reducer: (s: S, a: A) => S,
	init: S,
): [() => S, (action: A) => void] {
	const [get, set] = useState(init);
	return [get, (action: A) => set((s: S) => reducer(s, action))];
}

/**
 * onMount(fn): run fn ONCE, untracked. In this run-once model a component body
 * already executes a single time as it builds, so this is just "do it once,
 * without subscribing" — the place to start a timer or kick a fetch. (There is
 * no separate post-layout phase like the DOM's; fn runs during the build.)
 */
export function onMount(fn: () => void): void {
	untrack(fn);
}

/**
 * Context — pass a value down the (synchronous, run-once) build without
 * threading props. createContext(default) -> ctx; provide(ctx, value, build)
 * sets ctx for the duration of build() (children read it via useContext);
 * useContext(ctx) reads the current value. No Symbol/Map (XS rule): a context
 * is a one-field record and provide() is a save/restore around the subtree,
 * which is exactly right because children build synchronously inside build().
 */
export function createContext<T>(defaultValue: T): { v: T } {
	return { v: defaultValue };
}
export function useContext<T>(ctx: { v: T }): T {
	return ctx.v;
}
export function provide<T, R>(ctx: { v: T }, value: T, build: () => R): R {
	const prev = ctx.v;
	ctx.v = value;
	try {
		return build();
	} finally {
		ctx.v = prev;
	}
}

// ---- async resource -------------------------------------------------------
// The RN/Solid "fetch → {loading,error,data}" primitive, sized for 32KB: TWO
// Signal objects total. `v` holds the data; `st` is a TAGGED slot — 0 while
// loading, 1 when ready, and otherwise the error value itself (no third
// signal, no per-transition state records). loading()/error() derive from st
// reactively, so a binding like `string={() => r.loading() ? "…" : r.data()}`
// re-renders exactly on transitions.

/** What {@link createResource} returns — reactive thunks over one in-flight fetch. */
export interface Resource<T> {
	/** Latest fetched value; `undefined` until the first success. Reactive. */
	data: () => T | undefined;
	/** True while a fetch is in flight. Reactive. */
	loading: () => boolean;
	/** Rejection value of the LAST fetch, or `undefined`. Reactive. */
	error: () => unknown;
	/** Start the fetcher again (stale responses from older calls are dropped). */
	refetch: () => void;
}

/**
 * Async data: run `fetcher` now, expose `{loading, error, data, refetch}` as
 * reactive thunks. Out-of-order completions are dropped (only the newest call
 * may settle the resource). On Pebble, `fetch()` proxies through the phone
 * (`@moddable/pebbleproxy`, README gotcha 18) and its Response allocations are
 * heavy for the 32KB arena — keep fetch-using apps lean and prefer decoding
 * into a byte {@link createStore} over retaining parsed objects.
 */
export function createResource<T>(fetcher: () => Promise<T>): Resource<T> {
	const v = new Signal<T | undefined>(undefined);
	// 0 = loading, 1 = ready, anything else = the rejection value. (A fetcher
	// that REJECTS with literal 0 or 1 would be misread — rejections are Error
	// values in practice; two slots instead of three signals is the 32KB trade.)
	const st = new Signal<unknown>(0);
	let gen = 0; // drops stale settlements from superseded refetches
	const start = () => {
		const id = ++gen;
		st.value = 0;
		fetcher().then(
			(value) => {
				if (id !== gen) return; // a newer refetch superseded this one
				// atomic flip: no subscriber may observe [loading, data] half-updated
				batch(() => {
					v.value = value;
					st.value = 1;
				});
			},
			(err) => {
				if (id !== gen) return;
				st.value = err;
			},
		);
	};
	start();
	return {
		data: () => v.value,
		loading: () => st.value === 0,
		error: () => {
			const s = st.value;
			return s === 0 || s === 1 ? undefined : s;
		},
		refetch: start,
	};
}

// ---- typed byte-record store ---------------------------------------------
// Collections kept as plain JS objects cost ~450B of slots per row and kill
// the arena at 4-5 rows (measured; README). A Store keeps records as BYTES
// in one Uint8Array — [tag][len][payload] — so a record costs its payload
// bytes, not slots. Primitives encode automatically (int32, float64, string
// of ≤255 Latin-1 bytes, boolean, null); custom types register a codec with
// def() and pass their tag to push(). Value semantics: data moves in and
// out BY COPY — this is a serialization store, not an object heap (no live
// references, functions, or Piu nodes).
// Platform rules honored: every binding below is a `const` (gotcha 13 —
// new function/class declarations in a preloaded module kill the machine),
// fields are constructor-initialized (gotcha 10), and the float scratch is
// allocated LAZILY at runtime — a buffer created at preload time would be
// frozen into ROM and unwritable.

const T_I32 = 0,
	T_F64 = 1,
	T_STR = 2,
	T_TRUE = 3,
	T_FALSE = 4,
	T_NULL = 5;

// Custom codec: encode writes the payload (returns its byte length, or -1 if it
// needs more than `max`); decode reads it back.
export type Encode = (value: unknown, bytes: Uint8Array, offset: number, max: number) => number;
export type Decode = (bytes: Uint8Array, offset: number, length: number) => unknown;

/**
 * The public surface of a byte-record store — what {@link createStore} returns.
 * Values move in and out BY COPY (serialization store, not an object heap), so
 * `get` is honestly `unknown`: the record's runtime tag decides the type.
 */
export interface ByteStore {
	/** Number of records currently stored. */
	count(): number;
	/** Register a custom codec under tag 8..255 (see {@link Encode}/{@link Decode}). */
	def(tag: number, encode: Encode, decode: Decode): void;
	/** Append a value (pass `tag` for custom types). New count, or -1 if it doesn't fit. */
	push(v: unknown, tag?: number): number;
	/** Decode record `i` by copy; `undefined` when out of range. */
	get(i: number): unknown;
	/** Remove record `i` (tail shifts down). New count, or -1 when out of range. */
	remove(i: number): number;
	/** Persist the raw record bytes under `k` in the host's localStorage. */
	save(k: string): void;
	/** Restore records saved under `k`; false on missing/oversize/corrupt data. */
	load(k: string): boolean;
}

const Store = class {
	b: Uint8Array;
	t: number;
	n: number;
	c: Record<number, [Encode, Decode]> | null;
	f: Float64Array | null;
	fb: Uint8Array | null;
	constructor(size: number) {
		this.b = new Uint8Array(size);
		this.t = 0; // bytes used (records are always compact)
		this.n = 0; // record count
		this.c = null; // custom codecs: tag -> [encode, decode]
		this.f = null; // lazy float64 scratch
		this.fb = null; // byte view over this.f
	}
	count(): number {
		return this.n;
	}
	// Register a custom codec under tag 8..255. encode(value, bytes, offset,
	// max) writes the payload and returns its length, or -1 if it needs more
	// than max; decode(bytes, offset, length) returns the value.
	def(tag: number, encode: Encode, decode: Decode): void {
		// tags 0-7 are reserved for built-ins (I32/F64/STR/TRUE/FALSE/NULL +
		// two spare) and a codec registered there would be silently misread by
		// get() as a built-in; a tag past 255 truncates into the byte header;
		// a fractional/NaN tag registers under an object key (`"8.5"`) that
		// push() then writes to the header as a DIFFERENT integer. Fail loud
		// instead of corrupting on read.
		if (!Number.isInteger(tag) || tag < 8 || tag > 255)
			throw new Error("store: custom tag must be an integer 8..255, got " + tag);
		if (this.c === null) this.c = {};
		this.c[tag] = [encode, decode];
	}
	// Append a value; pass `tag` only for custom types. Returns the new
	// count, or -1 when the value does not fit (store full or payload >255B).
	push(v: unknown, tag?: number): number {
		const b = this.b,
			off = this.t + 2;
		const max = b.length - off; // may be negative when nearly full
		let len!: number;
		if (tag !== undefined) {
			const codec = this.c && this.c[tag];
			if (!codec)
				// def(tag,...) never registered — fail with a clear signal
				throw new Error("store: no codec for tag " + tag);
			len = codec[0](v, b, off, max < 0 ? 0 : max);
		} else if (typeof v === "number") {
			if (Number.isInteger(v) && v >= -0x80000000 && v <= 0x7fffffff) {
				tag = T_I32;
				len = 4;
				if (len <= max) {
					b[off] = v & 255;
					b[off + 1] = (v >> 8) & 255;
					b[off + 2] = (v >> 16) & 255;
					b[off + 3] = (v >> 24) & 255;
				}
			} else {
				tag = T_F64;
				len = 8;
				if (len <= max) {
					this.fl();
					this.f![0] = v;
					for (let i = 0; i < 8; i++) b[off + i] = this.fb![i];
				}
			}
		} else if (typeof v === "string") {
			tag = T_STR;
			len = v.length;
			if (len <= max && len <= 255)
				for (let i = 0; i < len; i++) b[off + i] = v.charCodeAt(i) & 255;
		} else if (v === true) {
			tag = T_TRUE;
			len = 0;
		} else if (v === false) {
			tag = T_FALSE;
			len = 0;
		} else if (v === null || v === undefined) {
			tag = T_NULL;
			len = 0;
		} else return -1; // objects need a registered codec + explicit tag
		if (len < 0 || len > 255 || len > max) return -1;
		b[this.t] = tag;
		b[this.t + 1] = len;
		this.t += 2 + len;
		return ++this.n;
	}
	get(i: number): unknown {
		const p = this.o(i);
		if (p < 0) return undefined;
		const b = this.b,
			tag = b[p],
			len = b[p + 1],
			off = p + 2;
		switch (tag) {
			case T_I32:
				return b[off] | (b[off + 1] << 8) | (b[off + 2] << 16) | (b[off + 3] << 24) | 0;
			case T_F64:
				this.fl();
				for (let j = 0; j < 8; j++) this.fb![j] = b[off + j];
				return this.f![0];
			case T_STR:
				// apply over a subarray view: 1 allocation instead of one
				// intermediate string per character
				return len
					? String.fromCharCode.apply(String, b.subarray(off, off + len) as unknown as number[])
					: "";
			case T_TRUE:
				return true;
			case T_FALSE:
				return false;
			case T_NULL:
				return null;
			default: {
				// custom-codec tag: fail with a clear message if none is registered
				// (e.g. corrupt bytes loaded from localStorage), not a raw TypeError.
				const codec = this.c && this.c[tag];
				if (!codec) throw new Error("store: no codec for tag " + tag);
				return codec[1](b, off, len);
			}
		}
	}
	// Remove record i (shifts the tail down); returns the new count or -1.
	remove(i: number): number {
		const p = this.o(i);
		if (p < 0) return -1;
		const b = this.b,
			rec = 2 + b[p + 1],
			end = this.t - rec;
		for (let j = p; j < end; j++) b[j] = b[j + rec];
		this.t = end;
		return --this.n;
	}
	// byte offset of record i, or -1
	o(i: number): number {
		// reject non-integers too: `while (i--)` never terminates for a
		// fractional i (0.5 -> -0.5 -> … stays truthy forever) — a VirtualList
		// whose at() returns a fraction would HANG the app. `(i | 0) !== i`
		// also catches NaN (NaN | 0 === 0).
		if (i < 0 || i >= this.n || (i | 0) !== i) return -1;
		let p = 0;
		while (i--) p += 2 + this.b[p + 1];
		return p;
	}
	// Persist the raw record bytes under a key in the host's localStorage
	// (device key-value store). One byte becomes one Latin-1 char; load()
	// walks the records to rebuild the count and rejects corrupt data.
	save(k: string): void {
		const b = this.b,
			t = this.t;
		// CHUNKED stringify (S8): one whole-blob fromCharCode.apply pushes one
		// argument PER BYTE onto the XS value stack — the exact shape the
		// romTable work measured fxAborting on this port (and why Store.get's
		// string path is capped at 255B). 128B slices keep the transient
		// argument push far under the 384-slot stack; CPU for stack, as always.
		let s = "";
		for (let off = 0; off < t; off += 128)
			s += String.fromCharCode.apply(
				String,
				b.subarray(off, off + 128 > t ? t : off + 128) as unknown as number[],
			);
		// globalThis's type lacks localStorage; the cast is erased.
		(globalThis as typeof globalThis & { localStorage: typeof localStorage }).localStorage.setItem(
			k,
			s,
		);
	}
	load(k: string): boolean {
		const s = (
			globalThis as typeof globalThis & { localStorage: typeof localStorage }
		).localStorage.getItem(k);
		if (s === null || s.length > this.b.length) return false;
		// VALIDATE the record stream reading from `s` directly — do NOT touch
		// this.b yet. A corrupt key must leave the store's current contents
		// (e.g. seeded defaults) intact; committing only after the walk
		// succeeds means a rejected load is a true no-op.
		let n = 0,
			p = 0;
		while (p < s.length) {
			// every record needs its 2-byte [tag][len] header inside the blob —
			// a lone trailing byte is corrupt (and would read a stale len below)
			if (p + 2 > s.length) return false;
			const tag = s.charCodeAt(p) & 255,
				len = s.charCodeAt(p + 1) & 255;
			// a fixed-width built-in that doesn't carry its EXACT width is
			// corrupt: get() would decode from bytes that were never stored
			// (stale/zero value) instead of this load() rejecting it. STR and
			// custom codecs (tag >= 8) are variable width; tags 6-7 are reserved
			// (no codec range) and never valid.
			let ok: boolean;
			if (tag === T_STR || tag >= 8) ok = true;
			else if (tag === T_I32) ok = len === 4;
			else if (tag === T_F64) ok = len === 8;
			else if (tag <= T_NULL)
				ok = len === 0; // TRUE / FALSE / NULL
			else ok = false; // 6, 7 reserved
			if (!ok) return false;
			p += 2 + len;
			n++;
		}
		if (p !== s.length)
			// truncated/corrupt record stream
			return false;
		// commit: the stream is well-formed, adopt it
		const b = this.b;
		for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255;
		this.t = s.length;
		this.n = n;
		return true;
	}
	// lazy float scratch
	fl(): void {
		if (this.f === null) {
			this.f = new Float64Array(1);
			this.fb = new Uint8Array(this.f.buffer);
		}
	}
};

/** Byte-record store: records live as BYTES in one Uint8Array, not as slots. */
export const createStore = (size: number): ByteStore => new Store(size);

// ---- ROM table — typed accessor over a packed flash-resource blob ----------
// The v2 data path, DEVICE-PROVEN (playbook "v2: data-to-Resource"): big
// static string tables ship as ONE binary blob in the 256KB resource area
// and cost ZERO boot RAM; each get() builds one transient string. Blob
// format (written by tools/pack-table.mts): [u16le count][u16le cumulative
// END offset per entry][latin-1 payload]. Access pattern is the measured
// safe one — ranged resource.slice() + String.fromArrayBuffer (whole-blob
// Uint8Array wraps and fromCharCode.apply both fxAbort on this port).
// `Resource` is the Pebble-host-injected global; looked up lazily so this
// module still loads in Node/V8 test sandboxes that lack it.

/** What {@link romTable} returns — a read-only view over a packed table. */
export interface RomTable {
	/** Number of entries in the table. */
	count: number;
	/** Decode entry `i` (wraps modulo {@link count}); "" on an empty table. */
	get(i: number): string;
}

/**
 * Open a packed string table from the flash resource area (zero boot RAM;
 * one transient string per read). Pack with `tools/pack-table.mts`; the
 * build's manifest derivation ships any `romTable("<name>")` literal's blob
 * automatically.
 */
export function romTable(name: string): RomTable {
	const r = new (globalThis as unknown as { Resource: new (n: string) => unknown }).Resource(
		name,
	) as { slice(b: number, e: number): ArrayBuffer };
	const S2 = String as unknown as { fromArrayBuffer(b: ArrayBuffer): string };
	const u16 = (o: number): number => {
		const b = new Uint8Array(r.slice(o, o + 2));
		return b[0] | (b[1] << 8);
	};
	const count = u16(0);
	const base = 2 + 2 * count;
	return {
		count,
		get(i: number): string {
			if (!count) return "";
			// wrap modulo count — JS `%` keeps the sign, so a negative probe
			// (get(-1) for "last entry", or a scroll offset that dips below 0)
			// must be normalized or u16() reads a negative offset.
			const k = (((i % count) + count) % count) | 0;
			const s = k ? u16(2 * k) : 0;
			return S2.fromArrayBuffer(r.slice(base + s, base + u16(2 * k + 2)));
		},
	};
}

export type { Signal };
