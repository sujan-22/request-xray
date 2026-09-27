import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
	width: "1em",
	height: "1em",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 1.6,
	strokeLinecap: "square" as const,
	"aria-hidden": true,
};

export function ArrowUpRight(props: IconProps) {
	return (
		<svg viewBox="0 0 16 16" {...base} {...props}>
			<path d="M4.5 11.5 11.5 4.5M5.5 4.5h6v6" />
		</svg>
	);
}

export function ArrowRight(props: IconProps) {
	return (
		<svg viewBox="0 0 16 16" {...base} {...props}>
			<path d="M2.5 8h11M9 3.5 13.5 8 9 12.5" />
		</svg>
	);
}

export function ArrowDown(props: IconProps) {
	return (
		<svg viewBox="0 0 16 16" {...base} {...props}>
			<path d="M8 2.5v11M3.5 9 8 13.5 12.5 9" />
		</svg>
	);
}

export function ChevronLeft(props: IconProps) {
	return (
		<svg viewBox="0 0 16 16" {...base} {...props}>
			<path d="M10 3.5 5.5 8l4.5 4.5" />
		</svg>
	);
}

export function ChevronRight(props: IconProps) {
	return (
		<svg viewBox="0 0 16 16" {...base} {...props}>
			<path d="m6 3.5 4.5 4.5L6 12.5" />
		</svg>
	);
}

export function ChevronDown(props: IconProps) {
	return (
		<svg viewBox="0 0 16 16" {...base} {...props}>
			<path d="M3.5 6 8 10.5 12.5 6" />
		</svg>
	);
}

export function Close(props: IconProps) {
	return (
		<svg viewBox="0 0 16 16" {...base} {...props}>
			<path d="m3.5 3.5 9 9M12.5 3.5l-9 9" />
		</svg>
	);
}

export function Upload(props: IconProps) {
	return (
		<svg viewBox="0 0 16 16" {...base} {...props}>
			<path d="M8 10.5V2.5M4.5 6 8 2.5 11.5 6M2.5 10v3.5h11V10" />
		</svg>
	);
}

export function Download(props: IconProps) {
	return (
		<svg viewBox="0 0 16 16" {...base} {...props}>
			<path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M2.5 10v3.5h11V10" />
		</svg>
	);
}

export function Compare(props: IconProps) {
	return (
		<svg viewBox="0 0 16 16" {...base} {...props}>
			<path d="M2.5 3.5h4.5v9H2.5zM9 3.5h4.5v9H9z" />
		</svg>
	);
}

export function Sliders(props: IconProps) {
	return (
		<svg viewBox="0 0 16 16" {...base} {...props}>
			<path d="M2.5 4.5h11M2.5 11.5h11" />
			<path d="M5.5 3v3M10.5 10v3" strokeWidth={2} />
		</svg>
	);
}

export function Search(props: IconProps) {
	return (
		<svg viewBox="0 0 16 16" {...base} {...props}>
			<circle cx="7" cy="7" r="4.5" />
			<path d="m10.5 10.5 3 3" />
		</svg>
	);
}

export function Copy(props: IconProps) {
	return (
		<svg viewBox="0 0 16 16" {...base} {...props}>
			<path d="M5.5 5.5h8v8h-8z" />
			<path d="M10.5 5.5v-3h-8v8h3" />
		</svg>
	);
}

export function Check(props: IconProps) {
	return (
		<svg viewBox="0 0 16 16" {...base} {...props}>
			<path d="m3 8.5 3 3 7-7" />
		</svg>
	);
}

export function Eye(props: IconProps) {
	return (
		<svg viewBox="0 0 16 16" {...base} {...props}>
			<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
			<circle cx="8" cy="8" r="2" />
		</svg>
	);
}

export function EyeOff(props: IconProps) {
	return (
		<svg viewBox="0 0 16 16" {...base} {...props}>
			<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
			<path d="m2.5 13.5 11-11" />
		</svg>
	);
}

export function Lock(props: IconProps) {
	return (
		<svg viewBox="0 0 16 16" {...base} {...props}>
			<path d="M3.5 7.5h9v6h-9zM5.5 7.5V5a2.5 2.5 0 0 1 5 0v2.5" />
		</svg>
	);
}

export function Keyboard(props: IconProps) {
	return (
		<svg viewBox="0 0 16 16" {...base} {...props}>
			<path d="M1.5 4h13v8h-13z" />
			<path d="M4 6.5h.5M7 6.5h.5M10 6.5h.5M4.5 9.5h7" />
		</svg>
	);
}

export function Target(props: IconProps) {
	return (
		<svg viewBox="0 0 16 16" {...base} {...props}>
			<circle cx="8" cy="8" r="5.5" />
			<path d="M8 1v3M8 12v3M1 8h3M12 8h3" />
		</svg>
	);
}

export function Reset(props: IconProps) {
	return (
		<svg viewBox="0 0 16 16" {...base} {...props}>
			<path d="M2.5 3v3.5H6" />
			<path d="M3 6.5A5.5 5.5 0 1 1 2.8 10" />
		</svg>
	);
}

/** The Request X-ray mark: a small film plate, three spans and a scan line. */
export function Mark({ className = "", ...props }: IconProps) {
	return (
		<svg viewBox="0 0 24 24" className={className} aria-hidden {...props}>
			<rect x="0.5" y="0.5" width="23" height="23" rx="3" fill="#111214" stroke="rgb(238 235 227 / .18)" />
			<rect x="4" y="6" width="9" height="2.4" rx=".6" fill="#eeebe3" />
			<rect x="8" y="10.8" width="10" height="2.4" rx=".6" fill="#eeebe3" opacity=".7" />
			<rect x="11" y="15.6" width="7" height="2.4" rx=".6" fill="#ff4d17" />
			<rect x="15.2" y="3.5" width="1.2" height="17" fill="#ff4d17" />
		</svg>
	);
}
