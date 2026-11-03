import { describe, expect, it } from "vitest";

import { centeredScrollLeft, fadeMask, scrollEdges } from "./tab-scroll";

describe("scrollEdges", () => {
  it("shows nothing when every tab fits (desktop)", () => {
    expect(scrollEdges({ scrollLeft: 0, clientWidth: 900, scrollWidth: 900 })).toEqual({
      start: false,
      end: false,
    });
  });

  it("flags hidden tabs on the right at the start of the list", () => {
    expect(scrollEdges({ scrollLeft: 0, clientWidth: 360, scrollWidth: 620 })).toEqual({
      start: false,
      end: true,
    });
  });

  it("flags hidden tabs on both sides in the middle, and only the left at the end", () => {
    expect(scrollEdges({ scrollLeft: 120, clientWidth: 360, scrollWidth: 620 })).toEqual({
      start: true,
      end: true,
    });
    expect(scrollEdges({ scrollLeft: 260, clientWidth: 360, scrollWidth: 620 })).toEqual({
      start: true,
      end: false,
    });
  });

  it("tolerates sub-pixel rounding on high-density screens", () => {
    expect(scrollEdges({ scrollLeft: 259.6, clientWidth: 360, scrollWidth: 620 }).end).toBe(false);
    expect(scrollEdges({ scrollLeft: 0.4, clientWidth: 360, scrollWidth: 620 }).start).toBe(false);
  });
});

describe("fadeMask", () => {
  it("applies no mask when nothing is hidden", () => {
    expect(fadeMask({ start: false, end: false })).toBeUndefined();
  });

  it("fades only the edge where the list continues", () => {
    expect(fadeMask({ start: false, end: true })).toBe(
      "linear-gradient(to right, black 0, black calc(100% - 28px), transparent 100%)"
    );
    expect(fadeMask({ start: true, end: false })).toBe(
      "linear-gradient(to right, transparent 0, black 28px, black 100%)"
    );
    expect(fadeMask({ start: true, end: true })).toBe(
      "linear-gradient(to right, transparent 0, black 28px, black calc(100% - 28px), transparent 100%)"
    );
  });
});

describe("centeredScrollLeft", () => {
  const list = { clientWidth: 360, scrollWidth: 620 };

  it("centres the active tab", () => {
    expect(centeredScrollLeft({ ...list, activeLeft: 300, activeWidth: 120 })).toBe(180);
  });

  it("never scrolls before the first tab", () => {
    expect(centeredScrollLeft({ ...list, activeLeft: 0, activeWidth: 80 })).toBe(0);
  });

  it("never scrolls past the last tab: « Mes rendez-vous » opened from a link stays fully visible", () => {
    expect(centeredScrollLeft({ ...list, activeLeft: 480, activeWidth: 140 })).toBe(260);
  });

  it("does nothing when everything fits", () => {
    expect(
      centeredScrollLeft({ clientWidth: 900, scrollWidth: 900, activeLeft: 500, activeWidth: 100 })
    ).toBe(0);
  });
});
