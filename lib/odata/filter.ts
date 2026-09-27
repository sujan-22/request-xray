/**
 * OData $filter (and $orderby expression) parser: tokenizer + Pratt parser,
 * a pretty-printer that breaks long and/or chains over lines, and a plain
 * English reading. Covers the common v2–v4.01 grammar; anything it can't parse
 * is shown raw instead.
 */

export type ODataNode =
	| { type: "binary"; op: string; left: ODataNode; right: ODataNode }
	| { type: "unary"; op: "not" | "-"; operand: ODataNode }
	| { type: "call"; name: string; args: ODataNode[] }
	| { type: "lambda"; path: string; fn: "any" | "all"; variable: string | null; body: ODataNode | null }
	| { type: "member"; path: string }
	| { type: "literal"; kind: "string" | "number" | "boolean" | "null" | "guid" | "date" | "typed"; raw: string }
	| { type: "list"; items: ODataNode[] }
	| { type: "group"; expr: ODataNode };

type TokenType = "string" | "number" | "guid" | "date" | "typed" | "ident" | "punct" | "eof";

interface Token {
	type: TokenType;
	value: string;
	pos: number;
}

export class ODataSyntaxError extends Error {
	readonly position: number;
	constructor(message: string, position: number) {
		super(message);
		this.name = "ODataSyntaxError";
		this.position = position;
	}
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?/;
const NUMBER = /^\d+(\.\d+)?([eE][+-]?\d+)?[mMdDfFlL]?/;
const IDENT = /^[A-Za-z_$@][A-Za-z0-9_.]*/;

export function tokenize(input: string): Token[] {
	const tokens: Token[] = [];
	let i = 0;
	while (i < input.length) {
		const ch = input[i]!;
		if (/\s/.test(ch)) {
			i++;
			continue;
		}
		const rest = input.slice(i);
		if (ch === "'") {
			let j = i + 1;
			let value = "'";
			for (;;) {
				if (j >= input.length) throw new ODataSyntaxError("Unterminated string", i);
				if (input[j] === "'") {
					if (input[j + 1] === "'") {
						value += "''";
						j += 2;
						continue;
					}
					value += "'";
					j++;
					break;
				}
				value += input[j];
				j++;
			}
			tokens.push({ type: "string", value, pos: i });
			i = j;
			continue;
		}
		if ("(),/:".includes(ch)) {
			tokens.push({ type: "punct", value: ch, pos: i });
			i++;
			continue;
		}
		const guid = GUID.exec(rest);
		if (guid) {
			tokens.push({ type: "guid", value: guid[0], pos: i });
			i += guid[0].length;
			continue;
		}
		const date = DATE.exec(rest);
		if (date) {
			tokens.push({ type: "date", value: date[0], pos: i });
			i += date[0].length;
			continue;
		}
		const number = NUMBER.exec(rest);
		if (number) {
			tokens.push({ type: "number", value: number[0], pos: i });
			i += number[0].length;
			continue;
		}
		if (ch === "-") {
			tokens.push({ type: "punct", value: "-", pos: i });
			i++;
			continue;
		}
		const ident = IDENT.exec(rest);
		if (ident) {
			let value = ident[0];
			let end = i + value.length;
			// Typed literal: datetime'…', guid'…', Namespace.Color'Red'
			if (input[end] === "'") {
				const close = input.indexOf("'", end + 1);
				if (close === -1) throw new ODataSyntaxError("Unterminated literal", end);
				value = input.slice(i, close + 1);
				end = close + 1;
				tokens.push({ type: "typed", value, pos: i });
			} else {
				tokens.push({ type: "ident", value, pos: i });
			}
			i = end;
			continue;
		}
		throw new ODataSyntaxError(`Unexpected character “${ch}”`, i);
	}
	tokens.push({ type: "eof", value: "", pos: input.length });
	return tokens;
}

const BINARY: Record<string, number> = {
	or: 1,
	and: 2,
	eq: 3,
	ne: 3,
	gt: 4,
	ge: 4,
	lt: 4,
	le: 4,
	has: 4,
	in: 4,
	add: 5,
	sub: 5,
	mul: 6,
	div: 6,
	divby: 6,
	mod: 6,
};

class Parser {
	private index = 0;
	constructor(private readonly tokens: Token[]) {}

	private peek(offset = 0): Token {
		return this.tokens[Math.min(this.index + offset, this.tokens.length - 1)]!;
	}

	private next(): Token {
		const token = this.peek();
		this.index++;
		return token;
	}

	private expect(value: string): void {
		const token = this.next();
		if (token.value !== value) throw new ODataSyntaxError(`Expected “${value}”${token.type === "eof" ? " before the end" : ` but found “${token.value}”`}`, token.pos);
	}

	parse(): ODataNode {
		const node = this.expression(0);
		const token = this.peek();
		if (token.type !== "eof") throw new ODataSyntaxError(`Unexpected “${token.value}”`, token.pos);
		return node;
	}

	private operator(): string | null {
		const token = this.peek();
		if (token.type !== "ident") return null;
		const op = token.value.toLowerCase();
		return op in BINARY ? op : null;
	}

	expression(minPrecedence: number): ODataNode {
		let left = this.unary();
		for (;;) {
			const op = this.operator();
			if (!op) break;
			const precedence = BINARY[op]!;
			if (precedence <= minPrecedence) break;
			this.next();
			const right = this.expression(precedence);
			left = { type: "binary", op, left, right };
		}
		return left;
	}

	private unary(): ODataNode {
		const token = this.peek();
		if (token.type === "ident" && token.value.toLowerCase() === "not") {
			this.next();
			return { type: "unary", op: "not", operand: this.unary() };
		}
		if (token.type === "punct" && token.value === "-") {
			this.next();
			const operand = this.unary();
			if (operand.type === "literal" && operand.kind === "number") return { ...operand, raw: `-${operand.raw}` };
			return { type: "unary", op: "-", operand };
		}
		return this.primary();
	}

	private primary(): ODataNode {
		const token = this.next();
		switch (token.type) {
			case "string":
				return { type: "literal", kind: "string", raw: token.value };
			case "number":
				return { type: "literal", kind: "number", raw: token.value };
			case "guid":
				return { type: "literal", kind: "guid", raw: token.value };
			case "date":
				return { type: "literal", kind: "date", raw: token.value };
			case "typed":
				return { type: "literal", kind: "typed", raw: token.value };
			case "punct":
				if (token.value === "(") return this.group();
				throw new ODataSyntaxError(`Unexpected “${token.value}”`, token.pos);
			case "ident":
				return this.identifier(token);
			default:
				throw new ODataSyntaxError("The expression ends too early", token.pos);
		}
	}

	private group(): ODataNode {
		const first = this.expression(0);
		if (this.peek().value === ",") {
			const items = [first];
			while (this.peek().value === ",") {
				this.next();
				items.push(this.expression(0));
			}
			this.expect(")");
			return { type: "list", items };
		}
		this.expect(")");
		return { type: "group", expr: first };
	}

	private identifier(token: Token): ODataNode {
		const lower = token.value.toLowerCase();
		if (lower === "true" || lower === "false") return { type: "literal", kind: "boolean", raw: lower };
		if (lower === "null") return { type: "literal", kind: "null", raw: "null" };

		// Function call: name(args)
		if (this.peek().value === "(") {
			this.next();
			const args: ODataNode[] = [];
			if (this.peek().value !== ")") {
				args.push(this.expression(0));
				while (this.peek().value === ",") {
					this.next();
					args.push(this.expression(0));
				}
			}
			this.expect(")");
			return { type: "call", name: token.value, args };
		}

		// Member path, possibly ending in a lambda: Lines/any(l: l/Qty gt 1)
		let path = token.value;
		while (this.peek().value === "/") {
			this.next();
			const part = this.next();
			if (part.type !== "ident") throw new ODataSyntaxError("Expected a property name after “/”", part.pos);
			const fn = part.value.toLowerCase();
			if ((fn === "any" || fn === "all") && this.peek().value === "(") {
				this.next();
				if (this.peek().value === ")") {
					this.next();
					return { type: "lambda", path, fn, variable: null, body: null };
				}
				const variable = this.next();
				if (variable.type !== "ident") throw new ODataSyntaxError("Expected a lambda variable", variable.pos);
				this.expect(":");
				const body = this.expression(0);
				this.expect(")");
				return { type: "lambda", path, fn, variable: variable.value, body };
			}
			path += `/${part.value}`;
		}
		return { type: "member", path };
	}
}

export function parseFilter(input: string): ODataNode {
	return new Parser(tokenize(input)).parse();
}

// ---------------------------------------------------------------------------
// Pretty printing
// ---------------------------------------------------------------------------

export type PartKind = "keyword" | "operator" | "member" | "string" | "number" | "literal" | "function" | "punct" | "variable";

export interface Part {
	text: string;
	kind: PartKind;
}

export interface Line {
	indent: number;
	parts: Part[];
}

const MAX_INLINE = 56;

function inline(node: ODataNode): Part[] {
	switch (node.type) {
		case "binary": {
			const kind: PartKind = node.op === "and" || node.op === "or" ? "keyword" : "operator";
			return [...inline(node.left), { text: ` ${node.op} `, kind }, ...inline(node.right)];
		}
		case "unary":
			return node.op === "not" ? [{ text: "not ", kind: "keyword" }, ...inline(node.operand)] : [{ text: "-", kind: "operator" }, ...inline(node.operand)];
		case "call": {
			const parts: Part[] = [{ text: node.name, kind: "function" }, { text: "(", kind: "punct" }];
			node.args.forEach((arg, index) => {
				if (index) parts.push({ text: ", ", kind: "punct" });
				parts.push(...inline(arg));
			});
			parts.push({ text: ")", kind: "punct" });
			return parts;
		}
		case "lambda": {
			const parts: Part[] = [
				{ text: node.path, kind: "member" },
				{ text: "/", kind: "punct" },
				{ text: node.fn, kind: "function" },
				{ text: "(", kind: "punct" },
			];
			if (node.variable && node.body) {
				parts.push({ text: node.variable, kind: "variable" }, { text: ": ", kind: "punct" }, ...inline(node.body));
			}
			parts.push({ text: ")", kind: "punct" });
			return parts;
		}
		case "member":
			return [{ text: node.path, kind: "member" }];
		case "literal":
			return [{ text: node.raw, kind: node.kind === "string" ? "string" : node.kind === "number" ? "number" : "literal" }];
		case "list": {
			const parts: Part[] = [{ text: "(", kind: "punct" }];
			node.items.forEach((item, index) => {
				if (index) parts.push({ text: ", ", kind: "punct" });
				parts.push(...inline(item));
			});
			parts.push({ text: ")", kind: "punct" });
			return parts;
		}
		case "group":
			return [{ text: "(", kind: "punct" }, ...inline(node.expr), { text: ")", kind: "punct" }];
	}
}

function width(parts: Part[]): number {
	return parts.reduce((total, part) => total + part.text.length, 0);
}

/** Flatten a chain of the same logical operator: a and b and c → [a, b, c]. */
function flatten(node: ODataNode, op: string): ODataNode[] {
	if (node.type === "binary" && node.op === op) return [...flatten(node.left, op), ...flatten(node.right, op)];
	return [node];
}

function block(node: ODataNode, indent: number): Line[] {
	const parts = inline(node);
	if (width(parts) + indent * 2 <= MAX_INLINE) return [{ indent, parts }];

	if (node.type === "binary" && (node.op === "and" || node.op === "or")) {
		const lines: Line[] = [];
		flatten(node, node.op).forEach((operand, index) => {
			const operandLines = block(operand, indent);
			if (index > 0) operandLines[0] = { indent, parts: [{ text: `${node.op} `, kind: "keyword" }, ...operandLines[0]!.parts] };
			lines.push(...operandLines);
		});
		return lines;
	}
	if (node.type === "group") {
		return [
			{ indent, parts: [{ text: "(", kind: "punct" }] },
			...block(node.expr, indent + 1),
			{ indent, parts: [{ text: ")", kind: "punct" }] },
		];
	}
	if (node.type === "unary" && node.op === "not") {
		const inner = block(node.operand, indent);
		inner[0] = { indent, parts: [{ text: "not ", kind: "keyword" }, ...inner[0]!.parts] };
		return inner;
	}
	if (node.type === "lambda" && node.body && node.variable) {
		return [
			{
				indent,
				parts: [
					{ text: node.path, kind: "member" },
					{ text: "/", kind: "punct" },
					{ text: node.fn, kind: "function" },
					{ text: "(", kind: "punct" },
					{ text: node.variable, kind: "variable" },
					{ text: ":", kind: "punct" },
				],
			},
			...block(node.body, indent + 1),
			{ indent, parts: [{ text: ")", kind: "punct" }] },
		];
	}
	return [{ indent, parts }];
}

export function formatFilter(node: ODataNode): Line[] {
	return block(node, 0);
}

export function linesToText(lines: Line[]): string {
	return lines.map((line) => "  ".repeat(line.indent) + line.parts.map((part) => part.text).join("")).join("\n");
}

// ---------------------------------------------------------------------------
// Plain English
// ---------------------------------------------------------------------------

const COMPARISON: Record<string, string> = {
	eq: "is",
	ne: "is not",
	gt: "is greater than",
	ge: "is at least",
	lt: "is less than",
	le: "is at most",
	has: "has the flag",
	in: "is one of",
};

const ARITHMETIC: Record<string, string> = { add: "+", sub: "−", mul: "×", div: "÷", divby: "÷", mod: "mod" };

const ONE_ARG: Record<string, (x: string) => string> = {
	tolower: (x) => `${x} (lowercased)`,
	toupper: (x) => `${x} (uppercased)`,
	trim: (x) => `${x} (trimmed)`,
	length: (x) => `the length of ${x}`,
	year: (x) => `the year of ${x}`,
	month: (x) => `the month of ${x}`,
	day: (x) => `the day of ${x}`,
	hour: (x) => `the hour of ${x}`,
	minute: (x) => `the minute of ${x}`,
	second: (x) => `the second of ${x}`,
	date: (x) => `the date of ${x}`,
	time: (x) => `the time of ${x}`,
	round: (x) => `${x} rounded`,
	floor: (x) => `${x} rounded down`,
	ceiling: (x) => `${x} rounded up`,
};

const TWO_ARG: Record<string, (a: string, b: string) => string> = {
	contains: (a, b) => `${a} contains ${b}`,
	substringof: (a, b) => `${b} contains ${a}`,
	startswith: (a, b) => `${a} starts with ${b}`,
	endswith: (a, b) => `${a} ends with ${b}`,
	indexof: (a, b) => `the position of ${b} in ${a}`,
	concat: (a, b) => `${a} followed by ${b}`,
	cast: (a, b) => `${a} as ${b}`,
	isof: (a, b) => `${a} is of type ${b}`,
	"geo.distance": (a, b) => `the distance between ${a} and ${b}`,
	"geo.intersects": (a, b) => `${a} intersects ${b}`,
};

export function explainFilter(node: ODataNode, parent?: string): string {
	switch (node.type) {
		case "binary": {
			if (node.op === "and" || node.op === "or") {
				const text = flatten(node, node.op)
					.map((operand) => explainFilter(operand, node.op))
					.join(` ${node.op} `);
				// An "or" inside an "and" needs grouping to stay unambiguous.
				return parent === "and" && node.op === "or" ? `(${text})` : text;
			}
			const left = explainFilter(node.left, node.op);
			const right = explainFilter(node.right, node.op);
			if (node.op in COMPARISON) {
				if (node.right.type === "literal" && node.right.kind === "null") return `${left} ${node.op === "eq" ? "is empty" : "is set"}`;
				return `${left} ${COMPARISON[node.op]} ${right}`;
			}
			return `${left} ${ARITHMETIC[node.op] ?? node.op} ${right}`;
		}
		case "unary":
			return node.op === "not" ? `not (${explainFilter(node.operand)})` : `−${explainFilter(node.operand)}`;
		case "call": {
			const name = node.name.toLowerCase();
			const args = node.args.map((arg) => explainFilter(arg));
			if (args.length === 0 && name === "now") return "now";
			if (args.length === 1 && ONE_ARG[name]) return ONE_ARG[name](args[0]!);
			if (args.length === 2 && TWO_ARG[name]) return TWO_ARG[name](args[0]!, args[1]!);
			if (name === "substring" && args.length >= 2) return `${args[0]} from position ${args[1]}${args[2] ? `, ${args[2]} characters` : ""}`;
			return `${node.name}(${args.join(", ")})`;
		}
		case "lambda": {
			if (!node.body) return node.fn === "any" ? `${node.path} is not empty` : `every ${node.path}`;
			const body = explainFilter(node.body);
			return node.fn === "any" ? `any ${node.path} where ${body}` : `every ${node.path} where ${body}`;
		}
		case "member":
			return node.path;
		case "literal":
			return node.raw;
		case "list":
			return `(${node.items.map((item) => explainFilter(item)).join(", ")})`;
		case "group":
			return explainFilter(node.expr, parent);
	}
}
