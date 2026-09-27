"use client";

import { createContext, useContext } from "react";
import type { Finding, Report, RequestRecord } from "@/lib/model";
import type { RequestDetail } from "@/lib/worker/detail";
import type { Analyzer } from "../use-analyzer";

export interface Domain {
	from: number;
	to: number;
}

export interface WorkspaceContextValue {
	report: Report;
	analyzer: Analyzer;
	requests: RequestRecord[];
	/** The whole capture, with a little room on the right. */
	fullDomain: Domain;
	/** The zoomed window, or the full domain. */
	domain: Domain;
	setRange: (range: Domain | null) => void;
	selectedId: number | null;
	select: (id: number | null) => void;
	activeFinding: Finding | null;
	setActiveFinding: (id: string | null) => void;
	/** Requests in the active finding. */
	highlighted: Set<number> | null;
	isolate: boolean;
	setIsolate: (value: boolean) => void;
	findingsByRequest: Map<number, Finding[]>;
	findingsByEndpoint: Map<string, Finding[]>;
	openCompare: (a?: number | null, b?: number | null) => void;
	getDetail: (id: number) => Promise<RequestDetail>;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace(): WorkspaceContextValue {
	const value = useContext(WorkspaceContext);
	if (!value) throw new Error("useWorkspace must be used inside <Workspace>");
	return value;
}

/** Map a time to a 0–100 percentage of the domain. */
export function toPercent(ms: number, domain: Domain): number {
	return ((ms - domain.from) / Math.max(1e-6, domain.to - domain.from)) * 100;
}
