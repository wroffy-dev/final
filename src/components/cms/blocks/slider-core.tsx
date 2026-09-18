'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { SliderSettings } from '@/lib/cms/slider';
import { cn } from '@/lib/utils/cn';

/**
 * The one slider in this codebase.
 *
 * Every slider section renders its own slides and hands them here, so there is
 * a single implementation of scrolling, autoplay, dragging, the arrows, the
 * dots and the keyboard and screen-reader behaviour — and a single place to
 * fix any of it. No slider library is involved: the track is a scroll-snap
 * container, which gives touch swiping, momentum and native accessibility for
 * free, and the script below only adds what CSS cannot do.
 *
 * It is the only client component in the slider work. The slides themselves
 * are rendered on the server and passed in as children, so a slider of twelve
 * product cards ships twelve cards of HTML and none of their JavaScript.
 */
export function SliderCore({
  settings,
  label,
  children,
  className,
  slideClassName,
}: {
  settings: SliderSettings;
  /** Names the region for assistive technology, e.g. "Customer logos". */
  label: string;
  children: React.ReactNode[];
  className?: string;
  slideClassName?: string;
}) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [page, setPage] = React.useState(0);
  const [pages, setPages] = React.useState(1);
  const [atStart, setAtStart] = React.useState(true);
  const [atEnd, setAtEnd] = React.useState(false);
  const [paused, setPaused] = React.useState(false);
  const slides = React.Children.toArray(children);

  /** Honoured for autoplay and for the scroll animation alike. */
  const reducedMotion = useReducedMotion();
  const duration = reducedMotion ? 0 : settings.speed;

  const measure = React.useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const max = track.scrollWidth - track.clientWidth;
    const count = Math.max(1, Math.ceil(track.scrollWidth / Math.max(1, track.clientWidth)));
    setAtStart(track.scrollLeft <= 1);
    setAtEnd(track.scrollLeft >= max - 1);
    setPages(count);
    /*
     * The dot is read off the fraction scrolled, not off `scrollLeft /
     * clientWidth`. The last group is almost never a whole viewport wide — six
     * slides at four per view leaves a remainder — so the scroll maximum is
     * less than `(count - 1) * clientWidth`, and dividing by the viewport put
     * the highlight back on the first dot at the far end of the track.
     */
    setPage(max <= 1 ? 0 : Math.round((track.scrollLeft / max) * (count - 1)));
  }, []);

  React.useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    measure();
    track.addEventListener('scroll', measure, { passive: true });
    // The visible count changes at breakpoints, so the page count does too.
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => {
      track.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [measure, slides.length]);

  /** Scrolls by `delta` pages, animating over the configured speed. */
  const scrollByPages = React.useCallback(
    (delta: number) => {
      const track = trackRef.current;
      if (!track) return;
      const max = track.scrollWidth - track.clientWidth;

      /*
       * Wrapping rather than cloning slides: the same set of nodes stays in
       * the document, so nothing is duplicated for a screen reader and no
       * slide is rendered twice.
       *
       * It turns on when the track is *already* at the end it is being moved
       * past — not when a step happens to overshoot. Overshooting is the norm:
       * five slides at four per view can only scroll by a quarter of a
       * viewport, so treating an overshoot as a wrap sent every "next" from
       * the start straight back to the start, and the slider never moved.
       */
      if (settings.loop && delta > 0 && track.scrollLeft >= max - 1) {
        animateScroll(track, 0, duration);
        return;
      }
      if (settings.loop && delta < 0 && track.scrollLeft <= 1) {
        animateScroll(track, max, duration);
        return;
      }

      const target = track.scrollLeft + delta * track.clientWidth;
      animateScroll(track, clamp(target, 0, max), duration);
    },
    [duration, settings.loop],
  );

  // Autoplay. Stops while hovered or focused, while a pointer is down, and
  // whenever the tab is in the background.
  React.useEffect(() => {
    if (!settings.autoplay || reducedMotion || paused || slides.length <= 1) return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      scrollByPages(1);
    }, settings.autoplayDelay);
    return () => window.clearInterval(id);
  }, [
    settings.autoplay,
    settings.autoplayDelay,
    reducedMotion,
    paused,
    slides.length,
    scrollByPages,
  ]);

  const drag = useDrag(trackRef, settings.draggable, setPaused);

  if (slides.length === 0) return null;

  /*
   * Arrows and dots appear only when there is somewhere to go. Three slides at
   * three per view fills the track exactly, and a pair of arrows that cannot
   * move anything is worse than no arrows — a visitor clicks them and nothing
   * happens. `atStart && atEnd` is true only when the track does not scroll,
   * and it re-measures at every breakpoint, so the same section shows arrows on
   * a phone (one slide per view) and hides them on a desktop.
   */
  const scrollable = !(atStart && atEnd);
  const showArrows = settings.arrows && slides.length > 1 && scrollable;
  const showDots = settings.dots && pages > 1 && scrollable;

  return (
    <div
      className={cn('relative', className)}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => settings.pauseOnHover && setPaused(true)}
      onMouseLeave={() => settings.pauseOnHover && setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      <div
        ref={trackRef}
        className={cn('cms-slider-track', drag.dragging && 'is-dragging')}
        style={
          {
            '--cms-slider-gap': `${settings.gap}px`,
            '--cms-slider-mobile': settings.slidesMobile,
            '--cms-slider-tablet': settings.slidesTablet,
            '--cms-slider-desktop': settings.slidesDesktop,
          } as React.CSSProperties
        }
        // The track is focusable and arrow keys move it, which is what makes a
        // carousel usable without a mouse. Browsers give a scroll container
        // keyboard scrolling already; this only adds page-sized steps.
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            scrollByPages(1);
          } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            scrollByPages(-1);
          }
        }}
        {...drag.handlers}
      >
        {slides.map((slide, index) => (
          <div
            // Index is the only identity a slide has — the list is static for
            // the life of the section, so nothing reorders underneath it.
            key={index}
            className={slideClassName}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${slides.length}`}
          >
            {slide}
          </div>
        ))}
      </div>

      {showArrows ? (
        <div className="mt-4 flex items-center justify-end gap-2">
          <ArrowButton
            direction="previous"
            disabled={!settings.loop && atStart}
            onClick={() => scrollByPages(-1)}
          />
          <ArrowButton
            direction="next"
            disabled={!settings.loop && atEnd}
            onClick={() => scrollByPages(1)}
          />
        </div>
      ) : null}

      {showDots ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
          {Array.from({ length: pages }).map((_, index) => (
            <button
              key={index}
              type="button"
              aria-label={`Go to slide group ${index + 1}`}
              aria-current={index === page || undefined}
              onClick={() => {
                const track = trackRef.current;
                if (!track) return;
                // The same fraction `measure` reads back, so the dot that was
                // clicked is the dot that ends up current.
                const max = track.scrollWidth - track.clientWidth;
                animateScroll(track, pages <= 1 ? 0 : (index / (pages - 1)) * max, duration);
              }}
              className={cn(
                'admin-focus h-2 rounded-full transition-all',
                index === page ? 'w-5 bg-brand' : 'w-2 bg-current opacity-25 hover:opacity-50',
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ArrowButton({
  direction,
  disabled,
  onClick,
}: {
  direction: 'previous' | 'next';
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = direction === 'previous' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`${direction === 'previous' ? 'Previous' : 'Next'} slides`}
      className={cn(
        'admin-focus flex h-9 w-9 items-center justify-center rounded-full border border-current/20',
        'transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30',
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Scrolls to a position over `duration`.
 *
 * `scroll-behavior: smooth` cannot be given a duration, and the editor can set
 * one — so the animation is run here. A duration of zero jumps, which is both
 * the "no animation" setting and what a reduced-motion preference gets.
 */
function animateScroll(track: HTMLElement, to: number, duration: number): void {
  const from = track.scrollLeft;
  const distance = to - from;
  if (duration <= 0 || Math.abs(distance) < 1) {
    track.scrollLeft = to;
    return;
  }

  /*
   * `scroll-snap-type: x mandatory` is what makes a touch swipe land cleanly
   * on a slide, but it also re-snaps the track after every write to
   * `scrollLeft` — so an animation that moves it a few pixels per frame was
   * yanked to the nearest slide on the first frame and the configured speed
   * meant nothing. Snapping is suspended for the length of the animation and
   * restored at the end, which both lets the easing run and leaves the browser
   * to settle the track exactly on a slide edge.
   */
  track.style.scrollSnapType = 'none';
  const start = performance.now();
  const step = (now: number) => {
    const progress = Math.min(1, (now - start) / duration);
    // Ease-out cubic: quick to leave, gentle to arrive.
    track.scrollLeft = from + distance * (1 - Math.pow(1 - progress, 3));
    if (progress < 1) requestAnimationFrame(step);
    else track.style.scrollSnapType = '';
  };
  requestAnimationFrame(step);
}

/** Pointer dragging. Touch is left to the browser, which already does it well. */
function useDrag(
  trackRef: React.RefObject<HTMLDivElement | null>,
  enabled: boolean,
  setPaused: (paused: boolean) => void,
) {
  const [dragging, setDragging] = React.useState(false);
  const origin = React.useRef({ x: 0, scroll: 0 });

  if (!enabled) return { dragging: false, handlers: {} };

  return {
    dragging,
    handlers: {
      onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
        // Touch already scrolls natively; hijacking it would fight momentum.
        if (event.pointerType === 'touch') return;
        const track = trackRef.current;
        if (!track) return;
        origin.current = { x: event.clientX, scroll: track.scrollLeft };
        setDragging(true);
        setPaused(true);
        track.setPointerCapture(event.pointerId);
      },
      onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
        if (!dragging) return;
        const track = trackRef.current;
        if (!track) return;
        track.scrollLeft = origin.current.scroll - (event.clientX - origin.current.x);
      },
      onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => {
        if (!dragging) return;
        setDragging(false);
        setPaused(false);
        trackRef.current?.releasePointerCapture(event.pointerId);
      },
      onPointerCancel: () => {
        setDragging(false);
        setPaused(false);
      },
    },
  };
}

/** The visitor's reduced-motion preference, kept current. */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return reduced;
}
