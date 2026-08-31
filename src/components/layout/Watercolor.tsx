/**
 * Atmospheric watercolor layer inspired by an illustrated oriental study book.
 * Pure SVG/CSS: botanical washes, blossom branch, lantern and distant architecture.
 */
export function WatercolorBackdrop() {
  const leaves = [
    [34, 38, -34, 24, 9], [56, 60, 30, 28, 10], [75, 88, -38, 29, 10],
    [96, 116, 28, 31, 11], [114, 149, -34, 29, 10], [136, 177, 28, 27, 9],
  ];

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="watercolor-blot" style={{ top: '-7rem', left: '-9rem', width: '34rem', height: '28rem', background: '#9fb9a2' }} />
      <div className="watercolor-blot" style={{ top: '-3rem', right: '-8rem', width: '31rem', height: '25rem', background: '#efd0c9', opacity: 0.3 }} />
      <div className="watercolor-blot" style={{ bottom: '-9rem', left: '14%', width: '38rem', height: '22rem', background: '#b7cbb6', opacity: 0.3 }} />
      <div className="watercolor-blot" style={{ bottom: '-10rem', right: '-7rem', width: '32rem', height: '25rem', background: '#d9c9a9', opacity: 0.26 }} />

      {/* Sage botanical branch */}
      <svg className="watercolor-edge watercolor-drift absolute -left-8 top-10 hidden h-[430px] w-[280px] text-[#6f8d79] lg:block" viewBox="0 0 220 330" fill="none">
        <path d="M8 318 C44 252 60 196 87 142 C111 94 145 51 205 9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity=".45" />
        {leaves.map(([x,y,r,rx,ry], i) => (
          <g key={i} transform={`rotate(${r} ${x} ${y})`}>
            <ellipse cx={x} cy={y} rx={rx} ry={ry} fill="currentColor" opacity={0.15 + i * .035} />
            <ellipse cx={x+2} cy={y-1} rx={rx*.76} ry={ry*.78} fill="currentColor" opacity=".13" />
          </g>
        ))}
        <circle cx="142" cy="62" r="22" fill="#c9d8c6" opacity=".16" />
        <circle cx="93" cy="152" r="31" fill="#b9ceb9" opacity=".12" />
      </svg>

      {/* Dusty rose blossom branch */}
      <svg className="watercolor-edge absolute -right-5 top-0 hidden h-[230px] w-[380px] text-[#cc9691] md:block" viewBox="0 0 380 230" fill="none">
        <path d="M390 16 C310 37 264 67 207 89 C155 110 105 115 24 144" stroke="#846c55" strokeWidth="2" opacity=".34" />
        {[[318,44],[280,62],[244,79],[207,91],[168,107],[130,117],[92,131]].map(([x,y],i)=>(
          <g key={i} transform={`translate(${x} ${y})`} opacity={0.42 + (i%3)*.08}>
            {[0,72,144,216,288].map((r)=><ellipse key={r} rx="12" ry="5.5" fill="currentColor" transform={`rotate(${r}) translate(8 0)`} />)}
            <circle r="3" fill="#b78a55" opacity=".7" />
          </g>
        ))}
      </svg>

      {/* Distant mosque / old-city silhouette */}
      <svg className="watercolor-edge absolute bottom-0 right-0 hidden w-[520px] text-[#7d9a86] opacity-[.20] xl:block" viewBox="0 0 520 210" fill="currentColor">
        <path d="M0 210V164h44v-31h31v77H0Zm76 0v-91h15V83h7v36h15v91H76Z" opacity=".55" />
        <path d="M126 210v-68h24c2-27 19-47 42-55 23 8 40 28 42 55h24v68H126Z" opacity=".65" />
        <path d="M190 84c-10-13-8-26 2-38 10 12 12 25 2 38h-4Z" opacity=".55" />
        <path d="M279 210v-104h16V64h7v42h16v104h-39Zm57 0v-55h30c3-23 17-39 36-46 19 7 33 23 36 46h28v55H336Z" opacity=".48" />
        <path d="M468 210v-82h14V89h6v39h14v82h-34Z" opacity=".42" />
        <path d="M0 196 C95 176 154 199 226 188 C316 174 386 181 520 164 V210 H0Z" opacity=".25" />
      </svg>

      {/* Hanging lantern */}
      <svg className="watercolor-edge watercolor-drift absolute bottom-16 left-8 hidden w-20 text-[#a98143] opacity-40 xl:block" viewBox="0 0 80 170" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M40 0v31M26 39h28l7 18-5 70c-1 14-8 24-16 24s-15-10-16-24l-5-70 7-18Z" />
        <path d="M23 61h34M27 120h26M30 39c1-12 6-19 10-19s9 7 10 19" />
        <path d="M31 74c7-8 11-8 18 0v31c-7 8-11 8-18 0V74Z" fill="#d5b06b" opacity=".28" stroke="none" />
        <path d="M40 151v13m-7 0h14" />
      </svg>

      {/* soft wash at the lower page edge */}
      <svg className="absolute bottom-0 left-0 h-28 w-full opacity-30" viewBox="0 0 1200 120" preserveAspectRatio="none">
        <path d="M0 92 C140 65 235 106 360 80 C505 50 594 107 720 80 C856 50 1010 78 1200 45 V120 H0Z" fill="#88a38d" opacity=".24" />
        <path d="M0 105 C180 81 282 114 430 96 C610 75 746 112 910 91 C1030 76 1115 81 1200 70 V120 H0Z" fill="#c6b48f" opacity=".16" />
      </svg>
    </div>
  );
}
