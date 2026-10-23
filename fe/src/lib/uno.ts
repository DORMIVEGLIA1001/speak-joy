// Pure UNO game logic — deterministic, side-effect free, unit-testable.
// UI (fe/src/components/games/UnoGame.tsx) consumes these helpers.

export type UnoColor = 'red' | 'yellow' | 'green' | 'blue';
export type UnoWildColor = UnoColor | 'wild';
export type UnoValue =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';

export interface UnoCard {
  id: string;
  color: UnoWildColor; // 'wild' for black cards until chosen
  value: UnoValue;
}

export const UNO_COLORS: UnoColor[] = ['red', 'yellow', 'green', 'blue'];
export const SPECIAL_VALUES: UnoValue[] = ['skip', 'reverse', 'draw2', 'wild', 'wild4'];

export const isSpecial = (card: UnoCard): boolean => SPECIAL_VALUES.includes(card.value);
export const isWild = (card: UnoCard): boolean => card.value === 'wild' || card.value === 'wild4';

// Build a standard 108-card UNO deck.
export const buildDeck = (): UnoCard[] => {
  const deck: UnoCard[] = [];
  let seq = 0;
  const push = (color: UnoWildColor, value: UnoValue) => {
    deck.push({ id: `c${seq++}`, color, value });
  };
  for (const color of UNO_COLORS) {
    push(color, '0'); // one zero per color
    for (let n = 1; n <= 9; n += 1) {
      const value = String(n) as UnoValue;
      push(color, value);
      push(color, value); // two of 1-9 per color
    }
    for (const value of ['skip', 'reverse', 'draw2'] as UnoValue[]) {
      push(color, value);
      push(color, value); // two of each action per color
    }
  }
  for (let i = 0; i < 4; i += 1) {
    push('wild', 'wild');
    push('wild', 'wild4');
  }
  return deck;
};

// Fisher-Yates shuffle using an injectable rng (default Math.random) for testability.
export const shuffle = <T>(items: T[], rng: () => number = Math.random): T[] => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

// Whether `card` may be played on top of `topCard` given the active color.
export const canPlay = (card: UnoCard, topCard: UnoCard, activeColor: UnoColor): boolean => {
  if (isWild(card)) return true;
  if (card.color === activeColor) return true;
  return card.value === topCard.value;
};

// Index of the next player, honoring direction (1 clockwise, -1 counter) and skip count.
export const nextPlayerIndex = (
  current: number,
  playerCount: number,
  direction: 1 | -1,
  step = 1,
): number => {
  const raw = (current + direction * step) % playerCount;
  return (raw + playerCount) % playerCount;
};

export interface UnoPlayer {
  id: string;
  name: string;
  isHuman: boolean;
  hand: UnoCard[];
}

export interface UnoState {
  players: UnoPlayer[];
  drawPile: UnoCard[];
  discardPile: UnoCard[];
  activeColor: UnoColor;
  currentPlayer: number;
  direction: 1 | -1;
  pendingDraw: number;   // accumulated +2/+4 to be drawn by next player
  winner: number | null;
}

const HAND_SIZE = 7;

// Deal a fresh game. The first non-wild card becomes the discard top.
export const dealGame = (players: Omit<UnoPlayer, 'hand'>[], rng: () => number = Math.random): UnoState => {
  let deck = shuffle(buildDeck(), rng);
  const dealt: UnoPlayer[] = players.map((p) => ({ ...p, hand: [] }));
  for (let round = 0; round < HAND_SIZE; round += 1) {
    for (const player of dealt) {
      player.hand.push(deck.shift()!);
    }
  }
  // Find first non-wild card to start the discard pile.
  let startIdx = deck.findIndex((c) => !isWild(c));
  if (startIdx < 0) startIdx = 0;
  const [start] = deck.splice(startIdx, 1);
  return {
    players: dealt,
    drawPile: deck,
    discardPile: [start],
    activeColor: start.color === 'wild' ? UNO_COLORS[0] : start.color,
    currentPlayer: 0,
    direction: 1,
    pendingDraw: 0,
    winner: null,
  };
};

export const topCard = (state: UnoState): UnoCard => state.discardPile[state.discardPile.length - 1];

// Reshuffle discard (except top) back into the draw pile when it runs dry.
export const refillDrawPile = (state: UnoState, rng: () => number = Math.random): UnoState => {
  if (state.drawPile.length > 0 || state.discardPile.length <= 1) return state;
  const keep = state.discardPile[state.discardPile.length - 1];
  const recycled = shuffle(state.discardPile.slice(0, -1), rng);
  return { ...state, drawPile: recycled, discardPile: [keep] };
};

// Draw `count` cards for a player, returning a new state (recycles discard if needed).
export const drawCards = (state: UnoState, playerIdx: number, count: number, rng: () => number = Math.random): UnoState => {
  let next: UnoState = { ...state, players: state.players.map((p) => ({ ...p, hand: [...p.hand] })) };
  for (let i = 0; i < count; i += 1) {
    if (next.drawPile.length === 0) next = refillDrawPile(next, rng);
    const card = next.drawPile[0];
    if (!card) break;
    next = { ...next, drawPile: next.drawPile.slice(1) };
    next.players[playerIdx].hand.push(card);
  }
  return next;
};

// Which cards in the current player's hand are legally playable right now.
export const playableCards = (state: UnoState): UnoCard[] => {
  const hand = state.players[state.currentPlayer].hand;
  const top = topCard(state);
  return hand.filter((card) => canPlay(card, top, state.activeColor));
};

// Apply a played card. `chosenColor` is required for wild cards.
// Handles skip/reverse/draw effects, advances the turn, and sets winner.
export const playCard = (
  state: UnoState,
  cardId: string,
  chosenColor?: UnoColor,
  rng: () => number = Math.random,
): UnoState => {
  const playerIdx = state.currentPlayer;
  const hand = state.players[playerIdx].hand;
  const card = hand.find((c) => c.id === cardId);
  if (!card) return state;

  let next: UnoState = {
    ...state,
    players: state.players.map((p, i) =>
      i === playerIdx ? { ...p, hand: p.hand.filter((c) => c.id !== cardId) } : { ...p, hand: [...p.hand] },
    ),
    discardPile: [...state.discardPile, isWild(card) ? { ...card, color: chosenColor ?? UNO_COLORS[0] } : card],
  };

  next.activeColor = isWild(card) ? (chosenColor ?? UNO_COLORS[0]) : (card.color as UnoColor);

  let direction = next.direction;
  let skip = 0;
  let addDraw = 0;

  if (card.value === 'reverse') {
    direction = (next.direction * -1) as 1 | -1;
    if (next.players.length === 2) skip = 1; // reverse acts like skip in 2-player
  } else if (card.value === 'skip') {
    skip = 1;
  } else if (card.value === 'draw2') {
    addDraw = 2;
    skip = 1;
  } else if (card.value === 'wild4') {
    addDraw = 4;
    skip = 1;
  }

  next.direction = direction;

  // The victim of a +2/+4 is the next player; give them the cards then skip them.
  if (addDraw > 0) {
    const victim = nextPlayerIndex(playerIdx, next.players.length, direction, 1);
    next = drawCards(next, victim, addDraw, rng);
  }

  next.currentPlayer = nextPlayerIndex(playerIdx, next.players.length, direction, 1 + skip);
  if (next.players[playerIdx].hand.length === 0) {
    next.winner = playerIdx;
  }
  return next;
};

// Simple AI: prefer a playable non-wild match; keep wilds for when stuck.
// Returns the card to play (with chosen color for wilds) or null to draw.
export const chooseAiMove = (
  state: UnoState,
  rng: () => number = Math.random,
): { card: UnoCard; color?: UnoColor } | null => {
  const options = playableCards(state);
  if (options.length === 0) return null;

  const nonWild = options.filter((c) => !isWild(c));
  const pool = nonWild.length > 0 ? nonWild : options;
  const card = pool[Math.floor(rng() * pool.length)];

  if (isWild(card)) {
    // Pick the color the AI holds most of.
    const counts: Record<UnoColor, number> = { red: 0, yellow: 0, green: 0, blue: 0 };
    for (const c of state.players[state.currentPlayer].hand) {
      if (c.color !== 'wild') counts[c.color] += 1;
    }
    const color = UNO_COLORS.reduce((best, c) => (counts[c] > counts[best] ? c : best), UNO_COLORS[0]);
    return { card, color };
  }
  return { card };
};

// Advance the turn when the current player cannot/chooses not to play (after drawing).
export const passTurn = (state: UnoState): UnoState => ({
  ...state,
  currentPlayer: nextPlayerIndex(state.currentPlayer, state.players.length, state.direction, 1),
});
