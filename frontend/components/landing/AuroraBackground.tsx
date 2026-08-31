'use client';

export default function AuroraBackground({ className = '' }: { className?: string }) {
  return (
    <div className={`aurora-bg ${className}`} aria-hidden="true">
      {/* Large cyan blob - top right */}
      <div
        className="aurora-blob"
        style={{
          width: '500px',
          height: '500px',
          top: '-10%',
          right: '-5%',
          background: 'radial-gradient(circle, var(--aurora-1), transparent 70%)',
          animation: 'float-slow 25s ease-in-out infinite',
        }}
      />

      {/* Violet blob - center left */}
      <div
        className="aurora-blob"
        style={{
          width: '400px',
          height: '400px',
          top: '30%',
          left: '-8%',
          background: 'radial-gradient(circle, var(--aurora-2), transparent 70%)',
          animation: 'float-slower 30s ease-in-out infinite',
        }}
      />

      {/* Blue blob - bottom center */}
      <div
        className="aurora-blob"
        style={{
          width: '600px',
          height: '600px',
          bottom: '-15%',
          left: '30%',
          background: 'radial-gradient(circle, var(--aurora-3), transparent 70%)',
          animation: 'float-slowest 35s ease-in-out infinite',
        }}
      />

      {/* Small accent - top left */}
      <div
        className="aurora-blob"
        style={{
          width: '250px',
          height: '250px',
          top: '10%',
          left: '15%',
          background: 'radial-gradient(circle, rgba(14, 165, 183, 0.08), transparent 70%)',
          animation: 'float-slower 22s ease-in-out infinite reverse',
        }}
      />

      {/* Tiny violet accent - bottom right */}
      <div
        className="aurora-blob"
        style={{
          width: '300px',
          height: '300px',
          bottom: '5%',
          right: '10%',
          background: 'radial-gradient(circle, rgba(147, 51, 234, 0.06), transparent 70%)',
          animation: 'float-slow 28s ease-in-out infinite reverse',
        }}
      />
    </div>
  );
}
