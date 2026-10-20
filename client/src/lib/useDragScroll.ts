import { useEffect, useRef } from 'react';

/** A drag that starts on one of these is left alone, so links, buttons, checkboxes and inputs keep working. */
const INTERACTIVE =
  'a, button, input, select, textarea, label, summary, [role="button"], [role="checkbox"], [role="link"], [role="menuitem"], [role="switch"], [contenteditable]:not([contenteditable="false"]), [data-no-drag-scroll]';

/** How far (px) the mouse must move sideways before a press becomes a drag; less stays a click or a text selection. */
const DRAG_THRESHOLD = 5;

/**
 * Lets a mouse user hold the left button and drag sideways to scroll the element horizontally.
 * Only mouse pointers: touch and pen keep the browser's own scrolling. While the element can scroll it
 * gets `data-drag-scroll`, and `data-dragging` during a drag, for the cursor styles.
 * A mostly vertical drag is left to the browser, so text can still be selected that way (or by double-click).
 */
export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const canScroll = () => el.scrollWidth > el.clientWidth;
    const updateScrollable = () => el.toggleAttribute('data-drag-scroll', canScroll());
    // The content (the table) changes width when data loads or columns are hidden, not only the box itself
    const resize = new ResizeObserver(updateScrollable);
    resize.observe(el);
    for (const child of el.children) resize.observe(child);
    updateScrollable();

    let press: { id: number; x: number; y: number; scrollLeft: number } | null = null;
    let dragging = false;
    let swallowClick = false;

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || !canScroll()) return;
      if (e.target instanceof Element && e.target.closest(INTERACTIVE)) return;
      press = { id: e.pointerId, x: e.clientX, y: e.clientY, scrollLeft: el.scrollLeft };
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.id) return;
      if (!(e.buttons & 1)) {
        // The button was released outside the element before the drag began
        press = null;
        return;
      }
      const dx = e.clientX - press.x;
      if (!dragging) {
        const dy = e.clientY - press.y;
        if (Math.abs(dx) < DRAG_THRESHOLD || Math.abs(dx) < Math.abs(dy)) {
          if (Math.abs(dy) >= DRAG_THRESHOLD) press = null;
          return;
        }
        dragging = true;
        el.setPointerCapture(e.pointerId);
        el.setAttribute('data-dragging', '');
        window.getSelection()?.removeAllRanges();
      }
      e.preventDefault();
      el.scrollLeft = press.scrollLeft - dx;
    };

    const onPointerEnd = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.id) return;
      press = null;
      if (!dragging) return;
      dragging = false;
      el.removeAttribute('data-dragging');
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      // The click that follows the release is the end of the drag, not a click on the row under the mouse
      swallowClick = true;
      setTimeout(() => (swallowClick = false));
    };

    const onClick = (e: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.preventDefault();
      e.stopPropagation();
    };

    const onSelectStart = (e: Event) => {
      if (dragging) e.preventDefault();
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerEnd);
    el.addEventListener('pointercancel', onPointerEnd);
    el.addEventListener('lostpointercapture', onPointerEnd);
    el.addEventListener('click', onClick, true);
    el.addEventListener('selectstart', onSelectStart);
    return () => {
      resize.disconnect();
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerEnd);
      el.removeEventListener('pointercancel', onPointerEnd);
      el.removeEventListener('lostpointercapture', onPointerEnd);
      el.removeEventListener('click', onClick, true);
      el.removeEventListener('selectstart', onSelectStart);
    };
  }, []);

  return ref;
}
