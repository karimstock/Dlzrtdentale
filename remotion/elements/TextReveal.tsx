/**
 * Text Reveal Element for Remotion
 * Characters appear one by one
 */

import React from 'react';
import { interpolate } from 'remotion';

interface TextRevealProps {
  text: string;
  frame: number;
  fontSize?: number;
  color?: string;
}

export const TextReveal: React.FC<TextRevealProps> = ({
  text,
  frame,
  fontSize = 72,
  color = '#ffffff',
}) => {
  const charsPerFrame = 1.5; // Characters revealed per frame
  const visibleChars = Math.min(Math.floor(frame * charsPerFrame), text.length);
  const visibleText = text.slice(0, visibleChars);
  const cursorOpacity = frame % 15 < 8 ? 1 : 0;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        padding: '0 100px',
      }}
    >
      <span
        style={{
          fontFamily: 'Syne, sans-serif',
          fontSize,
          fontWeight: 800,
          color,
          textAlign: 'center',
          lineHeight: 1.15,
        }}
      >
        {visibleText}
        {visibleChars < text.length && (
          <span
            style={{
              display: 'inline-block',
              width: 3,
              height: fontSize * 0.8,
              backgroundColor: '#c9a961',
              marginLeft: 4,
              verticalAlign: 'text-bottom',
              opacity: cursorOpacity,
            }}
          />
        )}
      </span>
    </div>
  );
};
