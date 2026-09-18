import { z } from 'zod';
import {
  BREAKPOINTS,
  BREAKPOINT_MAX_WIDTH,
  EMPTY_BOX,
  backgroundSchema,
  normaliseLength,
  type BoxValue,
} from '@/lib/cms/design';
import { fontStack } from '@/lib/cms/google-fonts';

/**
 * The one design schema every form on the site is rendered from.
 *
 * Built on the same primitives as the section design system — the same length
 * normalisation, the same box model, the same background schema, the same three
 * breakpoints — so an admin who has styled a section already knows these
 * controls, and a fix to length parsing fixes both.
 *
 * Values become CSS custom properties rather than utility classes. That is what
 * lets an admin type `37px`, `4.5rem` or `85%` at three breakpoints without
 * generating a byte of extra Tailwind, and it is why a popup, a hero and a
 * product enquiry form can look completely different while sharing one
 * renderer: the markup is identical, only the variables differ.
 *
 * Every field defaults to empty, and empty means "inherit what the form always
 * looked like". A form nobody has restyled emits no CSS at all and renders
 * byte-for-byte as it did before this system existed.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const length = z.preprocess(normaliseLength, z.string());

const box = z.object({
  top: length.default(''),
  right: length.default(''),
  bottom: length.default(''),
  left: length.default(''),
});

/**
 * A colour. Accepts 6- and 8-digit hex (the latter carries alpha) and rgb()
 * / rgba() so a value pasted from a design tool is not silently dropped.
 * Anything else becomes empty rather than reaching the page — this string is
 * interpolated into a style attribute, so it must never carry a semicolon, a
 * brace or a url().
 */
const COLOR_PATTERN =
  /^(#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\))$/;

const color = z
  .string()
  .trim()
  .transform((v) => (COLOR_PATTERN.test(v) ? v : ''))
  .catch('')
  .default('');

const fontFamily = z
  .string()
  .trim()
  .max(60)
  // Only a family name — no quotes, semicolons or braces can survive into CSS.
  .transform((v) => v.replace(/["'`;{}()<>]/g, ''))
  .catch('')
  .default('');

const fontWeight = z.coerce.number().int().min(100).max(900).nullable().catch(null).default(null);

const textTransform = z
  .enum(['none', 'uppercase', 'lowercase', 'capitalize'])
  .catch('none')
  .default('none');

/** One typographic voice: label, input, placeholder, button, error, help. */
const typography = z.object({
  fontFamily,
  fontSize: length.default(''),
  fontWeight,
  lineHeight: z
    .string()
    .trim()
    .max(10)
    .transform((v) => (/^\d+(\.\d+)?$/.test(v) || normaliseLength(v) ? v : ''))
    .catch('')
    .default(''),
  letterSpacing: length.default(''),
  textTransform,
  color,
});

export type Typography = z.infer<typeof typography>;

const EMPTY_TYPOGRAPHY: Typography = typography.parse({});

const BORDER_STYLES = ['none', 'solid', 'dashed', 'dotted'] as const;
const SHADOWS = ['none', 'sm', 'md', 'lg', 'xl'] as const;

export const SHADOW_VALUES: Record<(typeof SHADOWS)[number], string> = {
  none: 'none',
  sm: '0 1px 2px rgb(0 0 0 / 0.05)',
  md: '0 4px 12px rgb(0 0 0 / 0.08)',
  lg: '0 10px 30px rgb(0 0 0 / 0.12)',
  xl: '0 20px 50px rgb(0 0 0 / 0.18)',
};

const border = z.object({
  style: z.enum(BORDER_STYLES).catch('none').default('none'),
  width: length.default(''),
  color,
  radius: length.default(''),
});

// ---------------------------------------------------------------------------
// Per-breakpoint values
// ---------------------------------------------------------------------------

/**
 * Everything that may differ between desktop, tablet and mobile.
 *
 * Empty inherits upwards: a mobile value falls back to tablet, which falls back
 * to desktop, which falls back to the renderer's own default. That is why only
 * the breakpoints an admin actually touched emit any CSS.
 */
const breakpoint = z.object({
  columns: z.coerce.number().int().min(1).max(4).nullable().catch(null).default(null),
  width: length.default(''),
  maxWidth: length.default(''),
  margin: box.default(EMPTY_BOX),
  padding: box.default(EMPTY_BOX),
  rowGap: length.default(''),
  columnGap: length.default(''),
  labelGap: length.default(''),
  helpGap: length.default(''),
  buttonGap: length.default(''),
  baseFontSize: length.default(''),
  labelFontSize: length.default(''),
  inputFontSize: length.default(''),
  buttonFontSize: length.default(''),
  inputHeight: length.default(''),
});

export type FormBreakpoint = z.infer<typeof breakpoint>;

const EMPTY_BREAKPOINT: FormBreakpoint = breakpoint.parse({});

// ---------------------------------------------------------------------------
// The full schema
// ---------------------------------------------------------------------------

export const ALIGNMENTS = ['left', 'center', 'right'] as const;
export type FormAlignment = (typeof ALIGNMENTS)[number];

export const LABEL_POSITIONS = ['top', 'left', 'floating'] as const;
export type LabelPosition = (typeof LABEL_POSITIONS)[number];

export const BUTTON_WIDTHS = ['auto', 'full', 'custom'] as const;
export const CHOICE_LAYOUTS = ['vertical', 'horizontal', 'grid'] as const;
export const SUCCESS_BEHAVIOURS = ['inline', 'replace', 'redirect'] as const;
export type SuccessBehaviour = (typeof SUCCESS_BEHAVIOURS)[number];

export const formDesignSchema = z.object({
  /** Bumped only if a stored shape ever has to be migrated. */
  version: z.literal(1).catch(1).default(1),

  layout: z
    .object({
      align: z.enum(ALIGNMENTS).catch('left').default('left'),
      fullWidth: z.coerce.boolean().catch(false).default(false),
    })
    .prefault({}),

  container: z.object({
    background: backgroundSchema.default(backgroundSchema.parse({})),
    border: border.default(border.parse({})),
    shadow: z.enum(SHADOWS).catch('none').default('none'),
    /**
     * Backdrop blur. Off by default: it is expensive to composite and it
     * degrades to a plain background where unsupported, so it is opt-in.
     */
    backdropBlur: length.default(''),
  }).prefault({}),

  typography: z.object({
    base: typography.default(EMPTY_TYPOGRAPHY),
    label: typography.default(EMPTY_TYPOGRAPHY),
    input: typography.default(EMPTY_TYPOGRAPHY),
    placeholder: typography.default(EMPTY_TYPOGRAPHY),
    help: typography.default(EMPTY_TYPOGRAPHY),
    button: typography.default(EMPTY_TYPOGRAPHY),
    error: typography.default(EMPTY_TYPOGRAPHY),
  }).prefault({}),

  label: z.object({
    position: z.enum(LABEL_POSITIONS).catch('top').default('top'),
    showRequiredMark: z.coerce.boolean().catch(true).default(true),
    requiredMarkColor: color,
    /** Only used when position is "left". */
    width: length.default(''),
  }).prefault({}),

  placeholder: z.object({
    opacity: z.coerce.number().min(0).max(100).nullable().catch(null).default(null),
  }).prefault({}),

  input: z.object({
    background: color,
    minHeight: length.default(''),
    padding: box.default(EMPTY_BOX),
    border: border.default(border.parse({})),
    focusBorderColor: color,
    focusRingColor: color,
    focusRingWidth: length.default(''),
    focusBackground: color,
    hoverBorderColor: color,
    disabledBackground: color,
    disabledTextColor: color,
    errorBorderColor: color,
    errorBackground: color,
    /** Textarea only. */
    textareaRows: z.coerce.number().int().min(2).max(20).nullable().catch(null).default(null),
    textareaResize: z.enum(['none', 'vertical', 'both']).catch('vertical').default('vertical'),
  }).prefault({}),

  choice: z.object({
    size: length.default(''),
    accentColor: color,
    gap: length.default(''),
    layout: z.enum(CHOICE_LAYOUTS).catch('vertical').default('vertical'),
  }).prefault({}),

  button: z.object({
    align: z.enum(ALIGNMENTS).catch('left').default('left'),
    width: z.enum(BUTTON_WIDTHS).catch('auto').default('auto'),
    customWidth: length.default(''),
    height: length.default(''),
    padding: box.default(EMPTY_BOX),
    background: color,
    textColor: color,
    border: border.default(border.parse({})),
    hoverBackground: color,
    hoverTextColor: color,
    hoverBorderColor: color,
    activeBackground: color,
    disabledBackground: color,
    disabledTextColor: color,
    /** Lucide icon key, drawn from the existing NavIcon catalogue. */
    icon: z
      .string()
      .trim()
      .max(30)
      .regex(/^[a-z-]*$/)
      .catch('')
      .default(''),
    iconPosition: z.enum(['left', 'right']).catch('left').default('left'),
    loadingText: z.string().trim().max(40).catch('').default(''),
  }).prefault({}),

  validation: z.object({
    errorSpacing: length.default(''),
    /** Defaults used when a field defines no message of its own. */
    requiredMessage: z.string().trim().max(160).catch('').default(''),
    emailMessage: z.string().trim().max(160).catch('').default(''),
    phoneMessage: z.string().trim().max(160).catch('').default(''),
    urlMessage: z.string().trim().max(160).catch('').default(''),
  }).prefault({}),

  success: z.object({
    behaviour: z.enum(SUCCESS_BEHAVIOURS).catch('inline').default('inline'),
    heading: z.string().trim().max(120).catch('').default(''),
    showIcon: z.coerce.boolean().catch(true).default(true),
    background: color,
    textColor: color,
    headingColor: color,
    border: border.default(border.parse({})),
    padding: box.default(EMPTY_BOX),
  }).prefault({}),

  desktop: breakpoint.default(EMPTY_BREAKPOINT),
  tablet: breakpoint.default(EMPTY_BREAKPOINT),
  mobile: breakpoint.default(EMPTY_BREAKPOINT),
});

export type FormDesign = z.infer<typeof formDesignSchema>;

export const DEFAULT_FORM_DESIGN: FormDesign = formDesignSchema.parse({
  layout: {},
  container: {},
  typography: {},
  label: {},
  placeholder: {},
  input: {},
  choice: {},
  button: {},
  validation: {},
  success: {},
});

/**
 * Reads a stored design, tolerating anything.
 *
 * A form saved before this existed stores null; a form saved by a future
 * version may carry keys this build does not know. Both must render, so every
 * field has `.catch()` and the whole parse falls back to defaults rather than
 * throwing a page away.
 */
export function parseFormDesign(raw: unknown): FormDesign {
  if (!raw || typeof raw !== 'object') return DEFAULT_FORM_DESIGN;
  const result = formDesignSchema.safeParse(raw);
  return result.success ? result.data : DEFAULT_FORM_DESIGN;
}

/** True when the admin has not changed anything, so no CSS need be emitted. */
export function isDefaultDesign(design: FormDesign): boolean {
  return JSON.stringify(design) === JSON.stringify(DEFAULT_FORM_DESIGN);
}

// ---------------------------------------------------------------------------
// Compilation to CSS
// ---------------------------------------------------------------------------

type VarMap = Record<string, string>;

function put(vars: VarMap, name: string, value: string | number | null | undefined): void {
  if (value === null || value === undefined) return;
  const text = String(value).trim();
  if (!text) return;
  vars[name] = text;
}

function boxValue(value: BoxValue): string {
  const { top, right, bottom, left } = value;
  if (!top && !right && !bottom && !left) return '';
  return `${top || '0px'} ${right || '0px'} ${bottom || '0px'} ${left || '0px'}`;
}

/** Typography for one voice, under a shared variable prefix. */
function typographyVars(vars: VarMap, prefix: string, value: Typography): void {
  if (value.fontFamily) put(vars, `${prefix}-font`, fontStack(value.fontFamily));
  put(vars, `${prefix}-size`, value.fontSize);
  put(vars, `${prefix}-weight`, value.fontWeight);
  put(vars, `${prefix}-line`, value.lineHeight);
  put(vars, `${prefix}-spacing`, value.letterSpacing);
  if (value.textTransform !== 'none') put(vars, `${prefix}-transform`, value.textTransform);
  put(vars, `${prefix}-color`, value.color);
}

function borderVars(vars: VarMap, prefix: string, value: z.infer<typeof border>): void {
  if (value.style !== 'none') {
    put(vars, `${prefix}-border-style`, value.style);
    put(vars, `${prefix}-border-width`, value.width || '1px');
    put(vars, `${prefix}-border-color`, value.color);
  } else if (value.width || value.color) {
    // A width or colour without a style still means the admin wants a border.
    put(vars, `${prefix}-border-style`, 'solid');
    put(vars, `${prefix}-border-width`, value.width || '1px');
    put(vars, `${prefix}-border-color`, value.color);
  }
  put(vars, `${prefix}-radius`, value.radius);
}

/** The per-breakpoint slice. Only non-empty values are emitted. */
function breakpointVars(value: FormBreakpoint): VarMap {
  const vars: VarMap = {};
  put(vars, '--fd-cols', value.columns);
  put(vars, '--fd-width', value.width);
  put(vars, '--fd-max-w', value.maxWidth);
  put(vars, '--fd-margin', boxValue(value.margin));
  put(vars, '--fd-padding', boxValue(value.padding));
  put(vars, '--fd-row-gap', value.rowGap);
  put(vars, '--fd-col-gap', value.columnGap);
  put(vars, '--fd-label-gap', value.labelGap);
  put(vars, '--fd-help-gap', value.helpGap);
  put(vars, '--fd-button-gap', value.buttonGap);
  put(vars, '--fd-base-size', value.baseFontSize);
  put(vars, '--fd-label-size', value.labelFontSize);
  put(vars, '--fd-input-size', value.inputFontSize);
  put(vars, '--fd-button-size', value.buttonFontSize);
  put(vars, '--fd-input-h', value.inputHeight);
  return vars;
}

export type FormStyles = {
  /** Stable class the media queries and state rules hang off. */
  className: string;
  /** Desktop values, inline so they always win over the stylesheet. */
  style: Record<string, string>;
  /** Tablet/mobile overrides plus state rules. Empty when nothing is set. */
  css: string;
  /** Background image layer, when one is configured. */
  backgroundImage: string | null;
  overlay: string | null;
  columns: { desktop: number; tablet: number; mobile: number };
  labelPosition: LabelPosition;
  choiceLayout: (typeof CHOICE_LAYOUTS)[number];
};

/**
 * Column counts per breakpoint, inheriting downwards.
 *
 * Desktop falls back to one column, which is what every form did before this
 * system existed. Tablet and mobile narrow rather than widen, because a form
 * that fits three columns on a laptop never does on a phone.
 */
export function resolveFormColumns(design: FormDesign): FormStyles['columns'] {
  const clamp = (value: number) => Math.min(Math.max(Math.round(value) || 1, 1), 4);
  const desktop = clamp(design.desktop.columns ?? 1);
  const tablet = clamp(design.tablet.columns ?? Math.min(desktop, 2));
  const mobile = clamp(design.mobile.columns ?? 1);
  return { desktop, tablet, mobile };
}

/**
 * Compiles a design into everything the renderer needs.
 *
 * State styling — focus, hover, disabled, error — cannot be expressed inline,
 * so it becomes real CSS rules scoped to this form's generated class. Nothing
 * admin-entered reaches a selector: only declaration values, each already
 * normalised to a length, a colour or an enum by the schema above.
 */
export function buildFormStyles(
  design: FormDesign,
  formKey: string,
  backgroundImageUrl: string | null = null,
): FormStyles {
  const className = `fd-${formKey.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const columns = resolveFormColumns(design);

  const style: VarMap = { ...breakpointVars(design.desktop) };
  put(style, '--fd-cols', columns.desktop);

  // Container
  const bg = design.container.background;
  if (bg.type === 'solid' && bg.color) put(style, '--fd-bg', bg.color);
  else if (bg.type === 'gradient' && (bg.gradientFrom || bg.gradientTo)) {
    put(
      style,
      '--fd-bg-image',
      `linear-gradient(${bg.gradientAngle}deg, ${bg.gradientFrom || 'transparent'}, ${bg.gradientTo || 'transparent'})`,
    );
  }
  borderVars(style, '--fd', design.container.border);
  if (design.container.shadow !== 'none') {
    put(style, '--fd-shadow', SHADOW_VALUES[design.container.shadow]);
  }
  put(style, '--fd-blur', design.container.backdropBlur);

  // Typography
  typographyVars(style, '--fd-base', design.typography.base);
  typographyVars(style, '--fd-label', design.typography.label);
  typographyVars(style, '--fd-input', design.typography.input);
  typographyVars(style, '--fd-ph', design.typography.placeholder);
  typographyVars(style, '--fd-help', design.typography.help);
  typographyVars(style, '--fd-btn', design.typography.button);
  typographyVars(style, '--fd-err', design.typography.error);

  put(style, '--fd-required-color', design.label.requiredMarkColor);
  put(style, '--fd-label-w', design.label.width);
  if (design.placeholder.opacity !== null) {
    put(style, '--fd-ph-opacity', String(design.placeholder.opacity / 100));
  }

  // Input
  put(style, '--fd-input-bg', design.input.background);
  put(style, '--fd-input-min-h', design.input.minHeight);
  put(style, '--fd-input-padding', boxValue(design.input.padding));
  borderVars(style, '--fd-input', design.input.border);
  put(style, '--fd-input-focus-border', design.input.focusBorderColor);
  put(style, '--fd-input-focus-ring', design.input.focusRingColor);
  put(style, '--fd-input-focus-ring-w', design.input.focusRingWidth);
  put(style, '--fd-input-focus-bg', design.input.focusBackground);
  put(style, '--fd-input-hover-border', design.input.hoverBorderColor);
  put(style, '--fd-input-disabled-bg', design.input.disabledBackground);
  put(style, '--fd-input-disabled-color', design.input.disabledTextColor);
  put(style, '--fd-input-error-border', design.input.errorBorderColor);
  put(style, '--fd-input-error-bg', design.input.errorBackground);
  // 'vertical' is already the stylesheet's fallback, so only a change is worth
  // emitting.
  if (design.input.textareaResize !== 'vertical') {
    put(style, '--fd-textarea-resize', design.input.textareaResize);
  }

  // Choice controls
  put(style, '--fd-choice-size', design.choice.size);
  put(style, '--fd-choice-accent', design.choice.accentColor);
  put(style, '--fd-choice-gap', design.choice.gap);

  // Button
  put(style, '--fd-btn-h', design.button.height);
  put(style, '--fd-btn-padding', boxValue(design.button.padding));
  put(style, '--fd-btn-bg', design.button.background);
  put(style, '--fd-btn-color', design.button.textColor);
  borderVars(style, '--fd-btn', design.button.border);
  put(style, '--fd-btn-w', design.button.width === 'custom' ? design.button.customWidth : '');

  // Validation + success
  put(style, '--fd-err-gap', design.validation.errorSpacing);
  put(style, '--fd-ok-bg', design.success.background);
  put(style, '--fd-ok-color', design.success.textColor);
  put(style, '--fd-ok-heading', design.success.headingColor);
  put(style, '--fd-ok-padding', boxValue(design.success.padding));
  borderVars(style, '--fd-ok', design.success.border);

  // Responsive overrides
  const blocks: string[] = [];
  for (const bp of ['tablet', 'mobile'] as const) {
    const vars = { ...breakpointVars(design[bp]) };
    // The derived column count is only worth emitting when it differs from what
    // the element already inherits — otherwise a form with default design would
    // ship two media queries that change nothing.
    if (design[bp].columns === null && columns[bp] !== columns.desktop) {
      vars['--fd-cols'] = String(columns[bp]);
    }
    const entries = Object.entries(vars);
    if (entries.length === 0) continue;
    const decls = entries.map(([key, value]) => `${key}:${value}`).join(';');
    blocks.push(`@media (max-width:${BREAKPOINT_MAX_WIDTH[bp]}px){.${className}{${decls}}}`);
  }

  // Hover and active states, which cannot be inline.
  const hover: string[] = [];
  if (design.button.hoverBackground) hover.push(`background:${design.button.hoverBackground}`);
  if (design.button.hoverTextColor) hover.push(`color:${design.button.hoverTextColor}`);
  if (design.button.hoverBorderColor) hover.push(`border-color:${design.button.hoverBorderColor}`);
  if (hover.length > 0) {
    blocks.push(`.${className} .fd-submit:not(:disabled):hover{${hover.join(';')}}`);
  }
  if (design.button.activeBackground) {
    blocks.push(
      `.${className} .fd-submit:not(:disabled):active{background:${design.button.activeBackground}}`,
    );
  }
  const disabled: string[] = [];
  if (design.button.disabledBackground) {
    disabled.push(`background:${design.button.disabledBackground}`);
  }
  if (design.button.disabledTextColor) disabled.push(`color:${design.button.disabledTextColor}`);
  if (disabled.length > 0) {
    blocks.push(`.${className} .fd-submit:disabled{${disabled.join(';')}}`);
  }

  return {
    className,
    style,
    css: blocks.join(''),
    backgroundImage:
      bg.type === 'image' && backgroundImageUrl
        ? `url("${backgroundImageUrl.replace(/"/g, '%22')}")`
        : null,
    overlay:
      bg.overlayColor && bg.overlayOpacity > 0
        ? hexToRgba(bg.overlayColor, bg.overlayOpacity)
        : null,
    columns,
    labelPosition: design.label.position,
    choiceLayout: design.choice.layout,
  };
}

function hexToRgba(hexColor: string, opacityPercent: number): string {
  const value = hexColor.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${(opacityPercent / 100).toFixed(2)})`;
}

export { BREAKPOINTS };
