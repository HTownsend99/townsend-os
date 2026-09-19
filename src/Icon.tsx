import type { SVGProps } from "react";

export type IconName =
  | "alert-triangle"
  | "archive"
  | "bar-chart"
  | "building"
  | "calendar"
  | "check"
  | "check-square"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "credit-card"
  | "database"
  | "flag"
  | "inbox"
  | "list-checks"
  | "log-out"
  | "more-horizontal"
  | "plus"
  | "refresh-cw"
  | "trash-2"
  | "upload"
  | "wallet"
  | "x";

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

const paths: Record<IconName, string> = {
  "alert-triangle": "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z M12 9v4 M12 17h.01",
  archive: "M3 6h18 M5 6v14h14V6 M9 10h6",
  "bar-chart": "M3 3v18h18 M7 16v-3 M12 16V8 M17 16V5",
  building: "M3 21h18 M6 21V5l6-3 6 3v16 M9 9h.01 M15 9h.01 M9 13h.01 M15 13h.01 M9 17h.01 M15 17h.01",
  calendar: "M8 2v4 M16 2v4 M3 10h18",
  check: "M20 6 9 17l-5-5",
  "check-square": "M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  "chevron-down": "m6 9 6 6 6-6",
  "chevron-left": "m15 18-6-6 6-6",
  "chevron-right": "m9 18 6-6-6-6",
  "credit-card": "M2 10h20",
  database: "M4 6c0 2 3.6 3 8 3s8-1 8-3-3.6-3-8-3-8 1-8 3z M4 6v6c0 2 3.6 3 8 3s8-1 8-3V6 M4 12v6c0 2 3.6 3 8 3s8-1 8-3v-6",
  flag: "M5 22V4 M5 4h12l-1 5 1 5H5",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2 M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
  "list-checks": "M3 17l2 2 4-4 M3 7l2 2 4-4 M13 6h8 M13 12h8 M13 18h8",
  "log-out": "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
  "more-horizontal": "",
  plus: "M5 12h14 M12 5v14",
  "refresh-cw": "M20 6v5h-5 M4 18v-5h5 M18.7 9A7 7 0 0 0 6.2 6.2L4 11 M5.3 15A7 7 0 0 0 17.8 17.8L20 13",
  "trash-2": "M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M10 11v6 M14 11v6",
  upload: "M12 3v12 M7 8l5-5 5 5 M5 21h14a2 2 0 0 0 2-2v-4 M3 15v4a2 2 0 0 0 2 2",
  wallet: "M3 6h15a2 2 0 0 1 2 2v11H5a2 2 0 0 1-2-2V6z M3 8V5a2 2 0 0 1 2-2h12 M15 12h6v4h-6a2 2 0 0 1 0-4z",
  x: "M18 6 6 18 M6 6l12 12",
};

export function Icon({ name, size = 20, strokeWidth = 2, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {name === "calendar" ? <rect x="3" y="4" width="18" height="18" rx="2" /> : null}
      {name === "credit-card" ? <rect x="2" y="5" width="20" height="14" rx="2" /> : null}
      {name === "more-horizontal" ? (
        <>
          <circle cx="5" cy="12" r="1" />
          <circle cx="12" cy="12" r="1" />
          <circle cx="19" cy="12" r="1" />
        </>
      ) : null}
      {paths[name]
        ? paths[name].split(" M").map((path, index) => (
            <path key={index} d={index === 0 ? path : `M${path}`} />
          ))
        : null}
    </svg>
  );
}
