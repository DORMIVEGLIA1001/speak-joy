import { describe, expect, it } from 'vitest';

import { buildGameRecordPatch } from './gameRecords';

describe('game record updates', () => {
  it('sends only the newly completed flashcard time', () => {
    const patch = buildGameRecordPatch('fm', 17);
    expect(patch).toEqual({ flashcardMatchBestTime: 17 });
    expect(patch).not.toHaveProperty('trueFalseHighScore');
  });

  it('sends the Blast high score through the shared game-record API', () => {
    expect(buildGameRecordPatch('blast', 35)).toEqual({ blastHighScore: 35 });
  });
});
