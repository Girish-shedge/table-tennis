export type Difficulty = "easy" | "medium" | "hard";

export interface DifficultyParams {
  label: string;
  /** Time after the player's hit before the AI starts tracking (ms). */
  reactionMs: number;
  /** Std-dev of the AI's tracking error, in meters. */
  sigma: number;
  /** Max lateral paddle speed, m/s. */
  speedCap: number;
  /** Base speed of the AI's return shots, m/s. */
  returnSpeed: number;
  /** Base speed of the AI's serves, m/s. */
  serveSpeed: number;
  /** How wide the AI aims (0 = always center, 0.6 = corners). */
  aimSpread: number;
  /** Fraction of shots where the AI intentionally aims away from the player. */
  cornerBias: number;
  /** Extra forgiveness on the AI's paddle hit radius (m). */
  hitBonus: number;
}

export const CONFIG = {
  winScore: 11,
  winBy: 2,
  opponentName: "Bot",
  playerName: "You",

  // Physics (meters, seconds)
  gravity: 9.8,
  restitution: 0.85,
  tableFriction: 0.98,
  tableW: 1.525,
  tableL: 2.74,
  netZ: 1.37,
  netHeight: 0.1525,
  netOverhang: 0.1525,
  ballR: 0.02,
  floorY: -0.76,

  // Player paddle
  paddleHover: 0.14, // height the paddle floats above the table
  paddleArtR: 0.15, // visual radius of the paddle face
  paddleHitR: 0.17, // hit radius in x (meters)
  paddleHitYMin: -0.08,
  paddleHitYMax: 0.55,
  paddleSmooth: 0.07, // seconds (exponential follow)
  paddleKeySpeedX: 2.8, // m/s via keyboard
  paddleKeySpeedZ: 2.0,
  paddleXMargin: 0.25,
  paddleZMin: 0.3,
  paddleZMax: 1.2,
  playerShotSpeed: 5.0,

  // Opponent paddle
  aiPaddleZ: 2.62,
  aiPaddleHover: 0.26,
  aiPaddleArtScale: 0.52,
  aiPaddleHitR: 0.09, // base hit radius; difficulty adds `hitBonus`
  aiDistanceError: 0.14, // extra tracking error per meter the AI must travel
  aiServeDelayMs: 900,

  // Flow
  bubbleHoldMs: 900,
  bubbleFadeMs: 300,
  pointFreezeMs: 1200,

  // Art
  farNearRatio: 0.48,
  headHeight: 0.62, // world y of the character head above the far edge
  headRadius: 0.25, // meters, at the far edge's scale

  footer: {
    instagram: "https://www.instagram.com/girishedge_/",
    x: "https://x.com/_girishedge_?s=11",
    linkedin: "https://www.linkedin.com/in/girish-shedge-9337571b8/",
  },

  difficulty: {
    easy: {
      label: "Easy",
      reactionMs: 260,
      sigma: 0.09,
      speedCap: 1.0,
      returnSpeed: 3.6,
      serveSpeed: 3.6,
      aimSpread: 0.35,
      cornerBias: 0.15,
      hitBonus: 0.0,
    },
    medium: {
      label: "Medium",
      reactionMs: 170,
      sigma: 0.075,
      speedCap: 1.4,
      returnSpeed: 4.3,
      serveSpeed: 4.1,
      aimSpread: 0.5,
      cornerBias: 0.4,
      hitBonus: 0.02,
    },
    hard: {
      label: "Hard",
      reactionMs: 100,
      sigma: 0.04,
      speedCap: 1.9,
      returnSpeed: 5.2,
      serveSpeed: 4.7,
      aimSpread: 0.62,
      cornerBias: 0.7,
      hitBonus: 0.04,
    },
  } as Record<Difficulty, DifficultyParams>,
};

export const COLORS = {
  bg: "#FFFFFF",
  table: "#0A8CFF",
  tableEdge: "#0070D6",
  net: "rgba(140, 203, 255, 0.6)",
  ink: "#111111",
  paddleRed: "#D23B3B",
  paddleRedDark: "#B02E2E",
  paddleBlue: "#3F78BE",
  bubble: "#F23B3B",
  shadow: "rgba(10, 79, 153, 0.45)",
  muted: "#8A8A8A",
  white: "#FFFFFF",
};

export const FONTS = {
  serif: '"SF Cartoonist Hand", "Comic Sans MS", "Chalkboard SE", sans-serif',
  sans: '"SF Cartoonist Hand", "Comic Sans MS", "Chalkboard SE", sans-serif',
};
