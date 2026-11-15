import { expect, type Page, test } from "@playwright/test";
import { collectRuntimeErrors } from "./errors.ts";
import { serveFixtures } from "./fixtures.ts";

test.beforeEach(({ context }) => serveFixtures(context));

// dual-audio.mkv : VP9 with two AC-3 tracks, "Ita Ac3" (default) then "Eng Ac3".
const DUAL = "/dev/player?src=/e2e/dual-audio.mkv";

async function checkedAudioTrack(page: Page): Promise<string | null> {
	const player = page.getByRole("region", { name: "Video player" });
	await player.hover();
	await player.getByRole("button", { name: "Audio", exact: true }).click();
	const checked = page.getByRole("menuitemradio", { checked: true });
	await expect(checked).toHaveCount(1);
	return checked.textContent();
}

test("a multi-audio file starts on its own default track", async ({ page }) => {
	const errors = collectRuntimeErrors(page);
	await page.goto(DUAL);
	expect(await checkedAudioTrack(page)).toContain("Ita Ac3");
	expect(errors, "runtime errors").toEqual([]);
});

test("the preferred audio language picks the matching track", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);
	await page.goto(`${DUAL}&audiolang=fr,en`);
	expect(await checkedAudioTrack(page)).toContain("Eng Ac3");
	expect(errors, "runtime errors").toEqual([]);
});

test("an audio track restored from the URL beats the language", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);
	await page.goto(`${DUAL}&audiolang=en&audio=0`);
	expect(await checkedAudioTrack(page)).toContain("Ita Ac3");
	expect(errors, "runtime errors").toEqual([]);
});

test("switching the audio of a remuxed file keeps the remux running", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);
	await page.goto(DUAL);
	expect(await checkedAudioTrack(page)).toContain("Ita Ac3");
	await expect
		.poll(() => page.evaluate(() => document.querySelector("video")?.src))
		.toMatch(/^blob:/);
	// Every source the element is handed from here on.
	await page.evaluate(() => {
		const video = document.querySelector("video");
		const seen: string[] = [];
		Object.assign(window, { __sources: seen });
		new MutationObserver(() =>
			seen.push(video?.getAttribute("src") ?? ""),
		).observe(video as HTMLVideoElement, {
			attributes: true,
			attributeFilter: ["src"],
		});
	});
	await page.getByRole("menuitemradio", { name: /Eng Ac3/ }).click();
	expect(await checkedAudioTrack(page)).toContain("Eng Ac3");
	await page.waitForTimeout(1000);
	const sources = await page.evaluate(
		() => (window as unknown as { __sources: string[] }).__sources,
	);
	expect(sources, "the raw file is never handed back").not.toContainEqual(
		expect.stringContaining("dual-audio.mkv"),
	);
	expect(errors, "runtime errors").toEqual([]);
});

test("a volume boost restored from the URL comes back with playback", async ({
	page,
}) => {
	const errors = collectRuntimeErrors(page);
	await page.goto("/dev/player?src=/e2e/sample.webm&boost=2");
	await page.evaluate(() => {
		const video = document.querySelector("video");
		if (video) {
			video.loop = true;
			void video.play().catch(() => {});
		}
	});
	const player = page.getByRole("region", { name: "Video player" });
	await expect(player.getByText("200%", { exact: true })).toBeVisible();
	expect(errors, "runtime errors").toEqual([]);
});
