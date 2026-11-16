import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";
import { serveFixtures } from "./fixtures.ts";

test.beforeEach(({ context }) => serveFixtures(context));

const FIRST = "tt0903747:1:1";
const NEXT = "tt0903747:1:2";

// dual-audio-subs.mkv : dual-audio.mkv ("Ita Ac3", "Eng Ac3") plus a French
// SRT, so both an audio track and a caption can be picked.
function stagedStream(videoId: string) {
	sessionStorage.setItem(
		"nuvio:selected-stream",
		JSON.stringify({
			videoId,
			// One URL per episode, as real streams have: the player remounts.
			url: `${location.origin}/e2e/dual-audio-subs.mkv?v=${videoId}`,
			externalUrl: null,
			notWebReady: false,
			label: "E2E dual audio",
			addonName: "E2E",
			infoHash: null,
			audioRisky: false,
			videoRisky: false,
			videoCodec: null,
		}),
	);
}

function player(page: Page) {
	return page.getByRole("region", { name: "Video player" });
}

async function openMenu(page: Page, name: string) {
	await player(page).hover();
	await player(page).getByRole("button", { name, exact: true }).click();
}

async function checkedAudio(page: Page) {
	await openMenu(page, "Audio");
	const checked = page.getByRole("menuitemradio", { checked: true });
	await expect(checked).toHaveCount(1);
	const name = await checked.textContent();
	await page.keyboard.press("Escape");
	return name;
}

// Captions on or off, as the viewer sees them: the language carries over, so
// on the next episode any French track (the file's own or an addon's) is on.
async function currentCaption(page: Page) {
	await openMenu(page, "Subtitles");
	// Wait for the file's own track, read from the container.
	await expect(page.getByRole("option", { name: /Embedded/ })).toBeVisible();
	const current = page.getByRole("option", { name: /current/ });
	const name = (await current.textContent()) ?? "";
	await page.keyboard.press("Escape");
	return name.startsWith("Off") ? "off" : "on";
}

function showingTracks(page: Page) {
	return page.evaluate(
		() =>
			[...(document.querySelector("video")?.textTracks ?? [])].filter(
				(track) => track.mode === "showing",
			).length,
	);
}

test("the next episode starts on the audio and captions picked on this one", async ({
	page,
	context,
}) => {
	await signIn(context);
	await context.addInitScript(stagedStream, FIRST);
	const errors = collectRuntimeErrors(page);

	await page.goto(`/player/series/${encodeURIComponent(FIRST)}`);

	// Pick what the profile didn't: the other audio track, captions flipped.
	await openMenu(page, "Audio");
	const other = page.getByRole("menuitemradio", { checked: false });
	const audio = await other.textContent();
	await other.click();
	const caption = (await currentCaption(page)) === "off" ? "on" : "off";
	await openMenu(page, "Subtitles");
	await page
		.getByRole("option", { name: caption === "off" ? /^Off/ : /Embedded/ })
		.click();
	await page.keyboard.press("Escape");
	expect(await checkedAudio(page)).toBe(audio);
	expect(await currentCaption(page)).toBe(caption);

	await page.evaluate(stagedStream, NEXT);
	await player(page).hover();
	await player(page).getByRole("button", { name: "Next episode" }).click();
	await expect(page).toHaveURL(/tt0903747(%3A|:)1(%3A|:)2/);

	// Both are picked as the new file's tracks turn up.
	await expect.poll(() => checkedAudio(page)).toBe(audio);
	await expect.poll(() => currentCaption(page)).toBe(caption);
	expect(await showingTracks(page)).toBe(caption === "on" ? 1 : 0);

	await page.waitForTimeout(500);
	expect(errors, "runtime errors").toEqual([]);
});
