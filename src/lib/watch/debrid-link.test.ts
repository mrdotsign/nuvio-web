import { describe, expect, it } from "vitest";
import { debridLinkStatus } from "./debrid-link.ts";

// An IP literal: the SSRF guard checks it without a DNS lookup.
const LINK = "https://93.184.216.34/api/debrid/abc/0?s=3&e=1";

function answering(response: Response | Error): typeof fetch {
	return (async () => {
		if (response instanceof Error) {
			throw response;
		}
		return response;
	}) as unknown as typeof fetch;
}

describe("debridLinkStatus", () => {
	it("is ready once the link serves the file", async () => {
		const fetchImpl = answering(new Response("x", { status: 206 }));
		expect(await debridLinkStatus(LINK, fetchImpl)).toBe("ready");
	});

	it("is downloading while the addon answers 503 downloading", async () => {
		const fetchImpl = answering(
			Response.json({ status: "downloading" }, { status: 503 }),
		);
		expect(await debridLinkStatus(LINK, fetchImpl)).toBe("downloading");
	});

	it("fails on any other 503", async () => {
		const fetchImpl = answering(new Response("busy", { status: 503 }));
		expect(await debridLinkStatus(LINK, fetchImpl)).toBe("failed");
	});

	it("fails when the addon can't resolve the link", async () => {
		const fetchImpl = answering(new Response("nope", { status: 502 }));
		expect(await debridLinkStatus(LINK, fetchImpl)).toBe("failed");
	});

	it("fails when the addon is unreachable", async () => {
		const fetchImpl = answering(new Error("ECONNREFUSED"));
		expect(await debridLinkStatus(LINK, fetchImpl)).toBe("failed");
	});

	it("asks for one byte and forwards the addon's headers", async () => {
		let sent: Headers | undefined;
		const fetchImpl = (async (_url: string, init: RequestInit) => {
			sent = new Headers(init.headers);
			return new Response("x", { status: 206 });
		}) as unknown as typeof fetch;
		await debridLinkStatus(LINK, fetchImpl, { "x-token": "t" });
		expect(sent?.get("range")).toBe("bytes=0-0");
		expect(sent?.get("x-token")).toBe("t");
	});
});
