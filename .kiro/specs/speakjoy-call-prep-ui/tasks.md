# Implementation Plan: SpeakJoy Call Prep UI

## Overview

This plan implements the three-column call preparation layout with Tips/Notes panel (left) and Conversation History panel (right) flanking the existing character and call button. The implementation builds incrementally: types and utilities first, then the data hook, then individual panel components, and finally wiring everything into the existing page with responsive layout.

## Tasks

- [x] 1. Create shared types and utility functions
  - [x] 1.1 Create TypeScript interfaces and date/time utility functions
    - Create `fe/types/call-prep.ts` with `TipItem`, `SessionEntryDisplay`, and `GroupedSessions` interfaces
    - Create `fe/lib/call-prep-utils.ts` with pure utility functions: `formatSessionTimestamp` (ISO string → "HH:mm"), `computeSessionDuration` (startedAt, endedAt → formatted duration string or null), and `groupSessionsByDate` (sessions → grouped with Vietnamese relative labels "Hôm nay", "Hôm qua", or formatted date)
    - _Requirements: 4.3, 5.1, 5.3_

  - [x]* 1.2 Write property test for date grouping (Property 1)
    - **Property 1: Date grouping assigns sessions to correct relative labels**
    - Generate random arrays of sessions with various `startedAt` ISO datetime strings; verify each session appears in exactly one group with the correct label ("Hôm nay" for today, "Hôm qua" for yesterday, formatted date otherwise)
    - **Validates: Requirements 4.3**

  - [x]* 1.3 Write property test for duration computation (Property 2)
    - **Property 2: Duration computation correctness**
    - Generate random valid start/end datetime pairs where `endedAt > startedAt`; verify computed duration equals `Math.floor((endedAt - startedAt) / 60000)` and is always a non-negative integer
    - **Validates: Requirements 5.3**

  - [x]* 1.4 Write property test for timestamp formatting (Property 3)
    - **Property 3: Timestamp formatting produces valid time string**
    - Generate random valid ISO datetime strings; verify output matches HH:mm format with valid hour (00-23) and minute (00-59), is never empty, and is deterministic (same input → same output)
    - **Validates: Requirements 5.1**

- [x] 2. Implement the useSessionHistory hook
  - [x] 2.1 Create the useSessionHistory custom hook
    - Create `fe/hooks/useSessionHistory.ts`
    - Fetch sessions from `/api/sessions` using the existing `backendJson` utility and auth token pattern from `backend-sessions.ts`
    - Transform `BackendSession[]` into `GroupedSessions[]` using the utility functions from task 1.1
    - Expose `sessions`, `isLoading`, and `error` state
    - Handle API errors gracefully (return empty state, never throw)
    - Handle sessions with null `endedAt` by marking as incomplete
    - Skip sessions with invalid date data
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 5.2, 5.4_

  - [x]* 2.2 Write unit tests for useSessionHistory hook
    - Test loading state is exposed while fetching
    - Test successful data transformation and grouping
    - Test error handling returns empty sessions without throwing
    - Test empty sessions array returns appropriate empty state
    - Test incomplete sessions (null endedAt) are marked correctly
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 3. Checkpoint - Verify data layer
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement the TipsPanel component
  - [x] 4.1 Create the TipsPanel and TipCard components
    - Create `fe/components/speakjoy/TipsPanel.tsx`
    - Render a vertical list of TipCard sub-components with default tips (quiet space tip, experimental feature tip)
    - Manage dismissed tips via `useState<Set<string>>`
    - Each TipCard displays an emoji icon, text, and a close (X) button in the top-right corner
    - Use `AnimatePresence` for fade-out animation on dismiss
    - Animate panel entry with Framer Motion (fade + slide from left)
    - Support vertical scrolling when content overflows
    - Style with semi-transparent background (`bg-black/20 backdrop-blur-md`), purple/violet border theme (`border-purple-700/40`)
    - When all tips are dismissed, collapse gracefully without leaving blank space
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 7.1, 7.3, 7.4_

  - [x]* 4.2 Write unit tests for TipsPanel
    - Test default tips render on mount
    - Test clicking dismiss removes a tip card
    - Test empty state renders after all tips dismissed
    - Test scrollable overflow behavior
    - _Requirements: 2.1, 2.3, 3.1, 3.2, 3.3_

- [x] 5. Implement the HistoryPanel component
  - [x] 5.1 Create the HistoryPanel and SessionEntryRow components
    - Create `fe/components/speakjoy/HistoryPanel.tsx`
    - Call `useSessionHistory` hook to fetch and display data
    - Render panel title "LỊCH SỬ CUỘC TRÒ CHUYỆN" at the top
    - Render loading indicator while data is being fetched
    - Render empty state message "Chưa có lịch sử cuộc trò chuyện" when no sessions exist
    - Render error state message without blocking the page
    - Group sessions by date with relative labels in Date_Group sections
    - Each SessionEntryRow displays: timestamp, message count (from turnCount), duration, and incomplete status indicator if `endedAt` is null
    - Support vertical scrolling when content overflows
    - Animate panel entry with Framer Motion (fade + slide from right)
    - Style with semi-transparent background (`bg-black/20 backdrop-blur-md`), purple/violet border theme (`border-purple-700/40`)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 6.2, 6.3, 6.4, 7.2, 7.3, 7.4_

  - [x]* 5.2 Write unit tests for HistoryPanel
    - Test title "LỊCH SỬ CUỘC TRÒ CHUYỆN" renders
    - Test loading state displays indicator
    - Test empty state message renders when no sessions
    - Test error state renders gracefully
    - Test session entries display timestamp, message count, and duration
    - Test incomplete sessions show status indicator
    - _Requirements: 4.2, 5.1, 5.2, 5.3, 5.4, 6.2, 6.3, 6.4_

- [x] 6. Checkpoint - Verify panel components
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Integrate panels into the ConversationPage with three-column layout
  - [x] 7.1 Modify ConversationPage to render three-column layout in idle state
    - Modify `fe/app/(dashboard)/SpeakJoy/page.tsx`
    - Wrap the idle-state content (the `else` branch when `!isCallActive`) in a responsive CSS grid: `grid-cols-1 lg:grid-cols-[1fr_auto_1fr]`
    - Import and render `TipsPanel` on the left column
    - Keep existing character + call button in the center column (unchanged)
    - Import and render `HistoryPanel` on the right column
    - Both panels render only when `!isCallActive`
    - Ensure existing character animation, call button, speaker selector, and header remain unmodified
    - _Requirements: 1.1, 1.3, 1.4_

  - [x] 7.2 Implement responsive stacking for viewports below 1024px
    - Below 1024px (`lg` breakpoint), stack layout as single column: TipsPanel above character, HistoryPanel below character
    - Verify the grid switches from three-column to single-column at the breakpoint
    - _Requirements: 1.2_

  - [x]* 7.3 Write integration tests for layout and conditional rendering
    - Test three-column layout renders in idle state
    - Test panels hide when call becomes active
    - Test single-column stacking at viewport < 1024px
    - Test existing header, character, and call button remain present
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- No backend changes are required — all work is frontend-only
- The implementation uses the existing `backendJson` utility and auth patterns from `fe/lib/backend-sessions.ts`
- Framer Motion is already available in the project (used extensively in the existing page)
- Testing uses Vitest + fast-check as specified in the design

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "4.1"] },
    { "id": 2, "tasks": ["2.1", "4.2"] },
    { "id": 3, "tasks": ["2.2", "5.1"] },
    { "id": 4, "tasks": ["5.2", "7.1"] },
    { "id": 5, "tasks": ["7.2"] },
    { "id": 6, "tasks": ["7.3"] }
  ]
}
```
