/**
 * Backwards-compatible surface for the original section settings module.
 *
 * The design system now lives in `./design`, which understands both the current
 * shape and the original `{ background, paddingTop, paddingBottom, width }` one.
 * These re-exports keep older imports working.
 */
export {
  sectionDesignSchema as sectionSettingsSchema,
  parseSectionDesign as parseSectionSettings,
  DEFAULT_SECTION_DESIGN as DEFAULT_SECTION_SETTINGS,
  isInverted as isDarkSection,
  buildSectionStyles,
  resolveColumns,
  gridStyle,
  normaliseAnchor,
  type SectionDesign,
  type SectionDesign as SectionSettings,
} from './design';
