/* The horizontal lockup from assets/logo/lockup-horizontal-paper.svg, inlined
   (transparent field for the nav; type set in Marcellus, which the page loads).
   Geometry is the kit file's — the lyre mark is never redrawn. */
export function LockupHorizontal({ height = 34 }: { height?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 880 160"
      height={height}
      role="img"
      aria-label="LYRE SOCIAL"
    >
      <defs>
        <linearGradient id="ls-lava-seam" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#00E8FF" />
          <stop offset=".5" stopColor="#8B5CFF" />
          <stop offset="1" stopColor="#FF2EC4" />
        </linearGradient>
      </defs>
      <g transform="translate(-4,-4) scale(0.3)" stroke="#F2F2F4" fill="#F2F2F4">
        <path
          d="M256,428 C140,418 100,330 126,244 C142,190 180,162 184,124 C188,86 132,78 136,114 C138,132 154,138 158,124"
          fill="none"
          strokeLinecap="round"
          strokeWidth="34"
        />
        <path
          d="M256,428 C372,418 412,330 386,244 C370,190 332,162 328,124 C324,86 380,78 376,114 C374,132 358,138 354,124"
          fill="none"
          strokeLinecap="round"
          strokeWidth="34"
        />
        <rect x="166" y="178" width="180" height="22" rx="4" stroke="none" />
        <path d="M212,200 V386 M241,200 V396 M270,200 V396 M299,200 V386" strokeWidth="15" fill="none" />
        <rect x="198" y="446" width="116" height="20" rx="10" stroke="none" />
      </g>
      <text
        x="176"
        y="98"
        fontSize="52"
        letterSpacing="16"
        fill="#F2F2F4"
        fontFamily="Marcellus, 'Times New Roman', serif"
      >
        LYRE SOCIAL
      </text>
      <rect x="180" y="118" width="586" height="6" fill="url(#ls-lava-seam)" />
    </svg>
  );
}
