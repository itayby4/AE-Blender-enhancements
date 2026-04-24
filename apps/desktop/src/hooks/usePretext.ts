import { useRef, useCallback } from 'react';
import { prepare, layout } from '@chenglou/pretext';

/**
 * Font strings for Pretext canvas measurement.
 * Must match the CSS font declarations exactly.
 */
const FONT_HUMAN = '15px Inter Variable';
const FONT_MACHINE = '13px JetBrains Mono Variable';

/**
 * usePretext — Provides fast, reflow-free text measurement via
 * Pretext's off-canvas measurement engine.
 *
 * Usage:
 *   const { measureHeight, measureChatMessageHeight } = usePretext();
 *   const h = measureHeight(text, containerWidth);
 */
export function usePretext() {
  // Cache prepared texts to avoid re-preparing on every render.
  // Key: text + font, Value: PreparedText
  const cacheRef = useRef(new Map<string, ReturnType<typeof prepare>>());

  const getPrepared = useCallback((text: string, font: string) => {
    const key = `${font}::${text}`;
    let cached = cacheRef.current.get(key);
    if (!cached) {
      cached = prepare(text, font, { whiteSpace: 'pre-wrap' });
      cacheRef.current.set(key, cached);
      // Evict old entries if cache grows too large
      if (cacheRef.current.size > 500) {
        const firstKey = cacheRef.current.keys().next().value;
        if (firstKey) cacheRef.current.delete(firstKey);
      }
    }
    return cached;
  }, []);

  /**
   * Measure the pixel height a text block will occupy at a given width.
   * Pure arithmetic — no DOM layout reflow.
   */
  const measureHeight = useCallback(
    (text: string, maxWidth: number, lineHeight = 24, font = FONT_HUMAN) => {
      if (!text) return lineHeight; // empty → 1 line
      const prepared = getPrepared(text, font);
      const result = layout(prepared, maxWidth, lineHeight);
      return Math.max(1, result.lineCount) * lineHeight;
    },
    [getPrepared]
  );

  /**
   * Estimate the total rendered height of a chat message,
   * accounting for padding, avatar, and content type.
   */
  const measureChatMessageHeight = useCallback(
    (text: string, containerWidth: number, isUser: boolean) => {
      // Account for avatar + gap + padding
      const bubbleMaxWidth = Math.min(containerWidth * 0.85, containerWidth - 56);
      const horizontalPadding = 32; // px-4 × 2
      const verticalPadding = 24; // py-3 × 2
      const textWidth = bubbleMaxWidth - horizontalPadding;

      const font = isUser ? FONT_HUMAN : FONT_HUMAN;
      const lineHeight = 24;

      const textHeight = measureHeight(text, textWidth, lineHeight, font);
      return textHeight + verticalPadding + 20; // 20 = gap between messages
    },
    [measureHeight]
  );

  /**
   * Measure a code/monospace block height.
   */
  const measureCodeHeight = useCallback(
    (text: string, maxWidth: number, lineHeight = 20) => {
      return measureHeight(text, maxWidth, lineHeight, FONT_MACHINE);
    },
    [measureHeight]
  );

  /**
   * Clear the preparation cache.
   * Useful when switching projects or clearing chat history.
   */
  const clearCache = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  return {
    measureHeight,
    measureChatMessageHeight,
    measureCodeHeight,
    clearCache,
  };
}

/**
 * Standalone utility (non-hook) for one-shot measurements.
 * Useful in layout calculations outside of React components.
 */
export function measureTextHeight(
  text: string,
  maxWidth: number,
  lineHeight = 24,
  font = FONT_HUMAN
): number {
  if (!text) return lineHeight;
  const prepared = prepare(text, font, { whiteSpace: 'pre-wrap' });
  const result = layout(prepared, maxWidth, lineHeight);
  return Math.max(1, result.lineCount) * lineHeight;
}
