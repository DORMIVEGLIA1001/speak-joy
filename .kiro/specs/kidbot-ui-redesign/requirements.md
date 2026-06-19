# Requirements: KidBot Practice UI Redesign

## Overview
Redesign the KidBot Practice interface to match the reference design (image 2), focusing on a cleaner, more centered chat experience with dynamic avatar sizing.

## User Story
**As a** child using the KidBot practice feature  
**I want** a cleaner, more focused chat interface  
**So that** I can concentrate on the conversation without distractions

## Functional Requirements

### FR-1: Remove Bot Switcher
**Priority:** High  
**Description:** Remove the button that switches between Owl (Hoot) and Bee (Buzzy) bots.

**Acceptance Criteria:**
- [ ] The "Switch Bot" button in the header is completely removed
- [ ] Bot selection is fixed (default to Bee/Buzzy)
- [ ] No visual remnants of the switcher remain
- [ ] Header layout adjusts to fill the space

**Rationale:** Simplify the interface and reduce cognitive load for children.

---

### FR-2: Centered Chat Layout
**Priority:** High  
**Description:** Redesign the layout to center the chat conversation with the bot avatar positioned above.

**Acceptance Criteria:**
- [ ] Bot avatar is centered horizontally on the screen
- [ ] Chat messages appear directly below the avatar
- [ ] Chat bubbles are centered and aligned properly
- [ ] Layout matches the reference design (image 2)
- [ ] Background decorations (stars, flowers, etc.) remain visible

**Rationale:** Create a more focused, conversation-centric experience similar to modern chat apps.

---

### FR-3: Dynamic Avatar Sizing
**Priority:** High  
**Description:** Implement smooth avatar size transitions based on chat state.

**Acceptance Criteria:**
- [ ] **Initial state (no messages):**
  - Avatar is large (current size: ~160px width)
  - Positioned in the center-top area
  - Name badge and status chip visible below
  
- [ ] **Chat active state (messages present):**
  - Avatar shrinks to smaller size (~80-100px width)
  - Moves to top of screen
  - Name badge becomes compact or hidden
  - Status chip becomes smaller or hidden
  - Transition is smooth (0.3-0.5s ease animation)
  
- [ ] **Transition triggers:**
  - Shrink: When first message appears
  - Expand: When all messages are cleared (if applicable)

**Rationale:** Maximize screen space for chat content while maintaining visual identity.

---

### FR-4: Chat Area Optimization
**Priority:** High  
**Description:** Optimize the chat message area to use the space freed by the smaller avatar.

**Acceptance Criteria:**
- [ ] Chat container expands vertically when avatar shrinks
- [ ] Messages remain readable and properly spaced
- [ ] Scroll behavior works smoothly
- [ ] Input field remains at bottom
- [ ] Score card and controls remain accessible

**Rationale:** Provide more room for conversation history.

---

### FR-5: Preserve Core Functionality
**Priority:** Critical  
**Description:** Ensure all existing features continue to work after UI changes.

**Acceptance Criteria:**
- [ ] Voice recording (tap avatar) works
- [ ] Text input and send button work
- [ ] Message display (bot and user) works
- [ ] Audio playback in messages works
- [ ] Score display updates correctly
- [ ] Lesson navigation works
- [ ] Session end functionality works
- [ ] All animations (blink, wing flap, etc.) work

**Rationale:** UI changes should not break existing functionality.

---

## Non-Functional Requirements

### NFR-1: Performance
- Avatar size transitions must be smooth (60fps)
- No layout shift or jank during transitions
- Chat scroll performance must remain smooth

### NFR-2: Responsive Design
- Layout must work on mobile screens (320px+)
- Layout must work on tablet screens (768px+)
- Layout must work on desktop screens (1024px+)

### NFR-3: Accessibility
- Avatar size changes should not affect screen reader navigation
- Focus management should remain logical
- Color contrast ratios must meet WCAG AA standards

### NFR-4: Browser Compatibility
- Must work in Chrome, Firefox, Safari, Edge (latest 2 versions)
- Must work on iOS Safari and Android Chrome

---

## Technical Constraints

1. **Framework:** React with Next.js (existing)
2. **Styling:** Inline styles with CSS-in-JS (existing pattern)
3. **Animation:** CSS transitions and keyframes (existing pattern)
4. **State Management:** React hooks (existing pattern)

---

## Out of Scope

- Adding new bot characters
- Changing bot personalities or responses
- Modifying voice recording logic
- Changing scoring algorithm
- Adding new message types
- Implementing dark/light theme toggle (explicitly removed)

---

## Dependencies

- No external dependencies required
- Uses existing component structure
- Uses existing animation system

---

## Success Metrics

1. **Visual Match:** UI matches reference design (image 2) at 95%+ similarity
2. **Performance:** Avatar transition completes in <500ms
3. **Usability:** No increase in user errors or confusion
4. **Code Quality:** No new console errors or warnings

---

## Open Questions

1. Should we keep the voice selector dropdown in the header?
2. Should the lesson progress bar remain visible when avatar is small?
3. Should the "tokens" counter remain in the same position?
4. What should be the exact small avatar size (80px or 100px)?

---

## Assumptions

1. Users primarily interact via chat (not switching bots frequently)
2. Larger chat area improves user experience
3. Avatar size change is intuitive and not disorienting
4. Reference design (image 2) represents the desired end state

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-XX | AI Assistant | Initial requirements document |
