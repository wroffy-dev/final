/**
 * The single layering scale for the whole application.
 *
 * Every fixed, sticky or absolutely-positioned overlay must pick a name from
 * this list rather than inventing a number. Scattered `z-[9999]` values are
 * what make one dropdown hide behind a card and the next one cover a modal;
 * naming the layers makes the intended order reviewable in one place.
 *
 * Order, lowest to highest:
 *
 *  base      Ordinary page content.
 *  sticky    Content that pins while scrolling — sticky table headers, sticky
 *            action bars inside a page.
 *  sidebar   The admin sidebar in its normal docked column.
 *  topbar    The admin top bar. Above the docked sidebar so its dropdowns are
 *            never clipped by it.
 *  dropdown  Menus, popovers, date pickers, combobox lists, and tooltips
 *            attached to ordinary content.
 *  backdrop  The dimming layer behind a drawer or dialog.
 *  drawer    Off-canvas panels: the mobile nav drawer, the mobile filter
 *            drawer. Sits above the backdrop it owns.
 *  modal     Dialogs, the command palette and public popups — the most
 *            important thing on screen, so above every panel.
 *  toast     Transient confirmations. Above modals so a save made inside a
 *            dialog is still visible.
 *  tooltip   Always last, so a hint is never hidden by what it explains.
 *
 * A layer only competes with its siblings in the same stacking context, so an
 * element nested inside a `modal` may use `dropdown` freely — it still paints
 * above the page. Choose the token for the role, not for the number.
 */
export const Z_INDEX = {
  base: 0,
  sticky: 10,
  sidebar: 20,
  topbar: 30,
  dropdown: 40,
  backdrop: 50,
  drawer: 60,
  modal: 70,
  toast: 80,
  tooltip: 90,
} as const;

export type ZLayer = keyof typeof Z_INDEX;
