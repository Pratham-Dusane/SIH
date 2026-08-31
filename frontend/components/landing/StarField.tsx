'use client';

import { useEffect, useRef } from 'react';

interface StarFieldProps {
  starCount?: number;
  className?: string;
}

export default function StarField({ starCount = 120, className = '' }: StarFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear existing stars
    container.innerHTML = '';

    for (let i = 0; i < starCount; i++) {
      const star = document.createElement('div');
      const size = Math.random() * 2.5 + 0.5;
      const x = Math.random() * 100;
      const y = Math.random() * 100;
      const duration = Math.random() * 4 + 2;
      const delay = Math.random() * 4;
      const opacity = Math.random() * 0.6 + 0.2;

      star.style.cssText = `
        position: absolute;
        left: ${x}%;
        top: ${y}%;
        width: ${size}px;
        height: ${size}px;
        background: radial-gradient(circle, rgba(147, 197, 253, ${opacity}), rgba(14, 165, 183, ${opacity * 0.5}));
        border-radius: 50%;
        animation: twinkle ${duration}s ease-in-out ${delay}s infinite;
        box-shadow: 0 0 ${size * 3}px rgba(147, 197, 253, ${opacity * 0.3});
      `;

      container.appendChild(star);
    }

    // Add a few larger "bright" stars
    for (let i = 0; i < 8; i++) {
      const star = document.createElement('div');
      const size = Math.random() * 3 + 2;
      const x = Math.random() * 100;
      const y = Math.random() * 100;
      const duration = Math.random() * 6 + 3;
      const delay = Math.random() * 3;

      star.style.cssText = `
        position: absolute;
        left: ${x}%;
        top: ${y}%;
        width: ${size}px;
        height: ${size}px;
        background: radial-gradient(circle, rgba(255, 255, 255, 0.9), rgba(14, 165, 183, 0.4));
        border-radius: 50%;
        animation: twinkle ${duration}s ease-in-out ${delay}s infinite;
        box-shadow: 0 0 ${size * 6}px rgba(255, 255, 255, 0.3), 0 0 ${size * 12}px rgba(14, 165, 183, 0.15);
      `;

      container.appendChild(star);
    }

    // Add 3 slow-moving nebula-like circles (the "moving circles like stars" requirement)
    const nebulaColors = [
      'rgba(14, 165, 183, 0.06)',
      'rgba(147, 51, 234, 0.04)',
      'rgba(56, 189, 248, 0.05)',
    ];
    const animations = ['float-slow', 'float-slower', 'float-slowest'];

    nebulaColors.forEach((color, i) => {
      const nebula = document.createElement('div');
      const size = 200 + Math.random() * 300;
      nebula.style.cssText = `
        position: absolute;
        left: ${20 + i * 25}%;
        top: ${15 + i * 20}%;
        width: ${size}px;
        height: ${size}px;
        background: radial-gradient(circle, ${color}, transparent 70%);
        border-radius: 50%;
        animation: ${animations[i]} ${20 + i * 8}s ease-in-out infinite;
        filter: blur(40px);
      `;
      container.appendChild(nebula);
    });
  }, [starCount]);

  return (
    <div
      ref={containerRef}
      className={`starfield-bg ${className}`}
      aria-hidden="true"
    />
  );
}
