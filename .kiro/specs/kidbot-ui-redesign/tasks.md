# Tasks

## 1. Remove Bot Switcher Button

Remove the bot switcher button from the header and clean up related code.

**Steps:**
1. Locate the "Switch Bot" button in the header section
2. Remove the button JSX and its event handler
3. Remove the `handleSwitch` function
4. Remove the `switching` state variable
5. Remove the `switch-anim` CSS animation (if not used elsewhere)
6. Adjust header layout to remove gap left by button
7. Test that header renders correctly without the button

**Files:** `fe/features/kid-bot/components/KidBotPractice.tsx`

**Acceptance Criteria:**
- Bot switcher button is not visible
- No console errors
- Header layout looks clean

## 2. Add Chat State Detection

Add state variable to track whether chat has started (has messages).

**Steps:**
1. Add `hasChatStarted` computed value based on `messages.length > 2` (excluding initial greeting)
2. Use this value to control avatar size and layout
3. Test state changes correctly when messages are added

**Files:** `fe/features/kid-bot/components/KidBotPractice.tsx`

**Acceptance Criteria:**
- State correctly reflects chat status
- State updates when messages change

## 3. Implement Dynamic Avatar Sizing

**Dependencies:** 2

Make avatar size responsive to chat state with smooth transitions.

**Steps:**
1. Define avatar size constants: Large (160px), Small (90px when chat active)
2. Add CSS transition for smooth size change
3. Apply size based on `hasChatStarted` state
4. Adjust avatar container positioning
5. Test transition smoothness
6. Test on different screen sizes

**Files:** `fe/features/kid-bot/components/KidBotPractice.tsx`

**Acceptance Criteria:**
- Avatar shrinks smoothly when chat starts
- Transition takes 300-500ms
- No layout jank or flicker
- Works on mobile and desktop

## 4. Adjust Name Badge and Status Chip

**Dependencies:** 3

Make name badge and status chip smaller or hidden when avatar shrinks.

**Steps:**
1. Add conditional rendering/sizing for name badge
2. Add conditional rendering/sizing for status chip
3. Ensure smooth transitions
4. Test visibility states
5. Ensure text remains readable when small

**Files:** `fe/features/kid-bot/components/KidBotPractice.tsx`

**Acceptance Criteria:**
- Name badge scales appropriately
- Status chip scales appropriately
- Text remains legible
- Transitions are smooth

## 5. Optimize Chat Container Layout

**Dependencies:** 3

Adjust chat container to use space freed by smaller avatar.

**Steps:**
1. Modify chat container flex properties
2. Adjust max-height based on avatar size
3. Ensure scroll behavior works correctly
4. Test with various message counts
5. Ensure input field remains at bottom
6. Test on different screen sizes

**Files:** `fe/features/kid-bot/components/KidBotPractice.tsx`

**Acceptance Criteria:**
- Chat area expands when avatar shrinks
- Scroll works smoothly
- Input field stays at bottom
- No overflow issues

## 6. Center Chat Layout

**Dependencies:** 5

Ensure chat messages and avatar are properly centered.

**Steps:**
1. Adjust container alignment
2. Center avatar horizontally
3. Center chat bubbles
4. Adjust padding/margins
5. Test alignment on different screen sizes
6. Compare with reference design

**Files:** `fe/features/kid-bot/components/KidBotPractice.tsx`

**Acceptance Criteria:**
- Avatar is centered
- Chat bubbles are centered
- Layout matches reference design
- Works on all screen sizes

## 7. Adjust Header Layout

**Dependencies:** 1

Reorganize header after removing bot switcher.

**Steps:**
1. Adjust header flex layout
2. Consider moving voice selector
3. Adjust lesson progress position
4. Ensure header looks balanced
5. Test on different screen sizes

**Files:** `fe/features/kid-bot/components/KidBotPractice.tsx`

**Acceptance Criteria:**
- Header looks clean and balanced
- All controls are accessible
- Layout is responsive

## 8. Test All Existing Features

**Dependencies:** 1, 3, 5, 6

Comprehensive testing of all existing functionality.

**Steps:**
1. Test voice recording (tap avatar)
2. Test text input and send
3. Test message display (bot and user)
4. Test audio playback
5. Test score updates
6. Test lesson navigation
7. Test session end
8. Test all animations (blink, wings, etc.)
9. Test on mobile device
10. Test on tablet
11. Test on desktop

**Files:** `fe/features/kid-bot/components/KidBotPractice.tsx`

**Acceptance Criteria:**
- All features work as before
- No console errors
- No visual glitches
- Performance is acceptable

## 9. Polish and Fine-tune

**Dependencies:** 8

Final polish and adjustments based on testing.

**Steps:**
1. Adjust transition timings if needed
2. Fine-tune spacing and alignment
3. Adjust colors/shadows if needed
4. Optimize performance if needed
5. Add any missing animations
6. Final comparison with reference design

**Files:** `fe/features/kid-bot/components/KidBotPractice.tsx`

**Acceptance Criteria:**
- UI matches reference design closely
- All transitions are smooth
- No performance issues
- Code is clean and maintainable
