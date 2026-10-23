import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import LessonModal from './LessonModal';
import type { Lesson } from '../types';

vi.mock('../data', async () => {
  const actual = await vi.importActual<typeof import('../data')>('../data');
  return {
    ...actual,
    playAppSound: vi.fn(),
    playCorrectSound: vi.fn(),
    playIncorrectSound: vi.fn(),
  };
});

const lesson: Lesson = {
  id: 'lesson-test',
  title: 'Test lesson',
  vietnameseTitle: 'Bai hoc thu',
  points: 10,
  completed: false,
  locked: false,
  type: 'lesson',
  questions: [{
    id: 'question-1',
    type: 'multiple',
    prompt: 'Choose apple',
    vietnamesePrompt: 'Chon apple',
    options: ['Apple', 'Banana'],
    correctAnswer: 'Apple',
  }],
};

describe('LessonModal completion sync', () => {
  it('disables the final action while progress is being saved', async () => {
    let finishSaving: () => void = () => undefined;
    const onFinish = vi.fn(() => new Promise<void>((resolve) => {
      finishSaving = resolve;
    }));

    render(
      <LessonModal lesson={lesson} globalLang="en" onClose={vi.fn()} onFinish={onFinish} />
    );

    fireEvent.click(screen.getByRole('button', { name: /Apple/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    const savingButton = await screen.findByRole('button', { name: 'Saving...' });
    expect(savingButton).toBeDisabled();
    expect(onFinish).toHaveBeenCalledTimes(1);

    await act(async () => finishSaving());
  });
});
