// Browser Piu stubs — the LAYOUT PREVIEW half of CloudPebble tier 2.
// The real compiled runtime (runtime-build/*.js via an import map) runs
// unmodified against these globals; every Content renders as a DOM node, so
// signals/bindings/flow behave exactly as shipped while layout is only
// APPROXIMATE — Piu's layout engine is not reimplemented here, and QEMU
// stays the source of truth (roadmap: tier 2 is instant feedback, not
// device accuracy). Buttons map to keys: ↑ up · ↓ down · Enter select ·
// Backspace back; taps map to click.
(() => {
	const FAMILIES = {
		gothic: "'Segoe UI', system-ui, sans-serif",
		bitham: "Georgia, 'Times New Roman', serif",
		roboto: "Roboto, system-ui, sans-serif",
		droid: "'Droid Serif', serif",
	};

	class Style {
		constructor(d = {}) {
			this.d = d;
		}
		get css() {
			const m = /^(?:(italic)\s+)?(?:(bold)\s+)?(\d+)px\s+(\w+)$/.exec(this.d.font || "");
			let font = "";
			if (m) {
				const fam = FAMILIES[m[4].toLowerCase()] || `'${m[4]}', sans-serif`;
				font = `${m[1] ? "italic " : ""}${m[2] ? "bold " : ""}${m[3]}px ${fam}`;
			}
			return { font, color: this.d.color || "" };
		}
	}
	class Skin {
		constructor(d = {}) {
			this.d = d;
		}
	}
	class Texture {
		constructor(d) {
			this.d = d;
		}
	}
	class Behavior {}

	let focused = null;

	class Content {
		constructor(_, it = {}) {
			this.el = document.createElement("div");
			this.el.style.boxSizing = "border-box";
			this.contents = [];
			this.container = null;
			this.coords = {};
			this._mx = 0;
			this._my = 0;
			for (const k of ["left", "right", "top", "bottom", "width", "height"])
				if (it[k] !== undefined) this.coords[k] = it[k];
			// width/height are getter-only here (coords + measured fallback) and
			// skin/style/string go through their setters below — copy the REST
			for (const k in it)
				if (
					!(k in this.coords) &&
					k !== "width" &&
					k !== "height" &&
					k !== "skin" &&
					k !== "style" &&
					k !== "string"
				)
					this[k] = it[k];
			if (it.skin) this.skin = it.skin;
			if (it.style) this.style = it.style;
			if (it.string !== undefined) this.string = it.string;
			if (this.behavior && this.behavior.onTouchEnded)
				this.el.addEventListener("click", (e) =>
					this.behavior.onTouchEnded(this, 0, e.offsetX, e.offsetY),
				);
		}
		get first() {
			return this.contents[0] || null;
		}
		get last() {
			return this.contents[this.contents.length - 1] || null;
		}
		get next() {
			if (!this.container) return null;
			const s = this.container.contents;
			const i = s.indexOf(this);
			return i >= 0 && s[i + 1] ? s[i + 1] : null;
		}
		get width() {
			return this.coords.width ?? this.el.offsetWidth;
		}
		get height() {
			return this.coords.height ?? this.el.offsetHeight;
		}
		add(c) {
			if (c.container) throw new Error("piu: content already has a container");
			c.container = this;
			this.contents.push(c);
			this.el.appendChild(c.el);
			c._place();
		}
		remove(c) {
			const i = this.contents.indexOf(c);
			if (i < 0) throw new Error("piu: content not in container");
			this.contents.splice(i, 1);
			c.container = null;
			c.el.remove();
		}
		insert(c, before) {
			if (c.container) throw new Error("piu: content already has a container");
			const i = this.contents.indexOf(before);
			this.contents.splice(i < 0 ? this.contents.length : i, 0, c);
			c.container = this;
			this.el.insertBefore(c.el, before ? before.el : null);
			c._place();
		}
		replace(oldC, newC) {
			const i = this.contents.indexOf(oldC);
			if (i < 0) throw new Error("piu: replace target not in container");
			if (newC.container) throw new Error("piu: replacement already has a container");
			this.contents[i] = newC;
			this.el.replaceChild(newC.el, oldC.el);
			oldC.container = null;
			newC.container = this;
			newC._place();
		}
		empty() {
			for (const c of this.contents) {
				c.container = null;
				c.el.remove();
			}
			this.contents.length = 0;
		}
		focus() {
			focused = this;
		}
		moveBy(dx, dy) {
			this._mx += dx;
			this._my += dy;
			this.el.style.transform = `translate(${this._mx}px, ${this._my}px)`;
		}
		set skin(s) {
			this._skin = s;
			if (!s || !s.d) return;
			if (s.d.fill) this.el.style.background = s.d.fill;
			else if (s.d.texture)
				// no bitmap pipeline in the preview — visible placeholder
				this.el.style.background =
					"repeating-linear-gradient(45deg,#888 0 4px,#555 4px 8px)";
		}
		get skin() {
			return this._skin;
		}
		set style(st) {
			this._style = st;
			if (!st || !st.css) return;
			const { font, color } = st.css;
			if (font) this.el.style.font = font;
			if (color) this.el.style.color = color;
		}
		get style() {
			return this._style;
		}
		set string(v) {
			this._string = v;
			this.el.textContent = v == null ? "" : String(v);
		}
		get string() {
			return this._string;
		}
		set visible(v) {
			this.el.style.visibility = v ? "" : "hidden";
		}
		// Approximate placement: flex parents flow children; otherwise absolute
		// with the given edges, centering any unconstrained axis.
		_place() {
			const flexParent = this.container && this.container._flex;
			const c = this.coords;
			const s = this.el.style;
			if (c.width !== undefined) s.width = `${c.width}px`;
			if (c.height !== undefined) s.height = `${c.height}px`;
			if (flexParent) {
				s.position = "";
				s.flexShrink = "0";
				return;
			}
			s.position = "absolute";
			if (c.left !== undefined) s.left = `${c.left}px`;
			if (c.right !== undefined) s.right = `${c.right}px`;
			if (c.top !== undefined) s.top = `${c.top}px`;
			if (c.bottom !== undefined) s.bottom = `${c.bottom}px`;
			if (c.left === undefined && c.right === undefined) {
				s.left = "0";
				s.right = "0";
				s.marginLeft = "auto";
				s.marginRight = "auto";
				if (c.width === undefined) s.width = "fit-content";
			}
			if (c.top === undefined && c.bottom === undefined) {
				s.top = "0";
				s.bottom = "0";
				s.marginTop = "auto";
				s.marginBottom = "auto";
				if (c.height === undefined) s.height = "fit-content";
			}
		}
	}

	class Label extends Content {
		constructor(_, it = {}) {
			super(_, it);
			this.el.style.whiteSpace = "nowrap";
		}
	}
	class Text extends Content {}
	class Container extends Content {}
	class Column extends Container {
		constructor(_, it = {}) {
			super(_, it);
			this._flex = true;
			this.el.style.display = "flex";
			this.el.style.flexDirection = "column";
			this.el.style.alignItems = "center";
		}
	}
	class Row extends Container {
		constructor(_, it = {}) {
			super(_, it);
			this._flex = true;
			this.el.style.display = "flex";
			this.el.style.flexDirection = "row";
			this.el.style.alignItems = "center";
		}
	}
	class Scroller extends Container {}
	class Port extends Content {}
	class Layout extends Container {}

	class Application extends Container {
		constructor(_, it = {}) {
			super(_, it);
			const shape = new URLSearchParams(location.search).get("shape");
			this.coords.width = shape === "emery" ? 200 : 260;
			this.coords.height = shape === "emery" ? 228 : 260;
			this.el.id = "watch";
			this.el.style.position = "relative";
			this.el.style.width = `${this.coords.width}px`;
			this.el.style.height = `${this.coords.height}px`;
			this.el.style.overflow = "hidden";
			if (shape === "round" || shape === null) this.el.style.borderRadius = "50%";
			document.body.appendChild(this.el);
		}
	}

	// ↑/↓/Enter/Backspace -> the focused content's behavior, bubbling up the
	// container chain while handlers return false (piu's consume rule).
	const KEYS = {
		ArrowUp: "onPressUp",
		ArrowDown: "onPressDown",
		Enter: "onPressSelect",
		Backspace: "onPressBack",
	};
	document.addEventListener("keydown", (e) => {
		const name = KEYS[e.key];
		if (!name) return;
		e.preventDefault();
		let node = focused;
		while (node) {
			const b = node.behavior;
			if (b && typeof b[name] === "function" && b[name](node) !== false) return;
			node = node.container;
		}
	});

	Object.assign(globalThis, {
		Style,
		Skin,
		Texture,
		Behavior,
		Content,
		Label,
		Text,
		Container,
		Column,
		Row,
		Scroller,
		Port,
		Layout,
		Application,
		trace: (...a) => console.log(...a),
		importNow: (spec) => {
			throw new Error(`preview: importNow("${spec}") needs the emulator (lazy modules)`);
		},
	});
})();
