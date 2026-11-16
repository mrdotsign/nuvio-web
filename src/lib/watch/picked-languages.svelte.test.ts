import { describe, expect, it } from "vitest";
import { createPickedLanguages } from "./picked-languages.svelte.ts";

const profile = {
	settings: () => ({ audioLanguage: "en", subtitleLanguage: "en" }),
	appAudio: () => ({ preferred: "ja", secondary: null }),
	deviceLanguages: () => ["de-DE"],
};

describe("createPickedLanguages", () => {
	it("follows the profile until the viewer picks", () => {
		const picked = createPickedLanguages(profile);
		expect(picked.audio).toEqual(["en"]);
		expect(picked.subtitles).toBe("en");
	});

	it("falls back to the Nuvio app's audio languages", () => {
		const picked = createPickedLanguages({
			...profile,
			settings: () => ({ audioLanguage: "", subtitleLanguage: "" }),
		});
		expect(picked.audio).toEqual(["ja"]);
		expect(picked.subtitles).toBe("");
	});

	it("puts a picked audio language first, by language key", () => {
		const picked = createPickedLanguages(profile);
		picked.pick({ audioTrack: 0, audioLanguage: "fre" });
		expect(picked.audio).toEqual(["fr", "en"]);
		picked.pick({ audioTrack: 1, audioLanguage: "eng" });
		expect(picked.audio).toEqual(["en"]);
	});

	it("keeps the last language when the picked track names none", () => {
		const picked = createPickedLanguages(profile);
		picked.pick({ audioLanguage: "ja" });
		picked.pick({ audioLanguage: "" });
		expect(picked.audio).toEqual(["ja", "en"]);
	});

	it("carries a picked caption language, and off as none", () => {
		const picked = createPickedLanguages(profile);
		picked.pick({ subtitleLanguage: "fr" });
		expect(picked.subtitles).toBe("fr");
		picked.pick({ subtitleLanguage: null });
		expect(picked.subtitles).toBe("");
	});

	it("leaves the caption alone on an audio-only change", () => {
		const picked = createPickedLanguages(profile);
		picked.pick({ subtitleLanguage: null });
		picked.pick({ boost: 2, audioLanguage: "de" });
		expect(picked.subtitles).toBe("");
	});
});
