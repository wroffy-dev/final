import { z } from 'zod';
import type { FieldDescriptor } from './fields';

/**
 * The controls every slider section shares.
 *
 * One schema and one field list, spread into each slider block, so the seven
 * of them cannot drift apart and a control added here appears on all of them.
 *
 * What is deliberately *not* here: section width, content width, background,
 * border radius, padding, margin, alignment and the per-breakpoint overrides
 * of all of those. Every section on this site already has them, on the Design,
 * Responsive and Advanced tabs, resolved by `SectionDesign` — a slider is a
 * section, so it gets them for free. Repeating them as block fields would give
 * an editor two padding controls that disagree.
 */

export const sliderSettingsSchema = z.object({
  autoplay: z.coerce.boolean().catch(false).default(false),
  /** Milliseconds a slide rests before the next one. */
  autoplayDelay: z.coerce.number().int().min(1000).max(30000).catch(5000).default(5000),
  /** Transition duration. Zero means no animation at all. */
  speed: z.coerce.number().int().min(0).max(2000).catch(400).default(400),
  loop: z.coerce.boolean().catch(true).default(true),
  pauseOnHover: z.coerce.boolean().catch(true).default(true),
  arrows: z.coerce.boolean().catch(true).default(true),
  dots: z.coerce.boolean().catch(true).default(true),
  /** Pointer drag and touch swipe are the same gesture to a browser. */
  draggable: z.coerce.boolean().catch(true).default(true),
  /** Pixels between slides. */
  gap: z.coerce.number().int().min(0).max(96).catch(24).default(24),
  slidesDesktop: z.coerce.number().int().min(1).max(6).catch(3).default(3),
  slidesTablet: z.coerce.number().int().min(1).max(4).catch(2).default(2),
  slidesMobile: z.coerce.number().int().min(1).max(2).catch(1).default(1),
});

export type SliderSettings = z.infer<typeof sliderSettingsSchema>;

/** Spread into a slider block's own schema. */
export const sliderSettingsShape = sliderSettingsSchema.shape;

const NUMBER_RANGE = (min: number, max: number) => ({ min, max });

/**
 * The editor controls, as one group.
 *
 * `showWhen` keeps the autoplay timings out of the way until autoplay is on,
 * which is the only conditional the field renderer needs for these.
 */
export const SLIDER_FIELDS: FieldDescriptor[] = [
  {
    kind: 'number',
    name: 'slidesDesktop',
    label: 'Slides on desktop',
    help: '1 to 6.',
    width: 'third',
    ...NUMBER_RANGE(1, 6),
  },
  {
    kind: 'number',
    name: 'slidesTablet',
    label: 'Slides on tablet',
    help: '1 to 4.',
    width: 'third',
    ...NUMBER_RANGE(1, 4),
  },
  {
    kind: 'number',
    name: 'slidesMobile',
    label: 'Slides on mobile',
    help: '1 or 2.',
    width: 'third',
    ...NUMBER_RANGE(1, 2),
  },
  {
    kind: 'number',
    name: 'gap',
    label: 'Gap between slides',
    help: 'Pixels.',
    width: 'half',
    ...NUMBER_RANGE(0, 96),
  },
  {
    kind: 'number',
    name: 'speed',
    label: 'Transition speed',
    help: 'Milliseconds. 0 turns the animation off.',
    width: 'half',
    ...NUMBER_RANGE(0, 2000),
  },
  { kind: 'boolean', name: 'loop', label: 'Loop back to the start', width: 'half' },
  { kind: 'boolean', name: 'autoplay', label: 'Play automatically', width: 'half' },
  {
    kind: 'number',
    name: 'autoplayDelay',
    label: 'Time between slides',
    help: 'Milliseconds — 5000 is five seconds.',
    width: 'half',
    showWhen: { field: 'autoplay', equals: [true] },
    ...NUMBER_RANGE(1000, 30000),
  },
  {
    kind: 'boolean',
    name: 'pauseOnHover',
    label: 'Pause on hover',
    width: 'half',
    showWhen: { field: 'autoplay', equals: [true] },
  },
  { kind: 'boolean', name: 'arrows', label: 'Show arrows', width: 'half' },
  { kind: 'boolean', name: 'dots', label: 'Show dots', width: 'half' },
  {
    kind: 'boolean',
    name: 'draggable',
    label: 'Drag and swipe',
    help: 'Pointer drag on desktop, swipe on touch.',
    width: 'half',
  },
];

/** The settings, read back off a block's parsed content. */
export function readSliderSettings(content: Record<string, unknown>): SliderSettings {
  return sliderSettingsSchema.parse(content);
}
