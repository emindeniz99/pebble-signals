// Ambient types for the PebbleKit JS (PKJS) sandbox — the PHONE side. This
// code runs inside the Pebble mobile app (iOS/Android; pypkjs in the QEMU
// emulator), NOT on the watch and NOT in Node: an older ES5-era engine with
// CommonJS require, XMLHttpRequest, localStorage and the `Pebble` global.
// Only the surface index.ts actually uses is typed — grow deliberately.

/** AppMessage payload: declared message keys -> number | string | byte array. */
interface PebbleAppMessage {
	payload: Record<string, number | string | number[]>;
}

/** `webviewclosed` event: `response` is the config page's return fragment. */
interface PebbleWebviewClosed {
	response?: string;
}

declare const Pebble: {
	/** `ready` fires when the phone-side JS is up; `appmessage` on each watch message. */
	addEventListener(type: "ready", cb: (e?: unknown) => void): void;
	addEventListener(type: "appmessage", cb: (e: PebbleAppMessage) => void): void;
	/** `showConfiguration` fires when the user opens the app's settings page. */
	addEventListener(type: "showConfiguration", cb: (e?: unknown) => void): void;
	/** `webviewclosed` fires when the settings page closes (response = URL fragment). */
	addEventListener(type: "webviewclosed", cb: (e: PebbleWebviewClosed) => void): void;
	/** Open the config page (the phone app / emulator serves it). */
	openURL(url: string): void;
	/** Send an AppMessage to the watch (keys must be declared in package.json). */
	sendAppMessage(
		payload: Record<string, number | string | number[]>,
		ok?: () => void,
		err?: (e: unknown) => void,
	): void;
};

/** Phone-side HTTP/fetch proxy for the watch (README gotcha 18). */
declare module "@moddable/pebbleproxy" {
	/** Set true to log proxy traffic to the PKJS console. */
	export let log: boolean;
	/** Wire to Pebble's `ready` event. */
	export function readyReceived(e?: unknown): void;
	/** Wire to Pebble's `appmessage` event. */
	export function appMessageReceived(e: PebbleAppMessage): void;
}
