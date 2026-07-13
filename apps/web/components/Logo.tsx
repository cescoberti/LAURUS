/**
 * LAURUS mark — a laurel sprig whose lower stroke resolves into a checkmark.
 * One sign, two readings: victory, and "done / off the list".
 * Single constant-weight stroke, rounded joins; works at 16px and on a wall.
 */
export function LaurusMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* checkmark spine, doubling as the central stem */}
      <path
        d="M7 17.5 L13 24 L25.5 8"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* laurel leaves along the rising stroke */}
      <path
        d="M16 20 q-3.6 -0.4 -4.8 -3.6 q3.6 -0.6 4.8 3.6 Z
           M19 16.5 q-3.7 -0.2 -5 -3.5 q3.7 -0.7 5 3.5 Z
           M22 13 q-3.7 0 -5.1 -3.3 q3.7 -0.8 5.1 3.3 Z"
        fill="currentColor"
        opacity="0.9"
      />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <LaurusMark className="text-laurel-700" />
      <span className="text-[19px] font-semibold tracking-[0.14em] text-laurel-900">
        LAURUS
      </span>
    </div>
  );
}
