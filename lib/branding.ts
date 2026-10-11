export const platformLogo = "/brand/sohan-logo.png";
export const platformColor = "#d4980b";
export function brandColor(value: unknown): string {
  return typeof value === "string" && /^#[a-f0-9]{6}$/i.test(value)
    ? value
    : platformColor;
}
export function brandTheme(value: unknown): Record<string, string> {
  const color = brandColor(value),
    rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  const luminance = rgb
    .map((v) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    })
    .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
  const foreground = luminance > 0.179 ? "#111111" : "#ffffff";
  return {
    "--primary": color,
    "--primary-foreground": foreground,
    "--primary-brand": color,
    "--brand-foreground": foreground,
    "--ring": color,
    "--sidebar-primary": color,
    "--sidebar-primary-foreground": foreground,
    "--sidebar-accent": `color-mix(in srgb, ${color} 12%, white)`,
    "--sidebar-accent-foreground": "#161616",
  };
}
