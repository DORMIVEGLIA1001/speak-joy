import { describe, it, expect } from 'vitest';
import {
  buildDeck, shuffle, canPlay, nextPlayerIndex, dealGame, playableCards,
  playCard, drawCards, chooseAiMove, topCard, isWild, UnoCard, UnoColor,
} from './uno';

// Deterministic rng for reproducible tests.
const seededRng = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
};

const card = (color: UnoColor | 'wild', value: UnoCard['value'], id = 'x'): UnoCard => ({ id, color, value });

describe('buildDeck', () => {
  it('produces a standard 108-card deck', () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(108);
    expect(deck.filter((c) => c.value === 'wild')).toHaveLength(4);
    expect(deck.filter((c) => c.value === 'wild4')).toHaveLength(4);
    expect(deck.filter((c) => c.value === '0')).toHaveLength(4); // one per color
    expect(deck.filter((c) => c.value === '5')).toHaveLength(8); // two per color
    expect(deck.filter((c) => c.value === 'skip')).toHaveLength(8);
  });
});

describe('shuffle', () => {
  it('preserves all cards and is deterministic with a seeded rng', () => {
    const deck = buildDeck();
    const a = shuffle(deck, seededRng(1));
    const b = shuffle(deck, seededRng(1));
    expect(a.map((c) => c.id).sort()).toEqual(deck.map((c) => c.id).sort());
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
  });
});

describe('canPlay', () => {
  const top = card('red', '5');
  it('allows same color', () => expect(canPlay(card('red', '8'), top, 'red')).toBe(true));
  it('allows same value across color', () => expect(canPlay(card('blue', '5'), top, 'red')).toBe(true));
  it('allows any wild', () => expect(canPlay(card('wild', 'wild'), top, 'red')).toBe(true));
  it('rejects mismatched color and value', () => expect(canPlay(card('blue', '8'), top, 'red')).toBe(false));
  it('respects the active color, not the printed top color', () => {
    expect(canPlay(card('green', '2'), top, 'green')).toBe(true);
    expect(canPlay(card('red', '2'), top, 'green')).toBe(false);
  });
});

describe('nextPlayerIndex', () => {
  it('wraps clockwise and counter-clockwise', () => {
    expect(nextPlayerIndex(3, 4, 1, 1)).toBe(0);
    expect(nextPlayerIndex(0, 4, -1, 1)).toBe(3);
    expect(nextPlayerIndex(0, 4, 1, 2)).toBe(2); // skip
  });
});

describe('dealGame', () => {
  it('deals 7 cards each and a non-wild starting discard', () => {
    const state = dealGame(
      [
        { id: 'p0', name: 'Kid', isHuman: true },
        { id: 'p1', name: 'AI', isHuman: false },
      ],
      seededRng(7),
    );
    expect(state.players[0].hand).toHaveLength(7);
    expect(state.players[1].hand).toHaveLength(7);
    expect(state.discardPile).toHaveLength(1);
    expect(isWild(topCard(state))).toBe(false);
    expect(state.activeColor).toBe(topCard(state).color);
    // total cards conserved: 108
    const total = state.drawPile.length + state.discardPile.length +
      state.players.reduce((n, p) => n + p.hand.length, 0);
    expect(total).toBe(108);
  });
});

describe('playCard effects', () => {
  const basePlayers = [
    { id: 'p0', name: 'A', isHuman: true },
    { id: 'p1', name: 'B', isHuman: false },
    { id: 'p2', name: 'C', isHuman: false },
  ];

  it('skip advances two players', () => {
    const state = dealGame(basePlayers, seededRng(3));
    const skip = card('red', 'skip', 'sk');
    const seeded = { ...state, activeColor: 'red' as UnoColor,
      players: state.players.map((p, i) => i === 0 ? { ...p, hand: [skip, ...p.hand] } : p) };
    const after = playCard(seeded, 'sk');
    expect(after.currentPlayer).toBe(2); // 0 -> skip 1 -> 2
  });

  it('reverse flips direction', () => {
    const state = dealGame(basePlayers, seededRng(4));
    const rev = card('red', 'reverse', 'rv');
    const seeded = { ...state, activeColor: 'red' as UnoColor,
      players: state.players.map((p, i) => i === 0 ? { ...p, hand: [rev, ...p.hand] } : p) };
    const after = playCard(seeded, 'rv');
    expect(after.direction).toBe(-1);
    expect(after.currentPlayer).toBe(2); // reversed from 0 -> 2
  });

  it('draw2 gives victim 2 cards and skips them', () => {
    const state = dealGame(basePlayers, seededRng(5));
    const d2 = card('red', 'draw2', 'd2');
    const seeded = { ...state, activeColor: 'red' as UnoColor,
      players: state.players.map((p, i) => i === 0 ? { ...p, hand: [d2, ...p.hand] } : p) };
    const before = seeded.players[1].hand.length;
    const after = playCard(seeded, 'd2');
    expect(after.players[1].hand.length).toBe(before + 2);
    expect(after.currentPlayer).toBe(2); // victim (1) is skipped
  });

  it('wild sets the chosen active color', () => {
    const state = dealGame(basePlayers, seededRng(6));
    const w = card('wild', 'wild', 'w');
    const seeded = { ...state,
      players: state.players.map((p, i) => i === 0 ? { ...p, hand: [w, ...p.hand] } : p) };
    const after = playCard(seeded, 'w', 'blue');
    expect(after.activeColor).toBe('blue');
    expect(topCard(after).color).toBe('blue');
  });

  it('declares a winner when the last card is played', () => {
    const state = dealGame(basePlayers, seededRng(8));
    const only = card('red', '7', 'only');
    const seeded = { ...state, activeColor: 'red' as UnoColor,
      players: state.players.map((p, i) => i === 0 ? { ...p, hand: [only] } : p) };
    const after = playCard(seeded, 'only');
    expect(after.winner).toBe(0);
  });

  it('applies skip, reverse, and wild4 correctly with 4 players', () => {
    const players4 = [
      { id: 'p0', name: 'A', isHuman: true },
      { id: 'p1', name: 'B', isHuman: false },
      { id: 'p2', name: 'C', isHuman: false },
      { id: 'p3', name: 'D', isHuman: false },
    ];
    const state = dealGame(players4, seededRng(10));

    const skip = card('red', 'skip', 'skip4');
    const afterSkip = playCard({
      ...state,
      activeColor: 'red',
      currentPlayer: 0,
      players: state.players.map((p, i) => i === 0 ? { ...p, hand: [skip, ...p.hand] } : p),
    }, 'skip4');
    expect(afterSkip.currentPlayer).toBe(2);

    const reverse = card('red', 'reverse', 'reverse4');
    const afterReverse = playCard({
      ...state,
      activeColor: 'red',
      currentPlayer: 0,
      players: state.players.map((p, i) => i === 0 ? { ...p, hand: [reverse, ...p.hand] } : p),
    }, 'reverse4');
    expect(afterReverse.direction).toBe(-1);
    expect(afterReverse.currentPlayer).toBe(3);

    const wild4 = card('wild', 'wild4', 'wild4');
    const victimBefore = state.players[1].hand.length;
    const afterWild4 = playCard({
      ...state,
      currentPlayer: 0,
      players: state.players.map((p, i) => i === 0 ? { ...p, hand: [wild4, ...p.hand] } : p),
    }, 'wild4', 'green');
    expect(afterWild4.players[1].hand.length).toBe(victimBefore + 4);
    expect(afterWild4.currentPlayer).toBe(2);
    expect(afterWild4.activeColor).toBe('green');
  });

  it('still applies draw effects when an action card is the winning last card', () => {
    const players4 = [
      { id: 'p0', name: 'A', isHuman: true },
      { id: 'p1', name: 'B', isHuman: false },
      { id: 'p2', name: 'C', isHuman: false },
      { id: 'p3', name: 'D', isHuman: false },
    ];
    const state = dealGame(players4, seededRng(11));
    const wild4 = card('wild', 'wild4', 'lastWild4');
    const victimBefore = state.players[1].hand.length;
    const after = playCard({
      ...state,
      currentPlayer: 0,
      players: state.players.map((p, i) => i === 0 ? { ...p, hand: [wild4] } : p),
    }, 'lastWild4', 'blue');

    expect(after.winner).toBe(0);
    expect(after.players[1].hand.length).toBe(victimBefore + 4);
    expect(after.currentPlayer).toBe(2);
  });
});

describe('drawCards / playableCards / chooseAiMove', () => {
  it('drawCards adds to the hand and shrinks the draw pile', () => {
    const state = dealGame(
      [{ id: 'p0', name: 'A', isHuman: true }, { id: 'p1', name: 'B', isHuman: false }],
      seededRng(2),
    );
    const before = state.players[0].hand.length;
    const drawn = drawCards(state, 0, 3);
    expect(drawn.players[0].hand.length).toBe(before + 3);
    expect(drawn.drawPile.length).toBe(state.drawPile.length - 3);
  });

  it('chooseAiMove returns a legal card or null', () => {
    const state = dealGame(
      [{ id: 'p0', name: 'A', isHuman: true }, { id: 'p1', name: 'B', isHuman: false }],
      seededRng(9),
    );
    const aiState = { ...state, currentPlayer: 1 };
    const move = chooseAiMove(aiState, seededRng(1));
    if (move) {
      expect(canPlay(move.card, topCard(aiState), aiState.activeColor)).toBe(true);
      if (isWild(move.card)) expect(move.color).toBeDefined();
    } else {
      expect(playableCards(aiState)).toHaveLength(0);
    }
  });
});
