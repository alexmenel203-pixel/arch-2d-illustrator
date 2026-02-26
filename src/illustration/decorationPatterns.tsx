/**
 * SVG pattern definitions for archaeological surface decoration:
 * hatching, stippling, zigzag, circular impressions, etc.
 */

import type { DecorationType } from '../types/find';

const PATTERN_SIZE = 12;
const STROKE = 0.4;

export function DecorationPatterns() {
  return (
    <defs>
      {/* Smooth / undecorated (plain fill so band is visible) */}
      <pattern
        id="pattern-smooth"
        patternUnits="userSpaceOnUse"
        width={PATTERN_SIZE}
        height={PATTERN_SIZE}
      >
        <rect width={PATTERN_SIZE} height={PATTERN_SIZE} fill="#fff" />
      </pattern>

      {/* Zigzag / chevron */}
      <pattern
        id="pattern-zigzag"
        patternUnits="userSpaceOnUse"
        width={PATTERN_SIZE}
        height={PATTERN_SIZE}
      >
        {[0, 1, 2].map((i) => (
          <path
            key={i}
            d={`M ${i * 4} 0 L ${i * 4 + 2} ${PATTERN_SIZE} L ${i * 4 + 4} 0`}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE}
          />
        ))}
      </pattern>

      {/* Vertical hatching */}
      <pattern
        id="pattern-verticalHatch"
        patternUnits="userSpaceOnUse"
        width={PATTERN_SIZE}
        height={PATTERN_SIZE}
      >
        {[0, 1, 2].map((i) => (
          <line
            key={i}
            x1={i * 4}
            y1={0}
            x2={i * 4}
            y2={PATTERN_SIZE}
            stroke="currentColor"
            strokeWidth={STROKE}
          />
        ))}
      </pattern>

      {/* Horizontal hatching */}
      <pattern
        id="pattern-horizontalHatch"
        patternUnits="userSpaceOnUse"
        width={PATTERN_SIZE}
        height={PATTERN_SIZE}
      >
        {[0, 1, 2].map((i) => (
          <line
            key={i}
            x1={0}
            y1={i * 4}
            x2={PATTERN_SIZE}
            y2={i * 4}
            stroke="currentColor"
            strokeWidth={STROKE}
          />
        ))}
      </pattern>

      {/* Diagonal hatching */}
      <pattern
        id="pattern-diagonalHatch"
        patternUnits="userSpaceOnUse"
        width={PATTERN_SIZE}
        height={PATTERN_SIZE}
      >
        {[-1, 0, 1].map((i) => (
          <line
            key={i}
            x1={i * PATTERN_SIZE}
            y1={0}
            x2={(i + 1) * PATTERN_SIZE}
            y2={PATTERN_SIZE}
            stroke="currentColor"
            strokeWidth={STROKE}
          />
        ))}
      </pattern>

      {/* Cross-hatching */}
      <pattern
        id="pattern-crossHatch"
        patternUnits="userSpaceOnUse"
        width={PATTERN_SIZE}
        height={PATTERN_SIZE}
      >
        {[0, 1, 2].map((i) => (
          <line
            key={`v-${i}`}
            x1={i * 4}
            y1={0}
            x2={i * 4}
            y2={PATTERN_SIZE}
            stroke="currentColor"
            strokeWidth={STROKE}
          />
        ))}
        {[0, 1, 2].map((i) => (
          <line
            key={`h-${i}`}
            x1={0}
            y1={i * 4}
            x2={PATTERN_SIZE}
            y2={i * 4}
            stroke="currentColor"
            strokeWidth={STROKE}
          />
        ))}
      </pattern>

      {/* Stippling (dots) */}
      <pattern
        id="pattern-stippling"
        patternUnits="userSpaceOnUse"
        width={PATTERN_SIZE}
        height={PATTERN_SIZE}
      >
        {[0, 1, 2].map((row) =>
          [0, 1, 2].map((col) => (
            <circle
              key={`${row}-${col}`}
              cx={col * 4 + 2}
              cy={row * 4 + 2}
              r={0.5}
              fill="currentColor"
            />
          ))
        )}
      </pattern>

      {/* Circular impressions */}
      <pattern
        id="pattern-circularImpressions"
        patternUnits="userSpaceOnUse"
        width={PATTERN_SIZE}
        height={PATTERN_SIZE}
      >
        {[0, 1].map((row) =>
          [0, 1, 2].map((col) => (
            <circle
              key={`${row}-${col}`}
              cx={col * 4 + 2}
              cy={row * 4 + 2}
              r={1.2}
              fill="none"
              stroke="currentColor"
              strokeWidth={STROKE}
            />
          ))
        )}
      </pattern>
    </defs>
  );
}

export function patternIdForType(type: DecorationType): string | null {
  return `pattern-${type}`;
}
