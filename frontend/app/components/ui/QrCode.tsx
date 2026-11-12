import { encode } from "uqr";

import styles from "./QrCode.module.css";

/**
 * QR code rendered as an SVG on the server: no image request, no data: URL (CSP img-src 'self'),
 * no inner HTML. Always dark on light, in both themes, so every scanner can read it.
 */
export function QrCode({ value, label }: { value: string; label: string }) {
  const { data, size } = encode(value, { ecc: "M", border: 2 });
  const cells: string[] = [];
  data.forEach((row, y) =>
    row.forEach((on, x) => {
      if (on) cells.push(`M${x} ${y}h1v1h-1z`);
    }),
  );
  return (
    <svg className={styles.qr} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={size} height={size} className={styles.light} />
      <path d={cells.join("")} className={styles.dark} />
    </svg>
  );
}
