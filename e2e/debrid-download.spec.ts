import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { networkInterfaces } from "node:os";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signIn } from "./auth.ts";
import { collectRuntimeErrors } from "./errors.ts";

const VIDEO_ID = "tt0903747:1:2";
// Answers "downloading" this many times before the file is there.
const DOWNLOADING_ANSWERS = 2;

// An addon's debrid link for a torrent the debrid service doesn't have yet:
// 202 `{"status":"downloading"}` until it's downloaded, then the file. The app
// asks from its container, at this machine's network address: a private range
// the SSRF guard lets through, unlike `host.docker.internal` on some Docker VMs
// (198.18.0.0/15). The browser's own request for the video is routed to the
// sample fixture.
let server: Server;
let asked = 0;

function hostAddress(): string {
	const address = Object.values(networkInterfaces())
		.flat()
		.find((entry) => entry?.family === "IPv4" && !entry.internal);
	if (!address) {
		throw new Error("No network address for the app's container to reach");
	}
	return address.address;
}

test.beforeAll(async () => {
	server = createServer((_request, response) => {
		asked += 1;
		if (asked <= DOWNLOADING_ANSWERS) {
			response.writeHead(202, {
				"content-type": "application/json",
				"retry-after": "5",
			});
			response.end(JSON.stringify({ status: "downloading" }));
			return;
		}
		response.writeHead(206, {
			"content-type": "video/webm",
			"content-range": "bytes 0-0/1",
		});
		response.end("x");
	});
	await new Promise<void>((resolve) => server.listen(0, "0.0.0.0", resolve));
});

test.afterAll(async () => {
	await new Promise((resolve) => server.close(resolve));
});

test("player: a source still downloading on debrid waits, then plays", async ({
	page,
	context,
}) => {
	test.setTimeout(60_000);
	const { port } = server.address() as AddressInfo;
	const origin = `http://${hostAddress()}:${port}`;
	const link = `${origin}/api/debrid/abc/1?s=1&e=2`;

	const sample = await readFile(
		new URL("../static/e2e/sample.webm", import.meta.url),
	);
	await context.route(`${origin}/**`, (route) =>
		route.fulfill({ contentType: "video/webm", body: sample }),
	);
	await signIn(context);
	await context.addInitScript(
		([videoId, url]) => {
			sessionStorage.setItem(
				"nuvio:selected-stream",
				JSON.stringify({
					videoId,
					url,
					externalUrl: null,
					notWebReady: false,
					label: "E2E debrid download",
					addonName: "E2E",
					infoHash: null,
					audioRisky: false,
					videoRisky: false,
					videoCodec: null,
					debridDownload: true,
				}),
			);
		},
		[VIDEO_ID, link],
	);
	const errors = collectRuntimeErrors(page);

	await page.goto(`/player/series/${encodeURIComponent(VIDEO_ID)}`);

	await expect(page.getByText("Downloading on debrid…")).toBeVisible({
		timeout: 20_000,
	});
	await expect(page.locator("video")).toHaveCount(0);
	const { violations } = await new AxeBuilder({ page })
		.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
		.analyze();
	expect(violations.map((violation) => violation.id)).toEqual([]);

	await expect(page.locator("video")).toHaveAttribute("src", link, {
		timeout: 30_000,
	});
	expect(asked).toBeGreaterThan(DOWNLOADING_ANSWERS);

	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
	await page.waitForTimeout(1000);
	// The stand-in addon is plain http on the LAN, which the app's CSP keeps the
	// browser from loading (real debrid links are https): only those are dropped.
	expect(
		errors.filter((error) => !error.includes(origin)),
		"runtime errors",
	).toEqual([]);
});
