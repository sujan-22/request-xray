/// <reference lib="webworker" />
/**
 * Parsing and analysis run here so the page never freezes, even on 50 MB+
 * files. The parsed HAR stays in this worker; the page receives a lightweight
 * report and asks for bodies, diffs and exports on demand.
 */
import { createHandler } from "@/lib/worker/handler";
import type { WorkerRequest } from "@/lib/worker/protocol";

declare const self: DedicatedWorkerGlobalScope;

const handle = createHandler((message) => self.postMessage(message));

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
	void handle(event.data);
});
