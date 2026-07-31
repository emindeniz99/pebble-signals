// JSX factory — Solid model, no virtual DOM. Components run ONCE; host
// elements become real Piu nodes created once; function-valued props become
// live effect bindings that assign single Piu properties on change.
import { createRoot, effect, getBoundary, report, setSink, track, untrack, withBoundary, } from "runtime/signals";
// Piu content classes are compartment globals provided by the Alloy host.
// Hardened JS freezes primordials and can make instanceof unreliable, so
// host elements are recognized by identity in this registry. Built lazily:
// the Piu globals only exist at runtime, never in the module-instantiation
// compartment. (D4 diet note: "preload" does NOT ROM-freeze a mod's module
// scope — 200 probe closures added here cost real boot slots, measured
// 2026-07-28 — so keep this scope LEAN; the lazy array is 9 entries, and
// isPiu was folded into jsx() to drop a deep-chain frame + a binding.)
let PIU = null;
// Comma-list membership with word boundaries — the D4 slot-diet replacement
// for the three frozen prop arrays (an N-string array costs ~2+N slots at
// boot; one string costs 1 + chunk bytes). Zero-allocation: indexOf + edge
// checks instead of padding concats. `list` never starts/ends with a comma.
function has(list, name) {
    const ix = list.indexOf(name);
    if (ix < 0)
        return false;
    if (ix > 0 && list[ix - 1] !== ",")
        return false;
    const end = ix + name.length;
    return end === list.length || list[end] === ",";
}
/** `<>...</>` — returns its children unchanged. */
export function Fragment(props) {
    return props.children;
}
/** JSX factory (automatic runtime). Host Piu type → real node; function → component call. */
// react-jsx HOISTS a JSX `key` attribute out of props into the third argument
// (its reserved-prop rule) — without accepting it here, `<For key={...}>`
// (the documented usage) silently lost its key function and fell back to
// identity keys = full row churn per update. Components get it re-injected
// as props.key; host Piu elements ignore it (no keyed semantics there).
// Depth-safe: jsx frames never nest (children evaluate before the outer
// call), so the extra parameter is one live stack slot, not xdepth.
export function jsx(type, props, key) {
    if (PIU === null)
        // a 9-entry array beats a Set on the 32KB arena (isPiu folded in — D4)
        PIU = [Label, Text, Content, Container, Column, Row, Scroller, Port, Layout].filter((t) => t !== undefined);
    if (PIU.indexOf(type) >= 0)
        return createHost(type, props);
    if (typeof type === "function") {
        if (key !== undefined) {
            props = props || {};
            if (props.key === undefined)
                props.key = key;
        }
        return type(props || {});
    }
    throw new Error("jsx:type");
}
/** JSX factory for elements with static children (same behavior as {@link jsx}). */
export const jsxs = jsx;
// Event props -> piu Behavior methods. onTap needs active:true; the
// onPress*/onRelease* button events reach the behavior of the focused
// content (or an ancestor), so pair them with the `focus` prop.
// A comma STRING, not an array (D4 diet): the 8-entry array cost ~10 boot
// slots; membership goes through `has()` above.
const BUTTON_EVENTS = "onPressSelect,onReleaseSelect,onPressUp,onReleaseUp,onPressDown,onReleaseDown,onPressBack,onReleaseBack";
let pendingFocus = null;
// One shared behavior class; handlers live in instance fields. piu stops
// button bubbling when the method returns truthy — consume by default,
// return false from a handler to pass the event up the chain. piu accepts
// ANY object as a behavior (methods are looked up by name — no Behavior
// inheritance required). The eight one-line button delegates are generated,
// and LAZILY, on the first construction (D4 diet): "preload" does NOT put a
// mod's module scope in flash (measured — the probe closures cost real boot
// slots), so wiring the prototype eagerly charged every app ~8 closures at
// boot; a button-less watchface now never pays. The delegates still exist at
// most ONCE — later constructions skip the wiring.
let btnWired = false;
class HandlerBehavior {
    constructor(tap, buttons) {
        if (!btnWired) {
            btnWired = true;
            for (const n of BUTTON_EVENTS.split(","))
                HandlerBehavior.prototype[n] = function (content) {
                    const h = this.b && this.b[n];
                    return h ? h(content) !== false : false;
                };
        }
        this.t = tap;
        this.b = buttons;
    }
    onTouchEnded(content, _id, x, y) {
        if (this.t)
            this.t(content, x, y);
    }
}
// Does a children value contain anything that would actually MOUNT?
// null/undefined/booleans are the legal "render nothing" values (a dead
// conditional like `{debug && <X/>}`), recursively through arrays. A const
// arrow, not a `function` declaration (preloaded-module alias rule, gotcha 13).
const hasRenderable = (c) => Array.isArray(c)
    ? c.some(hasRenderable)
    : c !== null && c !== undefined && c !== false && c !== true;
function createHost(type, props) {
    const dict = {};
    let bindings = null, tap = null, buttons = null, children, focus = false;
    for (const k in props) {
        const v = props[k];
        if (k === "children") {
            children = v;
            continue;
        }
        if (k === "focus") {
            focus = !!v;
            continue;
        }
        if (k === "onTap") {
            tap = v;
            continue;
        }
        if (has(BUTTON_EVENTS, k)) {
            if (buttons === null)
                buttons = {};
            buttons[k] = v;
            continue;
        }
        if (typeof v === "function") {
            // reactive prop: thunk -> live binding
            if (bindings === null)
                bindings = [];
            bindings.push(k, v);
            continue;
        }
        dict[k] = v;
    }
    if (tap || buttons) {
        // a user-supplied `behavior` would be silently clobbered here — the
        // custom behavior's other hooks (onDisplaying, ...) would vanish (U10)
        if (dict.behavior)
            throw new Error("jsx: `behavior` prop conflicts with onTap/button props");
        if (tap)
            dict.active = true;
        dict.behavior = new HandlerBehavior(tap, buttons);
    }
    const node = new type(null, dict);
    if (focus)
        pendingFocus = node; // applied after mount; focus() needs a bound node
    if (bindings) {
        for (let i = 0; i < bindings.length; i += 2) {
            const key = bindings[i], thunk = bindings[i + 1];
            // Reject an illegal reactive prop ONCE, HERE (bind time), with an
            // actionable message — not on every effect run. Only the whitelist
            // can be written reactively; a reactive position prop is the classic
            // React-refugee surprise (Piu layout is construction-time).
            // message built inline (bindErr folded — D4 diet; this is a throw
            // path, so the ternary chain costs bytecode, not boot slots)
            if (!has(REACTIVE_PROPS, key))
                throw new Error(key === "visible"
                    ? "jsx: `visible` can't be reactive (crashes the port) — use <Show> for conditional UI"
                    : has(POSITION_PROPS, key)
                        ? "jsx: position/size prop `" +
                            key +
                            "` is static — Piu lays out at construction time. Reposition by swapping with <Show>, not a reactive binding."
                        : "jsx: prop `" +
                            key +
                            "` can't be a reactive binding (reactive props: " +
                            REACTIVE_PROPS.split(",").join(", ") +
                            ")");
            // effect() auto-registers with the innermost owner (running-owner round).
            // The binding body is GUARDED so a throwing thunk is caught WITH
            // context (which prop, which node class) — including on the FIRST
            // render, which runs during effect creation and would otherwise skip
            // the notify() guard. What happens NEXT is report()'s escalation
            // ladder (2026-07 redesign, owner decision: telling the wearer beats
            // a silently frozen label): under render()'s default boundary the
            // tree is torn down and a crash screen is painted; with
            // `boundary:false` the error is logged then rethrown (fxAbort — dead
            // but loud); a custom `__spError` handler owns the policy; and with
            // no boundary at all (bare core, tests) the node keeps its last good
            // value and the app survives. Conformance laws 24-25 pin this.
            effect(() => {
                try {
                    // the raw write, inline (setProp folded away — D4 diet; the
                    // whitelist check above already vetted `key`, and folding
                    // drops a frame from the per-update path). Piu content types
                    // have no index signature for the dynamic key — type-only cast.
                    node[key] = thunk();
                }
                catch (err) {
                    const cls = node.constructor;
                    report(err, "binding '" + key + "' on " + ((cls && cls.name) || "content") + " threw");
                }
            });
        }
    }
    if (children !== undefined) {
        // NON-container guard: a Piu leaf (Label, Text, …) cannot parent
        // children — Content has no add(), so the mistake either rendered
        // NOTHING or died later inside appendChild with an unactionable
        // `add: not a function`. Fail loud AT the element instead (same rule
        // as bindErr and For's asRow). Children that render nothing —
        // null/booleans from a dead conditional — stay legal on any host.
        if (typeof node.add !== "function" && hasRenderable(children))
            throw new Error(`jsx: <${(type && type.name) || "content"}> cannot take children (not a container)`);
        appendChild(node, children);
    }
    return node;
}
// Reactive property writes. Position/size are static-only: Piu coordinates are
// construction-dict state, not plain property writes. `visible` crashes the piu
// Pebble port when written on bound content (measured); use Show. `string` is
// battle-tested on-device; state/variant/skin/style/active follow the same path.
// Comma STRINGS, not frozen arrays (D4 diet — module scope is boot RAM, and
// the two arrays cost ~20 slots between them); membership via `has()`.
const REACTIVE_PROPS = "string,state,variant,skin,style,active";
const POSITION_PROPS = "left,right,top,bottom,width,height,x,y";
/** Append a child (node / string / number / array) to a parent Piu node. */
export function appendChild(parent, child) {
    if (child === undefined || child === null || child === false || child === true)
        return;
    if (Array.isArray(child)) {
        for (const c of child)
            appendChild(parent, c);
        return;
    }
    const t = typeof child;
    if (t === "string" || t === "number") {
        parent.add(new Label(null, { string: String(child) }));
        return;
    }
    if (t === "function")
        throw new Error("jsx:fn-child"); // use Show/For or a string-prop thunk
    // `t` (not `child` directly) drove the typeof narrowing above, so TS still
    // sees `child` as `string | number | Content` here — a type-only cast (the
    // string/number cases already returned) narrows it without touching emit.
    parent.add(child);
}
// ---- top-level error boundary (2026-07 redesign) ---------------------------
// render() installs showCrash as report()'s sink by default: an escaped
// reactive/build error tears down the whole tree and paints a crash screen
// instead of leaving a silently frozen watchface. Owner decision: on a
// product, telling the wearer the app crashed (with the actual error) beats
// a watch that looks alive but stopped updating. Per project rules, these
// module-level helpers are `const` bindings (gotcha 13 alias budget).
let theApp = null; // the mounted Application — the crash canvas
let theBuild = null; // kept for the crash screen's RETRY
let rootDispose = null; // tears down every effect on panic
let panicked = false; // first crash wins; also tells render() a mid-build panic happened
// Build + mount the tree onto the app under a fresh root. Shared by render()
// and the crash screen's retry. A binding that panics DURING the build paints
// the crash screen from inside createRoot — in that case the orphan tree is
// dropped (its effects disposed) instead of mounted over the crash screen.
const mount = (app, build) => {
    pendingFocus = null; // drop any STALE focus target from a post-mount flow build
    const r = createRoot(build);
    if (panicked) {
        r[1]();
        return;
    }
    rootDispose = r[1];
    appendChild(app, r[0]);
    // pending `focus` applied inline (consumePendingFocus folded — D4 diet);
    // focus() is a no-op on unbound content, so this runs only after mount
    // (cast defeats TS's narrowing-to-null from the reset above — createRoot's
    // build callback is what actually sets pendingFocus, invisible to CFA)
    const pf = pendingFocus;
    if (pf) {
        pf.focus();
        pendingFocus = null;
    }
};
// Paint the crash screen. Order matters on the 32KB arena: dispose the tree
// and empty the app FIRST (frees the old nodes/effects — later notifies hit
// disposed ids and no-op), then build the deliberately tiny error UI.
// Buttons — Solid's ErrorBoundary `reset` and React's error-dialog guidance,
// adapted to a two-button watch:
//   select = RETRY: re-run the app build under a fresh root (module-scope
//            state survives; component-scope state starts over). A build
//            that immediately throws again just repaints this screen.
//   back/up/down = EXIT: rethrow the ORIGINAL error outside every guard —
//            uncaught → fxAbort (stack in `pebble logs`) → the host kills
//            the mod. The rethrow IS the exit AND the second log channel.
const showCrash = (err, msg) => {
    if (panicked)
        return; // one screen per crash; re-entrant reports just log
    panicked = true;
    pendingFocus = null; // a mid-build crash must not hand focus to orphans
    if (rootDispose) {
        rootDispose();
        rootDispose = null;
    }
    // theApp is never null here: render() assigns it before installing this
    // sink, and the sink is the only caller (the `!` is type-only, erases).
    const app = theApp;
    app.empty();
    const kill = () => {
        throw err;
    };
    const retry = () => {
        panicked = false;
        app.empty();
        try {
            mount(app, theBuild); // render() set theBuild before this sink existed
        }
        catch (e2) {
            report(e2, "retry build threw"); // paints this screen again
        }
    };
    // Skin/Style are host compartment globals (absent only in the Node test
    // sandbox); "18px Gothic" is a valid Pebble system font (tools/fontcheck).
    const g = globalThis;
    // The log kept the full multi-line error above; the SCREEN compacts
    // newlines to " ~ " so wrapped text packs far more per line (each stack
    // frame is short — one frame per line wasted most of a 260px circle).
    let body = msg.replace(/\n+/g, " ~ ");
    if (body.length > 380)
        body = body.slice(0, 380) + "…";
    // No top/bottom: Piu centers a fitted Text vertically — on a ROUND screen
    // (gabbro) that lands the message in the circle's widest band instead of
    // the clipped top corners (measured on the device screenshot). Insets
    // adapt to the shape via screen.round (host display flag).
    const inset = screen.round ? 26 : 8;
    const tprops = {
        left: inset,
        right: inset,
        string: "APP CRASHED\n" + body + "\n\n[select: retry \u00b7 back: exit]",
    };
    if (g.Style)
        tprops.style = new g.Style({ font: "18px Gothic", color: "white", horizontal: "left" });
    const props = {
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        onPressSelect: retry,
        onPressBack: kill,
        onPressUp: kill,
        onPressDown: kill,
        children: jsx(Text, tprops),
    };
    if (g.Skin)
        props.skin = new g.Skin({ fill: "black" });
    const ui = jsx(Container, props);
    app.add(ui);
    ui.focus(); // bound now — button presses reach the retry/kill handlers
};
// Live screen info, RN-Dimensions style. Populated by render() from the
// Application's measured size and the host display, so it is VALID ONCE
// render() HAS STARTED (like RN's "after layout" caveat) — read it inside the
// build callback / component bodies, not at module top level. Lets components
// size to the real screen (200x228 emery, 260x260 gabbro) and adapt layout to
// the panel: `round` (circular display — inset content away from the clipped
// corners) and `color` (color vs b/w panel) come from the host's `screen`
// display global (`pebble-display.js` on the Pebble host).
/** RN-Dimensions-style screen info (size/round/color); valid once {@link render} has started. */
export const screen = { width: 0, height: 0, round: false, color: false };
// Mount a JSX tree as the Piu application. `build` runs under a root owner;
// the disposer is kept so the default error boundary can tear the tree down.
/** Mount a JSX tree as the Piu Application. `build` runs under a root owner. */
export function render(build, dict, opts) {
    // a SECOND render() must not leak the previous tree (nor cross-wire its
    // crashes onto the new app) — tear the old root down first
    if (rootDispose) {
        rootDispose();
        rootDispose = null;
    }
    const app = new Application(null, dict || {});
    theApp = app;
    theBuild = build;
    panicked = false;
    screen.width = app.width; // screen size is known once the app exists,
    screen.height = app.height; // before build() runs so it can read it
    // panel shape/depth from the host display global (absent in Node tests)
    const hs = globalThis.screen;
    screen.round = !!(hs && hs.round);
    screen.color = !!(hs && hs.color);
    // crashSink: the tree-teardown crash SCREEN, or null (lean log+contain).
    // Kept as a dead-`if` on the compile-time flag ON PURPOSE: when esbuild
    // `define`s __SP_CRASH_UI__ = false (--no-crash-ui) the branch is dead and
    // DCE drops both it AND showCrash's whole body — esbuild eliminates a
    // constant-`false` `if` reliably, where it would NOT re-fold a `?:` fed an
    // inlined const (measured: the ternary form left showCrash referenced).
    // Flag undefined (Node tests, non-minified builds, default ON): the guard
    // stays runtime-true, so the screen is installed. `null` sink = report()
    // still LOGS in full, then CONTAINS (node keeps last good value).
    let crashSink = null;
    if (typeof __SP_CRASH_UI__ === "undefined" || __SP_CRASH_UI__)
        crashSink = showCrash;
    setSink(!opts || opts.boundary !== false ? crashSink : true);
    try {
        mount(app, build);
    }
    catch (err) {
        // build threw (createRoot already tore down its partial effects).
        // Boundary: crash screen (unless a mid-build binding already painted
        // one); strict: report logs in full, then rethrows out of render().
        report(err, "render() build threw");
    }
    return app;
}
/**
 * ErrorBoundary({ children, fallback }) — Solid's per-subtree boundary, on a
 * watch. `children` is a thunk (like Show); `fallback(err, reset)` renders
 * when the subtree throws — at BUILD time OR on any later reactive re-run —
 * and `reset` re-runs `children` under a fresh root (component-scope state
 * starts over; module-scope state survives — the swap tradeoff). The rest of
 * the app keeps running; only this subtree is replaced.
 *
 * This is the OPT-IN, LOCAL counterpart to render()'s default top-level crash
 * screen: an inner ErrorBoundary catches first; anything it doesn't wrap (or a
 * throw from the fallback itself) escalates OUTWARD to the enclosing boundary
 * and ultimately to the crash screen — the same chain React (root
 * onUncaughtError) and Solid (outermost catch) use. It does NOT catch button/
 * tap handler throws (those run outside the reactive graph — parity with
 * Solid, which also skips event handlers).
 *
 * `const` arrow, not `export function` (preloaded-module alias budget, gotcha
 * 13); apps that never import it pay nothing (export prune + DCE). ALL its
 * helpers live INSIDE this one arrow on purpose: extra module-scope bindings
 * push esbuild's minified top-level identifier allocation into letters the
 * host never interned — MEASURED +5 boot symbols on watchface when ebHost/
 * ebWrap sat at module scope. Function-local names never intern; the price is
 * a few closures per ErrorBoundary instance, and boundaries are few.
 */
export const ErrorBoundary = (props) => {
    // Host + side-wrapper — inlined equivalents of flow's makeHost/wrapSide
    // (importing them from flow would re-create the module dependency the move
    // exists to remove). Same on-device-proven shapes: the host defaults to
    // screen width (a width-less container measures 0, gotcha 16) and each
    // side mounts inside a Container sized like the host (bare content swapped
    // as a direct child crashes the piu Pebble port — measured).
    const ebWrap = (build) => {
        // same per-axis sizing as flow's wrapSide: width/height when given, a
        // 0/0 FILL on any axis the caller sized via coordinates instead — a
        // l/r/t/b-sized boundary handed its sides an unconstrained wrapper
        // that ignored the host's box (content-measured at the host origin
        // instead of filling the sized region — Show's A/B receipt,
        // screenshots/showlrtb-*.png; codex P2). No size props at all keeps
        // the content-measured wrapper.
        const dims = {};
        if (props.width !== undefined)
            dims.width = props.width;
        else if (props.left !== undefined || props.right !== undefined) {
            dims.left = 0;
            dims.right = 0;
        }
        if (props.height !== undefined)
            dims.height = props.height;
        else if (props.top !== undefined || props.bottom !== undefined) {
            dims.top = 0;
            dims.bottom = 0;
        }
        const wrapper = new Container(null, dims);
        // unwrap a thunk-returning build result (the same dynamic boundary
        // flow's asNode handles — `{() => <Label/>}` children arrive as a fn)
        const r = build();
        appendChild(wrapper, typeof r === "function" ? r() : r);
        return wrapper;
    };
    const dict = {};
    for (const k in props)
        if (k !== "children" && k !== "fallback")
            dict[k] = props[k];
    if (dict.width === undefined && !(dict.left !== undefined && dict.right !== undefined))
        dict.width = screen.width;
    const host = new Column(null, dict);
    // The boundary in scope when THIS one is built — a fallback that itself
    // throws escalates here (Solid nesting), not back into our own onError.
    const parent = getBoundary();
    let disposer = null;
    let shown = false; // currently showing the fallback (not the children)?
    let dead = false; // owner tore this boundary down (see the tracked cleanup)
    const clear = () => {
        if (disposer) {
            disposer();
            disposer = null;
        }
        while (host.first)
            host.remove(host.first);
    };
    // (re)build the protected subtree UNDER this boundary, so its effects' later
    // throws route back to onError (the z-tagging in signals' effect()/run()).
    const mountChildren = () => {
        const r = createRoot(() => withBoundary(onError, () => ebWrap(props.children)));
        // A CREATION-TIME binding throw is caught by the binding guard (no
        // exception escapes createRoot) but fires onError SYNCHRONOUSLY during
        // the build — the fallback is already mounted. Drop this orphan children
        // tree instead of stacking it on top (mirrors render()'s `panicked`).
        if (shown || dead) {
            r[1]();
            return;
        }
        disposer = r[1];
        host.add(r[0]);
    };
    const reset = () => untrack(() => {
        clear();
        shown = false;
        try {
            mountChildren();
        }
        catch (err) {
            onError(err); // children re-build threw immediately — back to fallback
        }
    });
    // Escalate an error OUT of this boundary: to the parent boundary if any,
    // else the terminal sink (render's crash screen). Routed through
    // withBoundary(parent) so report()'s boundary lookup lands on the parent
    // (or null), NOT back on THIS boundary — otherwise a failing fallback with
    // no parent would loop, and a parent's own fallback would be mis-tagged as
    // ours. __spError still outranks everything inside report().
    const escalate = (e) => withBoundary(parent, () => report(e, "ErrorBoundary fallback threw"));
    const onError = (err) => {
        if (shown) {
            escalate(err); // the fallback itself failed — never loop back here
            return;
        }
        untrack(() => {
            shown = true;
            clear();
            try {
                // build the fallback under the PARENT boundary: a throw from it
                // (build-time or a later re-run) escalates OUT, matching Solid.
                const build = () => ebWrap(() => props.fallback(err, reset));
                const r = createRoot(() => withBoundary(parent, build));
                // a creation-time BINDING throw inside the fallback fired the
                // PARENT boundary/sink synchronously mid-build — the parent tore
                // this boundary down while `disposer` was still null, so the
                // in-flight root would leak UNDISPOSABLY (it re-crashed a
                // successfully-retried app; review U4). Drop the orphan.
                if (dead) {
                    r[1]();
                    return;
                }
                disposer = r[1];
                host.add(r[0]);
            }
            catch (err2) {
                escalate(err2);
            }
        });
    };
    try {
        mountChildren();
    }
    catch (err) {
        onError(err); // first build threw synchronously (creation-time)
    }
    track(() => {
        dead = true; // any in-flight build must drop its root (see above)
        if (disposer)
            disposer();
    });
    return host;
};
