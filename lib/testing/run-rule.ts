import { createContext, type Rule } from "../analysis/context";
import { buildEndpoints, groupByEndpoint } from "../analysis/endpoints";
import { buildEntries } from "../har/entries";
import { DEFAULT_SETTINGS, type Finding, type Settings } from "../model";
import { makeHar, type EntrySpec } from "./har-builder";

/** Run one rule against synthetic entries. */
export function runRule(rule: Rule, specs: EntrySpec[], settings: Partial<Settings> = {}): Finding[] {
	const { entries } = buildEntries(makeHar(specs));
	const byEndpoint = groupByEndpoint(entries);
	buildEndpoints(byEndpoint);
	return rule(createContext(entries, byEndpoint, { ...DEFAULT_SETTINGS, ...settings }));
}
