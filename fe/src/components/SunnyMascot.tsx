import React, { useEffect, useState } from 'react';

// ─── Public interface (unchanged — AiTalkTab and PathMap keep working) ──────
export type MascotState = 'idle' | 'calling' | 'listening' | 'speaking' | 'processing';

export interface SunnyMascotProps {
  outfitId?: string;
  state?: MascotState;
  /** Overrides the default responsive size classes. */
  sizeClassName?: string;
}

// ─── Internal expression type ────────────────────────────────────────────────
export type ExpressionState =
  | 'happy'
  | 'cheering'
  | 'listening'
  | 'talking'
  | 'excited'
  | 'thinking'
  | 'correct'
  | 'surprised'
  | 'sleepy'
  | 'sad';

/** Maps the existing MascotState to the richer ExpressionState. */
export function mapStateToExpression(state: MascotState): ExpressionState {
  switch (state) {
    case 'listening': return 'listening';
    case 'speaking': return 'talking';
    case 'processing': return 'thinking';
    case 'calling': return 'excited';
    case 'idle':
    default: return 'happy';
  }
}

const DEFAULT_SIZE_CLASS =
  'w-[44vw] h-[44vw] max-w-full md:w-[42vw] md:h-[42vw] lg:w-[min(42vw,48vh)] lg:h-[min(42vw,48vh)]';

// Combined props to transparently satisfy both MascotSun (expression) and SunnyMascot (state/outfitId)
export interface MascotProps {
  expression?: ExpressionState;
  onClick?: () => void;
  outfitId?: string;
  state?: MascotState;
  sizeClassName?: string;
}

// ─── MascotSun (ported and optimized with seamless rotate & undulate) ────────
export function MascotSun({ expression, onClick }: MascotProps) {
  const [isBlinking, setIsBlinking] = useState(false);
  const [mouthSpeakCycle, setMouthSpeakCycle] = useState(false);
  const [clickEffect, setClickEffect] = useState<{ id: number; text: string; x: number; y: number } | null>(null);

  // Auto-blink every 2–6 s
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const blink = () => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 150);
      t = setTimeout(blink, Math.random() * 4000 + 2000);
    };
    t = setTimeout(blink, 3000);
    return () => clearTimeout(t);
  }, []);

  // Speaking mouth cycle
  useEffect(() => {
    if (expression !== 'talking') { setMouthSpeakCycle(false); return; }
    const iv = setInterval(() => setMouthSpeakCycle((p) => !p), 180);
    return () => clearInterval(iv);
  }, [expression]);

  // Click tickle bubble
  const handleClick = () => {
    const phrases = ['Tickle! 💛', 'Giggle! ☀️', 'Boing! ✨', 'Hug! 💕', 'Wheee! 🎈', 'Sunny! 🌟', 'Ha-Ha! 😄', 'Hooray! 🎉'];
    setClickEffect({
      id: Date.now(),
      text: phrases[Math.floor(Math.random() * phrases.length)],
      x: Math.floor(Math.random() * 30 + 35),
      y: Math.floor(Math.random() * 30 + 25),
    });
    if (onClick) {
      onClick();
    }
  };

  useEffect(() => {
    if (!clickEffect) return;
    const t = setTimeout(() => setClickEffect(null), 1800);
    return () => clearTimeout(t);
  }, [clickEffect]);

  const safeExpression = expression ?? 'happy';

  // Per-expression flags
  let bodyBounceClass = 'animate-idle-float';
  let showThoughtBubble = false;
  let showZzz = false;
  let showConfetti = false;
  let showSweatDrop = false;
  let showLightningShock = false;
  let showCoinsStars = false;
  let showPulsingHeart = false;
  let shakeClass = '';
  let headRotation = 0;

  if (safeExpression === 'listening') { headRotation = -8; }
  else if (safeExpression === 'thinking') { headRotation = 8; showThoughtBubble = true; }
  else if (safeExpression === 'cheering') { bodyBounceClass = ''; showConfetti = true; }
  else if (safeExpression === 'talking') { /* default float */ }
  else if (safeExpression === 'excited') { shakeClass = 'animate-jitter'; showSweatDrop = true; }
  else if (safeExpression === 'correct') { showCoinsStars = true; headRotation = 4; }
  else if (safeExpression === 'surprised') { showLightningShock = true; shakeClass = 'animate-jitter'; }
  else if (safeExpression === 'sleepy') { bodyBounceClass = 'animate-slow-nod'; showZzz = true; }
  else if (safeExpression === 'sad') { headRotation = -4; showPulsingHeart = true; }

  // 18 dense rays at 20-degree increments
  const RAYS_18 = [0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300, 320, 340];

  const raySpin =
    safeExpression === 'cheering' ? 'animate-[spin_12s_linear_infinite]' :
      safeExpression === 'excited' ? 'animate-[spin_6s_linear_infinite]' :
        safeExpression === 'happy' ? 'animate-[spin_30s_linear_infinite]' :
          'animate-[spin_45s_linear_infinite]';

  return (
    <div
      onClick={handleClick}
      className="relative w-full h-full flex items-center justify-center select-none cursor-pointer"
      title="Tap Sunny!"
    >
      {/* Starburst glow for correct */}
      {showCoinsStars && (
        <div className="absolute inset-0 z-0 flex items-center justify-center overflow-visible pointer-events-none">
          <svg className="w-[150%] h-[150%] overflow-visible text-amber-300 opacity-60 animate-starburst" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="12" fill="currentColor" filter="blur(2px)" />
            <path d="M50 0 L53 35 L85 15 L56 42 L100 50 L56 58 L85 85 L53 65 L50 100 L47 65 L15 85 L44 58 L0 50 L44 42 L15 15 L47 35 Z" fill="currentColor" />
          </svg>
        </div>
      )}

      {/* Rising stars for correct */}
      {showCoinsStars && (
        <div className="absolute inset-x-0 -top-12 h-64 z-10 pointer-events-none">
          <div className="absolute left-[15%] top-[10%] animate-coin-1 text-3xl">⭐</div>
          <div className="absolute left-[35%] top-[30%] animate-coin-2 text-2xl">✨</div>
          <div className="absolute right-[20%] top-[15%] animate-coin-3 text-3xl">⭐</div>
          <div className="absolute right-[40%] top-[40%] animate-coin-1 text-xl">✨</div>
        </div>
      )}

      {/* Confetti for cheering */}
      {showConfetti && (
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
          <div className="absolute left-[10%] top-[5%] w-3 h-3 bg-red-400 rounded-full animate-confetti-1" />
          <div className="absolute left-[25%] top-[15%] w-2 h-4 bg-yellow-400 rounded-sm animate-confetti-1" style={{ animationDelay: '0.4s' }} />
          <div className="absolute left-[45%] top-[0%] w-3.5 h-2.5 bg-blue-400 rounded-lg animate-confetti-1" style={{ animationDelay: '0.8s' }} />
          <div className="absolute right-[15%] top-[10%] w-2.5 h-2.5 bg-green-400 rounded-full animate-confetti-1" style={{ animationDelay: '1.2s' }} />
          <div className="absolute right-[30%] top-[5%] w-3 h-3 bg-pink-400 rounded-sm animate-confetti-1" style={{ animationDelay: '1.6s' }} />
        </div>
      )}

      {/* Main SVG */}
      <svg
        viewBox="0 0 400 400"
        className={`w-full h-full overflow-visible z-10 drop-shadow-xl transition-all duration-300 ${bodyBounceClass} ${shakeClass}`}
      >
        <defs>
          {/* Synchronized bright gold-orange core gradient for Sun body - Adjusted to be lighter and softer */}
          <linearGradient id="msBodyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFFFA6" />
            <stop offset="45%" stopColor="#FFEE7D" />
            <stop offset="100%" stopColor="#FFAF4B" />
          </linearGradient>

          {/* Deep Orange gradient for outer back rays */}
          <linearGradient id="msRayOuterGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FF4500" />
            <stop offset="45%" stopColor="#FF6A00" />
            <stop offset="100%" stopColor="#FF8C00" />
          </linearGradient>

          {/* Warm Amber gradient for middle overlap rays */}
          <linearGradient id="msRayMidGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFA500" />
            <stop offset="55%" stopColor="#FFB800" />
            <stop offset="100%" stopColor="#FFD000" />
          </linearGradient>

          {/* Soft Cream-Yellow gradient for outer foreground rays */}
          <linearGradient id="msRayFgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFE135" />
            <stop offset="30%" stopColor="#FFF5A0" />
            <stop offset="100%" stopColor="#FFF8D0" />
          </linearGradient>

          {/* Golden star gradient */}
          <linearGradient id="msStarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFE047" />
            <stop offset="100%" stopColor="#EAB308" />
          </linearGradient>
        </defs>

        {/* Ground shadow */}
        <ellipse cx="200" cy="365" rx={safeExpression === 'cheering' ? 50 : 75} ry="10"
          fill="#cbd5e1" opacity={safeExpression === 'cheering' ? 0.3 : 0.5}
          className="transition-all duration-300" />

        <g transform={`rotate(${headRotation} 200 215)`} className="transition-transform duration-300 origin-[200px_215px]">

          {/* Rotating rays with 3-layered dense design and isolated rotation wrappers */}
          <g className={raySpin} style={{ transformOrigin: '200px 215px' }}>

            {/* Lớp 1: Lớp tia phía sau cùng (Dẹt rộng, Đỏ cam, góc lệch 13.3º) */}
            {RAYS_18.map((angle, index) => {
              const bgGroups = ['a', 'b', 'c', 'd'];
              const bgGroup = bgGroups[(index + 1) % 4];
              return (
                <g key={`outer-${angle}`} transform={`rotate(${angle + 13.3} 200 215)`}>
                  <path
                    d="M 184 105 C 184 45, 216 45, 216 105 C 216 155, 184 155, 184 105 Z"
                    fill="url(#msRayOuterGrad)"
                    stroke="none"
                    className={`animate-ray-${bgGroup} opacity-95`}
                    style={{ transformOrigin: '200px 215px', transformBox: 'view-box' }}
                  />
                </g>
              );
            })}

            {/* Lớp 2: Lớp tia giữa (Trung bình, Cam vàng, góc lệch 6.6º) */}
            {RAYS_18.map((angle, index) => {
              const midGroups = ['b', 'c', 'd', 'a'];
              const midGroup = midGroups[(index + 2) % 4];
              return (
                <g key={`mid-${angle}`} transform={`rotate(${angle + 6.6} 200 215)`}>
                  <path
                    d="M 183 118 C 183 58, 217 58, 217 118 C 217 155, 183 155, 183 118 Z"
                    fill="url(#msRayMidGrad)"
                    stroke="none"
                    className={`animate-ray-${midGroup} opacity-95`}
                    style={{ transformOrigin: '200px 215px', transformBox: 'view-box' }}
                  />
                </g>
              );
            })}

            {/* Lớp 3: Lớp tia phía trước (Ngắn và mập, Vàng tươi rực rỡ, chính diện 0º) */}
            {RAYS_18.map((angle, index) => {
              const fgGroups = ['a', 'b', 'c', 'd'];
              const fgGroup = fgGroups[index % 4];
              return (
                <g key={`fg-${angle}`} transform={`rotate(${angle} 200 215)`}>
                  <path
                    d="M 180 128 C 180 72, 220 72, 220 128 C 220 160, 180 160, 180 128 Z"
                    fill="url(#msRayFgGrad)"
                    stroke="none"
                    className={`animate-ray-${fgGroup}`}
                    style={{ transformOrigin: '200px 215px', transformBox: 'view-box' }}
                  />
                </g>
              );
            })}

          </g>

          {/* Sun body */}
          <circle cx="200" cy="215" r="85" fill="url(#msBodyGrad)" />
          <path d="M 152 170 A 75 75 0 0 1 258 170 A 65 65 0 0 0 152 170 Z" fill="#FFFFFF" opacity="0.32" />

          {/* Cheeks */}
          <ellipse cx="132" cy="225" rx="18" ry="14" fill="#FF7E5F" opacity="0.8" />
          <ellipse cx="268" cy="225" rx="18" ry="14" fill="#FF7E5F" opacity="0.8" />

          {/* Left eye */}
          <g transform="translate(165, 205)">
            {isBlinking || safeExpression === 'sleepy' ? (
              safeExpression === 'sleepy' ? (
                <g>
                  <circle cx="0" cy="0" r="14" fill="#FFFFFF" />
                  <path d="M -14 -4 Q 0 -1 14 -4" fill="none" stroke="#2D1D18" strokeWidth="3" strokeLinecap="round" />
                  <ellipse cx="0" cy="5" rx="7" ry="5" fill="#2D1D18" />
                  <path d="M -14 -14 L 14 -14 L 14 -1 L -14 -1 Z" fill="#FFE28C" opacity="0.85" />
                </g>
              ) : (
                <path d="M -12 0 Q 0 4 12 0" fill="none" stroke="#2D1D18" strokeWidth="5" strokeLinecap="round" />
              )
            ) : safeExpression === 'happy' || safeExpression === 'cheering' ? (
              <path d="M -12 3 Q 0 -6 12 3" fill="none" stroke="#2D1D18" strokeWidth="5.5" strokeLinecap="round" />
            ) : safeExpression === 'sad' ? (
              <g>
                <circle cx="0" cy="2" r="8" fill="#2D1D18" />
                <ellipse cx="-16" cy="12" rx="4.5" ry="7" fill="#60A5FA" opacity="0.9" />
              </g>
            ) : safeExpression === 'surprised' ? (
              <g>
                <circle cx="0" cy="0" r="13" fill="#FFFFFF" />
                <circle cx="0" cy="0" r="5" fill="#2D1D18" />
              </g>
            ) : safeExpression === 'excited' ? (
              <path d="M0 -11 L3 -3 L11 -3 L5 2 L7 10 L0 5 L-7 10 L-5 2 L-11 -3 L-3 -3 Z" fill="url(#msStarGrad)" />
            ) : (
              <g>
                <circle cx="0" cy="0" r="9" fill="#2D1D18" />
                <circle cx="-2.5" cy="-2.5" r="2.5" fill="#FFFFFF" />
              </g>
            )}
          </g>

          {/* Right eye */}
          <g transform="translate(235, 205)">
            {isBlinking || safeExpression === 'sleepy' ? (
              safeExpression === 'sleepy' ? (
                <g>
                  <circle cx="0" cy="0" r="14" fill="#FFFFFF" />
                  <path d="M -14 -4 Q 0 -1 14 -4" fill="none" stroke="#2D1D18" strokeWidth="3" strokeLinecap="round" />
                  <ellipse cx="0" cy="5" rx="7" ry="5" fill="#2D1D18" />
                  <path d="M -14 -14 L 14 -14 L 14 -1 L -14 -1 Z" fill="#FFE28C" opacity="0.85" />
                </g>
              ) : (
                <path d="M -12 0 Q 0 4 12 0" fill="none" stroke="#2D1D18" strokeWidth="5" strokeLinecap="round" />
              )
            ) : safeExpression === 'happy' || safeExpression === 'cheering' ? (
              <path d="M -12 3 Q 0 -6 12 3" fill="none" stroke="#2D1D18" strokeWidth="5.5" strokeLinecap="round" />
            ) : safeExpression === 'sad' ? (
              <g><circle cx="0" cy="2" r="8" fill="#2D1D18" /></g>
            ) : safeExpression === 'surprised' ? (
              <g>
                <circle cx="0" cy="0" r="13" fill="#FFFFFF" />
                <circle cx="0" cy="0" r="5" fill="#2D1D18" />
              </g>
            ) : safeExpression === 'excited' ? (
              <path d="M0 -11 L3 -3 L11 -3 L5 2 L7 10 L0 5 L-7 10 L-5 2 L-11 -3 L-3 -3 Z" fill="url(#msStarGrad)" />
            ) : (
              <g>
                <circle cx="0" cy="0" r="9" fill="#2D1D18" />
                <circle cx="-2.5" cy="-2.5" r="2.5" fill="#FFFFFF" />
              </g>
            )}
          </g>

          {/* Eyebrows */}
          {safeExpression !== 'happy' && safeExpression !== 'cheering' && (
            <>
              <path
                d={safeExpression === 'thinking' ? 'M 152 178 Q 166 172 176 182' :
                  safeExpression === 'surprised' ? 'M 152 174 Q 166 166 180 174' :
                    safeExpression === 'sad' ? 'M 152 186 Q 166 182 176 188' :
                      'M 152 182 Q 166 177 178 182'}
                fill="none" stroke="#2D1D18" strokeWidth="2.5" strokeLinecap="round"
                className="transition-all duration-300"
              />
              <path
                d={safeExpression === 'thinking' ? 'M 224 172 Q 238 162 248 168' :
                  safeExpression === 'surprised' ? 'M 220 174 Q 234 166 248 174' :
                    safeExpression === 'sad' ? 'M 224 188 Q 234 182 244 186' :
                      'M 222 182 Q 234 177 248 182'}
                fill="none" stroke="#2D1D18" strokeWidth="2.5" strokeLinecap="round"
                className="transition-all duration-300"
              />
            </>
          )}

          {/* Mouth */}
          <g transform="translate(200, 220)">
            {safeExpression === 'happy' || safeExpression === 'correct' ? (
              <g>
                <path d="M -10 -2 Q 0 10 10 -2 Z" fill="#F43F5E" stroke="#2D1D18" strokeWidth="3.5" strokeLinejoin="round" />
                <path d="M -5 3 Q 0 7 5 3" fill="none" stroke="#FDA4AF" strokeWidth="2" strokeLinecap="round" />
              </g>
            ) : safeExpression === 'cheering' ? (
              <g>
                <ellipse cx="0" cy="3" rx="8" ry="11" fill="#F43F5E" stroke="#2D1D18" strokeWidth="3" />
                <ellipse cx="0" cy="8" rx="5" ry="4" fill="#FDA4AF" />
              </g>
            ) : safeExpression === 'surprised' ? (
              <ellipse cx="0" cy="4" rx="7" ry="10" fill="#2D1D18" />
            ) : safeExpression === 'talking' && mouthSpeakCycle ? (
              <ellipse cx="0" cy="2" rx="8" ry="6" fill="#F43F5E" stroke="#2D1D18" strokeWidth="2.5" />
            ) : safeExpression === 'sad' ? (
              <path d="M -8 5 Q 0 -1 8 5" fill="none" stroke="#2D1D18" strokeWidth="3.5" strokeLinecap="round" />
            ) : safeExpression === 'thinking' ? (
              <path d="M -10 2 Q 0 -1 8 3" fill="none" stroke="#2D1D18" strokeWidth="3" strokeLinecap="round" />
            ) : (
              <path d="M -8 -1 Q 0 5 8 -1" fill="none" stroke="#2D1D18" strokeWidth="4" strokeLinecap="round" />
            )}
          </g>

          {/* Correct floating star */}
          {safeExpression === 'correct' && (
            <path d="M 285 110 L 290 120 L 301 121 L 293 128 L 295 139 L 285 133 L 275 139 L 277 128 L 269 121 L 280 120 Z"
              fill="url(#msStarGrad)" stroke="#1E293B" strokeWidth="2.5"
              className="animate-heart-pulse origin-[285px_124px]" />
          )}

          {/* Pulsing heart (sad) */}
          {showPulsingHeart && (
            <g transform="translate(200, 275) scale(1.1)" className="animate-heart-pulse">
              <path d="M 12, -8 C 12, -20, -12, -20, -12, -8 C -12, 4, 12, 22, 12, 22 C 12, 22, 36, 4, 36, -8 C 36, -20, 12, -20, 12, -8 Z"
                fill="#FF2E5B" stroke="#1E293B" strokeWidth="4" strokeLinejoin="round"
                transform="translate(-12, -8)" />
              <path d="M 4 -10 A 5 5 0 0 1 -3 -5" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
            </g>
          )}

          {/* Sweat drop (excited) */}
          {showSweatDrop && (
            <path d="M 112 170 C 112 170, 105 180, 105 185 C 105 189, 108 192, 112 192 C 116 192, 119 189, 119 185 C 119 180, 112 170, 112 170 Z"
              fill="#2563EB" stroke="#FFF" strokeWidth="1.5"
              className="animate-sweat" />
          )}

          {/* Lightning shock (surprised) */}
          {showLightningShock && (
            <g stroke="#EAB308" strokeWidth="4.5" strokeLinecap="round" fill="none" opacity="0.9">
              <path d="M 70 150 L 55 140" /><path d="M 64 180 L 46 180" />
              <path d="M 330 150 L 345 140" /><path d="M 336 180 L 354 180" />
              <path d="M 200 75 L 200 60" /><path d="M 160 85 L 150 70" /><path d="M 240 85 L 250 70" />
            </g>
          )}
        </g>
      </svg>

      {/* Zzz bubbles (sleepy) */}
      {showZzz && (
        <div className="absolute right-[12%] top-[8%] z-20 pointer-events-none select-none text-[#E99B81] font-bold font-bubblegum">
          <div className="absolute animate-zzz-1 text-2xl -top-4 -right-2">Z</div>
          <div className="absolute animate-zzz-2 text-3xl -top-12 right-4">Z</div>
          <div className="absolute animate-zzz-3 text-4xl -top-20 right-14">Z</div>
        </div>
      )}

      {/* Thought bubble (thinking) */}
      {showThoughtBubble && (
        <div className="absolute left-[54%] top-[-8%] z-20 pointer-events-none select-none bg-orange-50 border-4 border-[#E99B81] rounded-2xl px-4 py-2 font-black text-[#5A7A71] flex gap-1 shadow-md animate-bounce">
          <span className="animate-pulse">..</span>
          <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>..</span>
          <span className="animate-pulse" style={{ animationDelay: '0.4s' }}>..</span>
          <div className="absolute -bottom-3 left-4 w-3.5 h-3.5 bg-orange-50 border-2 border-[#E99B81] rounded-full" />
          <div className="absolute -bottom-5 left-1 w-2 h-2 bg-orange-50 border-2 border-[#E99B81] rounded-full" />
        </div>
      )}

      {/* Tickle click pop */}
      {clickEffect && (
        <div
          key={clickEffect.id}
          className="absolute z-30 font-bubblegum text-lg text-[#0284C7] font-black drop-shadow animate-float-giggle pointer-events-none select-none whitespace-nowrap bg-white border-4 border-sky-300 rounded-full px-4 py-1.5 shadow-md"
          style={{ left: `${clickEffect.x}%`, top: `${clickEffect.y}%` }}
        >
          {clickEffect.text}
        </div>
      )}
    </div>
  );
}

// ─── Public SunnyMascot wrapper — same props as before ──────────────────────
export function SunnyMascot({ state = 'idle', sizeClassName, onClick }: MascotProps) {
  const expression = mapStateToExpression(state ?? 'idle');
  const sizeClass = sizeClassName ?? DEFAULT_SIZE_CLASS;

  return (
    <div className={`${sizeClass} relative`}>
      <MascotSun expression={expression} onClick={onClick} />
    </div>
  );
}

// ─── Universal default export supporting both sets of props ───
export default function UniversalMascot({
  expression,
  onClick,
  state = 'idle',
  sizeClassName,
}: MascotProps) {
  if (expression !== undefined) {
    return <MascotSun expression={expression} onClick={onClick} />;
  }
  const mappedExpression = mapStateToExpression(state);
  const sizeClass = sizeClassName ?? DEFAULT_SIZE_CLASS;
  return (
    <div className={`${sizeClass} relative`}>
      <MascotSun expression={mappedExpression} onClick={onClick} />
    </div>
  );
}