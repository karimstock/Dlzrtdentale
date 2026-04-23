/**
 * Counter Animation Element for Remotion
 * Animated number counting up
 */

import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';

interface CounterAnimationProps {
  target: number;
  suffix?: string;
  prefix?: string;
  label: string;
  delay?: number;
}

export const CounterAnimation: React.FC<CounterAnimationProps> = ({
  target,
  suffix = '',
  prefix = '',
  label,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const adjustedFrame = Math.max(frame - delay, 0);

  const value = interpolate(adjustedFrame, [0, 60], [0, target], {
    extrapolateRight: 'clamp',
  });

  const opacity = interpolate(adjustedFrame, [0, 10], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        textAlign: 'center',
        opacity,
      }}
    >
      <div
        style={{
          fontFamily: 'Syne, sans-serif',
          fontSize: 64,
          fontWeight: 800,
          color: '#c9a961',
          lineHeight: 1.2,
        }}
      >
        {prefix}{Math.round(value).toLocaleString('fr-FR')}{suffix}
      </div>
      <div
        style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: 20,
          color: '#8a8a9a',
          marginTop: 8,
        }}
      >
        {label}
      </div>
    </div>
  );
};
