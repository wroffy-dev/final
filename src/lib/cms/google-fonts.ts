/**
 * Google Fonts catalogue.
 *
 * A static, bundled list — the admin font picker searches it client-side and the
 * public site only ever requests the families and weights actually selected in
 * Settings → Typography. Nothing here reaches the browser as a font file unless
 * an admin picked it.
 */

export type GoogleFont = {
  family: string;
  category: 'sans-serif' | 'serif' | 'display' | 'handwriting' | 'monospace';
  /** Weights Google actually serves for this family. */
  weights: number[];
};

const SANS_STANDARD = [300, 400, 500, 600, 700, 800];
const SANS_WIDE = [100, 200, 300, 400, 500, 600, 700, 800, 900];

export const GOOGLE_FONTS: GoogleFont[] = [
  { family: 'Inter', category: 'sans-serif', weights: SANS_WIDE },
  { family: 'Roboto', category: 'sans-serif', weights: [100, 300, 400, 500, 700, 900] },
  { family: 'Open Sans', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800] },
  { family: 'Lato', category: 'sans-serif', weights: [100, 300, 400, 700, 900] },
  { family: 'Montserrat', category: 'sans-serif', weights: SANS_WIDE },
  { family: 'Poppins', category: 'sans-serif', weights: SANS_WIDE },
  { family: 'Manrope', category: 'sans-serif', weights: [200, 300, 400, 500, 600, 700, 800] },
  { family: 'Nunito', category: 'sans-serif', weights: [200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Nunito Sans', category: 'sans-serif', weights: SANS_WIDE },
  { family: 'Work Sans', category: 'sans-serif', weights: SANS_WIDE },
  { family: 'DM Sans', category: 'sans-serif', weights: SANS_WIDE },
  { family: 'Plus Jakarta Sans', category: 'sans-serif', weights: [200, 300, 400, 500, 600, 700, 800] },
  { family: 'Space Grotesk', category: 'sans-serif', weights: [300, 400, 500, 600, 700] },
  { family: 'Outfit', category: 'sans-serif', weights: SANS_WIDE },
  { family: 'Figtree', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Source Sans 3', category: 'sans-serif', weights: [200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Raleway', category: 'sans-serif', weights: SANS_WIDE },
  { family: 'Rubik', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Karla', category: 'sans-serif', weights: [200, 300, 400, 500, 600, 700, 800] },
  { family: 'Mulish', category: 'sans-serif', weights: [200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Barlow', category: 'sans-serif', weights: SANS_WIDE },
  { family: 'Public Sans', category: 'sans-serif', weights: SANS_WIDE },
  { family: 'IBM Plex Sans', category: 'sans-serif', weights: [100, 200, 300, 400, 500, 600, 700] },
  { family: 'Noto Sans', category: 'sans-serif', weights: SANS_WIDE },
  { family: 'PT Sans', category: 'sans-serif', weights: [400, 700] },
  { family: 'Ubuntu', category: 'sans-serif', weights: [300, 400, 500, 700] },
  { family: 'Fira Sans', category: 'sans-serif', weights: SANS_WIDE },
  { family: 'Cabin', category: 'sans-serif', weights: [400, 500, 600, 700] },
  { family: 'Quicksand', category: 'sans-serif', weights: [300, 400, 500, 600, 700] },
  { family: 'Josefin Sans', category: 'sans-serif', weights: [100, 200, 300, 400, 500, 600, 700] },
  { family: 'Heebo', category: 'sans-serif', weights: SANS_WIDE },
  { family: 'Assistant', category: 'sans-serif', weights: [200, 300, 400, 500, 600, 700, 800] },
  { family: 'Overpass', category: 'sans-serif', weights: SANS_WIDE },
  { family: 'Sora', category: 'sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800] },
  { family: 'Urbanist', category: 'sans-serif', weights: SANS_WIDE },
  { family: 'Lexend', category: 'sans-serif', weights: SANS_WIDE },
  { family: 'Epilogue', category: 'sans-serif', weights: SANS_WIDE },
  { family: 'Onest', category: 'sans-serif', weights: SANS_WIDE },
  { family: 'Geist', category: 'sans-serif', weights: SANS_WIDE },
  { family: 'Instrument Sans', category: 'sans-serif', weights: [400, 500, 600, 700] },
  { family: 'Schibsted Grotesk', category: 'sans-serif', weights: [400, 500, 600, 700, 800, 900] },
  { family: 'Archivo', category: 'sans-serif', weights: SANS_WIDE },
  { family: 'Chivo', category: 'sans-serif', weights: SANS_WIDE },
  { family: 'Hind', category: 'sans-serif', weights: [300, 400, 500, 600, 700] },
  { family: 'Titillium Web', category: 'sans-serif', weights: [200, 300, 400, 600, 700, 900] },
  { family: 'Exo 2', category: 'sans-serif', weights: SANS_WIDE },
  { family: 'Kanit', category: 'sans-serif', weights: SANS_WIDE },
  { family: 'Prompt', category: 'sans-serif', weights: SANS_WIDE },
  { family: 'Signika', category: 'sans-serif', weights: [300, 400, 500, 600, 700] },
  { family: 'Asap', category: 'sans-serif', weights: SANS_WIDE },
  { family: 'Catamaran', category: 'sans-serif', weights: SANS_WIDE },
  { family: 'Jost', category: 'sans-serif', weights: SANS_WIDE },
  { family: 'Red Hat Display', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Red Hat Text', category: 'sans-serif', weights: [300, 400, 500, 600, 700] },
  { family: 'Be Vietnam Pro', category: 'sans-serif', weights: SANS_WIDE },
  { family: 'Albert Sans', category: 'sans-serif', weights: SANS_WIDE },
  { family: 'General Sans', category: 'sans-serif', weights: SANS_STANDARD },
  { family: 'Mona Sans', category: 'sans-serif', weights: SANS_WIDE },
  { family: 'Hanken Grotesk', category: 'sans-serif', weights: SANS_WIDE },
  { family: 'Anek Latin', category: 'sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800] },
  { family: 'Gabarito', category: 'sans-serif', weights: [400, 500, 600, 700, 800, 900] },
  { family: 'Wix Madefor Display', category: 'sans-serif', weights: [400, 500, 600, 700, 800] },
  { family: 'Bricolage Grotesque', category: 'sans-serif', weights: [200, 300, 400, 500, 600, 700, 800] },

  { family: 'Merriweather', category: 'serif', weights: [300, 400, 700, 900] },
  { family: 'Playfair Display', category: 'serif', weights: [400, 500, 600, 700, 800, 900] },
  { family: 'Lora', category: 'serif', weights: [400, 500, 600, 700] },
  { family: 'PT Serif', category: 'serif', weights: [400, 700] },
  { family: 'Source Serif 4', category: 'serif', weights: [200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Libre Baskerville', category: 'serif', weights: [400, 700] },
  { family: 'Crimson Pro', category: 'serif', weights: [200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'EB Garamond', category: 'serif', weights: [400, 500, 600, 700, 800] },
  { family: 'Cormorant Garamond', category: 'serif', weights: [300, 400, 500, 600, 700] },
  { family: 'Bitter', category: 'serif', weights: SANS_WIDE },
  { family: 'Domine', category: 'serif', weights: [400, 500, 600, 700] },
  { family: 'Zilla Slab', category: 'serif', weights: [300, 400, 500, 600, 700] },
  { family: 'Noto Serif', category: 'serif', weights: SANS_WIDE },
  { family: 'Spectral', category: 'serif', weights: [200, 300, 400, 500, 600, 700, 800] },
  { family: 'Frank Ruhl Libre', category: 'serif', weights: [300, 400, 500, 600, 700, 800, 900] },
  { family: 'Newsreader', category: 'serif', weights: [200, 300, 400, 500, 600, 700, 800] },
  { family: 'Instrument Serif', category: 'serif', weights: [400] },
  { family: 'DM Serif Display', category: 'serif', weights: [400] },
  { family: 'Fraunces', category: 'serif', weights: SANS_WIDE },
  { family: 'Literata', category: 'serif', weights: [200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Rokkitt', category: 'serif', weights: SANS_WIDE },
  { family: 'Arvo', category: 'serif', weights: [400, 700] },

  { family: 'Oswald', category: 'display', weights: [200, 300, 400, 500, 600, 700] },
  { family: 'Bebas Neue', category: 'display', weights: [400] },
  { family: 'Anton', category: 'display', weights: [400] },
  { family: 'Archivo Black', category: 'display', weights: [400] },
  { family: 'Righteous', category: 'display', weights: [400] },
  { family: 'Alfa Slab One', category: 'display', weights: [400] },
  { family: 'Syne', category: 'display', weights: [400, 500, 600, 700, 800] },
  { family: 'Unbounded', category: 'display', weights: [200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Clash Display', category: 'display', weights: SANS_STANDARD },
  { family: 'Chakra Petch', category: 'display', weights: [300, 400, 500, 600, 700] },
  { family: 'Orbitron', category: 'display', weights: [400, 500, 600, 700, 800, 900] },
  { family: 'Comfortaa', category: 'display', weights: [300, 400, 500, 600, 700] },
  { family: 'Lilita One', category: 'display', weights: [400] },
  { family: 'Bungee', category: 'display', weights: [400] },

  { family: 'Caveat', category: 'handwriting', weights: [400, 500, 600, 700] },
  { family: 'Dancing Script', category: 'handwriting', weights: [400, 500, 600, 700] },
  { family: 'Pacifico', category: 'handwriting', weights: [400] },
  { family: 'Satisfy', category: 'handwriting', weights: [400] },
  { family: 'Great Vibes', category: 'handwriting', weights: [400] },
  { family: 'Kalam', category: 'handwriting', weights: [300, 400, 700] },

  { family: 'JetBrains Mono', category: 'monospace', weights: [100, 200, 300, 400, 500, 600, 700, 800] },
  { family: 'Fira Code', category: 'monospace', weights: [300, 400, 500, 600, 700] },
  { family: 'IBM Plex Mono', category: 'monospace', weights: [100, 200, 300, 400, 500, 600, 700] },
  { family: 'Source Code Pro', category: 'monospace', weights: [200, 300, 400, 500, 600, 700, 800, 900] },
  { family: 'Space Mono', category: 'monospace', weights: [400, 700] },
  { family: 'Roboto Mono', category: 'monospace', weights: [100, 200, 300, 400, 500, 600, 700] },
];

const BY_FAMILY = new Map(GOOGLE_FONTS.map((font) => [font.family.toLowerCase(), font]));

export function findGoogleFont(family: string | null | undefined): GoogleFont | null {
  if (!family) return null;
  return BY_FAMILY.get(family.trim().toLowerCase()) ?? null;
}

export const FALLBACK_STACKS: Record<GoogleFont['category'], string> = {
  'sans-serif': 'ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif',
  serif: 'ui-serif, Georgia, Cambria, Times New Roman, serif',
  display: 'ui-sans-serif, system-ui, sans-serif',
  handwriting: 'ui-serif, cursive',
  monospace: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

/** A safe CSS `font-family` value for a family name that may not be in the catalogue. */
export function fontStack(family: string | null | undefined): string {
  const name = (family ?? '').replace(/["'\;{}]/g, '').trim();
  if (!name) return FALLBACK_STACKS['sans-serif'];
  const font = findGoogleFont(name);
  return `'${name}', ${FALLBACK_STACKS[font?.category ?? 'sans-serif']}`;
}

/** Clamps a requested weight to one the family actually ships. */
export function nearestWeight(family: string | null | undefined, weight: number): number {
  const font = findGoogleFont(family);
  if (!font || font.weights.length === 0) return weight;
  if (font.weights.includes(weight)) return weight;
  return font.weights.reduce((best, candidate) =>
    Math.abs(candidate - weight) < Math.abs(best - weight) ? candidate : best,
  );
}

export type FontRequest = { family: string; weights: number[] };

/**
 * Builds the single Google Fonts stylesheet URL for exactly the families and
 * weights the site uses. Families outside the catalogue are skipped rather than
 * requested blindly, so a typo never costs a round trip.
 */
export function googleFontsHref(requests: FontRequest[]): string | null {
  const merged = new Map<string, Set<number>>();

  for (const request of requests) {
    const font = findGoogleFont(request.family);
    if (!font) continue;
    const set = merged.get(font.family) ?? new Set<number>();
    for (const weight of request.weights) set.add(nearestWeight(font.family, weight));
    if (set.size === 0) set.add(nearestWeight(font.family, 400));
    merged.set(font.family, set);
  }

  if (merged.size === 0) return null;

  const families = Array.from(merged.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([family, weights]) => {
      const list = Array.from(weights).sort((a, b) => a - b).join(';');
      return `family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@${list}`;
    });

  return `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`;
}

export const FONT_CATEGORY_LABELS: Record<GoogleFont['category'], string> = {
  'sans-serif': 'Sans serif',
  serif: 'Serif',
  display: 'Display',
  handwriting: 'Handwriting',
  monospace: 'Monospace',
};
