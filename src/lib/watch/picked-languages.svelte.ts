import {
	audioLanguageTargets,
	languageKey,
} from "#lib/player/audio-language.js";
import type { PlaybackSettingsPatch } from "#lib/player/types.js";

/**
 * The audio and caption languages the player should start on: what the viewer
 * picked in it, then this profile's web settings, else what the Nuvio mobile
 * app has. The player page stays mounted from one episode to the next, so a
 * pick carries over: by language, since a track index means nothing on
 * another file.
 */
export function createPickedLanguages(deps: {
	settings: () => { audioLanguage: string; subtitleLanguage: string };
	appAudio: () => { preferred: string | null; secondary: string | null };
	deviceLanguages: () => readonly string[];
}) {
	let audio = $state<string | null>(null);
	// `undefined`: never picked, the profile's applies. `null`: off.
	let subtitles = $state<string | null | undefined>(undefined);

	const profileAudio = $derived.by(() => {
		const { audioLanguage } = deps.settings();
		const app = deps.appAudio();
		return audioLanguage
			? audioLanguageTargets(audioLanguage, null, deps.deviceLanguages())
			: audioLanguageTargets(
					app.preferred,
					app.secondary,
					deps.deviceLanguages(),
				);
	});

	return {
		pick(patch: PlaybackSettingsPatch) {
			if (patch.audioLanguage !== undefined) {
				audio = languageKey(patch.audioLanguage) ?? audio;
			}
			if (patch.subtitleLanguage !== undefined) {
				subtitles = patch.subtitleLanguage;
			}
		},
		/** Audio language keys wanted, best first. */
		get audio() {
			return audio ? [...new Set([audio, ...profileAudio])] : profileAudio;
		},
		/** The caption language wanted, or "" for none. */
		get subtitles() {
			return subtitles === undefined
				? deps.settings().subtitleLanguage
				: (subtitles ?? "");
		},
	};
}
