import { untrack } from "svelte";
import type { SubtitleCatalog } from "./subtitle-catalog.svelte.ts";
import type { SubtitleSelectionState } from "./subtitle-selection.svelte.ts";

/**
 * The two "pick a caption for me" conveniences that sit above plain
 * selection: cycling through tracks (keyboard shortcut) and auto-picking a
 * preferred-language track once per source, from the time playback is ready.
 */
export function createSubtitleShortcuts(deps: {
	catalog: SubtitleCatalog;
	selection: SubtitleSelectionState;
	setCaption: (key: string | null) => void;
	preferredLanguage: () => string;
	languageMatches: (lang: string, preferred: string) => boolean;
}) {
	let autoSubDone = false;
	// Waiting for a preferred-language caption: the file's own tracks and the
	// addons' can both land after playback starts.
	let armed = $state(false);

	$effect(() => {
		const preferredLanguage = deps.preferredLanguage();
		if (!(armed && preferredLanguage) || deps.selection.activeCaption) {
			return;
		}
		const match = deps.catalog.options.find((entry) =>
			deps.languageMatches(entry.lang, preferredLanguage),
		);
		if (match) {
			armed = false;
			untrack(() => deps.setCaption(match.key));
		}
	});

	/** The viewer chose: nothing is auto-picked over it for this source. */
	function choose(key: string | null) {
		autoSubDone = true;
		armed = false;
		deps.setCaption(key);
	}

	/** The caption cycled to, or undefined when there is none to cycle. */
	function cycleCaption(): string | null | undefined {
		const options = deps.catalog.options;
		if (options.length === 0) {
			return undefined;
		}
		const keys = [null, ...options.map((entry) => entry.key)];
		const index = keys.indexOf(deps.selection.activeCaption);
		const next = keys[(index + 1) % keys.length];
		choose(next);
		return next;
	}

	// Called when playback is ready : arms the auto-pick, once per source.
	function trySelectPreferred() {
		if (!autoSubDone) {
			autoSubDone = true;
			armed = true;
		}
	}

	function reset() {
		autoSubDone = false;
		armed = false;
	}

	return { choose, cycleCaption, trySelectPreferred, reset };
}
