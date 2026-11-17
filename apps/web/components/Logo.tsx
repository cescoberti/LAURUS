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

/**
 * The wordmark. Wide tracking and a hairline gold rule under the mark: the
 * two details that separate a logotype from a word set in a UI font.
 */
export function Wordmark({
  className = "",
  size = 26,
  /** In the bar on a phone the mark stands alone: the name costs 90px that
   *  the navigation needs more than the logo does. */
  compact = false,
}: {
  className?: string;
  size?: number;
  compact?: boolean;
}) {
  return (
    <div className={`group flex items-center gap-2.5 ${className}`}>
      <LaurusMark
        size={size}
        className="text-laurel-700 transition-transform duration-500 ease-lux group-hover:-rotate-6"
      />
      <span
        className={`text-[1.0625rem] font-bold uppercase leading-none tracking-[0.2em] text-eu-900 ${
          compact ? "hidden sm:inline" : ""
        }`}
      >
        Laurus
      </span>
    </div>
  );
}
