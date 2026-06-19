# KidBot UI Redesign - Testing Guide

## Quick Start

1. **Start the development server:**
   ```bash
   cd fe
   npm run dev
   ```

2. **Navigate to KidBot Practice:**
   - Go to http://localhost:3000
   - Login if needed
   - Navigate to Topics → Select a topic → Start practice

3. **Observe the UI changes:**
   - Initial state: Large avatar, name badge, lesson label, target sentence visible
   - After first interaction: Avatar shrinks, name badge/lesson/target hide, chat expands

---

## Test Cases

### Test 1: Initial State (Before Chat Starts)
**Expected:**
- ✅ Large avatar (160px × 184px)
- ✅ Name badge visible with emoji, name, and tagline
- ✅ Status chip visible (normal size)
- ✅ Lesson label visible
- ✅ Target sentence visible
- ✅ Chat container height: 300px
- ✅ No bot switcher button in header

**How to Test:**
1. Load the page
2. Verify all elements are visible
3. Verify bot switcher button is NOT present

---

### Test 2: Chat Started State (After First Message)
**Expected:**
- ✅ Small avatar (90px × 104px)
- ✅ Name badge hidden
- ✅ Status chip smaller (6px indicator, 10px font)
- ✅ Lesson label hidden
- ✅ Target sentence hidden
- ✅ Chat container height: 450px
- ✅ Smooth transition (400ms)

**How to Test:**
1. Tap the avatar to start recording
2. Speak something and stop recording
3. Wait for bot response
4. Observe the transition

**Alternative:**
1. Type a message in the text input
2. Click send
3. Observe the transition

---

### Test 3: Avatar Size Transition
**Expected:**
- ✅ Smooth animation (no jank)
- ✅ Duration: ~400ms
- ✅ Easing: cubic-bezier(0.4, 0, 0.2, 1)
- ✅ No layout shift
- ✅ All decorative elements (rings, glow) scale proportionally

**How to Test:**
1. Record the screen while triggering the transition
2. Play back in slow motion
3. Verify smoothness and timing

---

### Test 4: Voice Recording
**Expected:**
- ✅ Tap avatar to start recording
- ✅ Red pulse ring appears
- ✅ Status chip shows "Đang ghi âm..."
- ✅ Tap again to stop
- ✅ Processing state shows spinner
- ✅ Bot response appears
- ✅ Score updates

**How to Test:**
1. Tap avatar
2. Speak for 2-3 seconds
3. Tap avatar again
4. Wait for response
5. Verify score updates

---

### Test 5: Text Input
**Expected:**
- ✅ Type message in input field
- ✅ Send button activates when text present
- ✅ Message appears in chat
- ✅ Bot responds
- ✅ Chat scrolls to bottom

**How to Test:**
1. Type "Hello" in input
2. Click send button (or press Enter)
3. Verify message appears
4. Verify bot responds

---

### Test 6: Chat Container Expansion
**Expected:**
- ✅ Initial max-height: 300px
- ✅ After chat starts: 450px
- ✅ Smooth transition
- ✅ Scroll works correctly
- ✅ Input field stays at bottom

**How to Test:**
1. Send multiple messages (5-10)
2. Verify chat scrolls
3. Verify input field remains at bottom
4. Verify no overflow issues

---

### Test 7: Score Display
**Expected:**
- ✅ Score ring updates after each attempt
- ✅ Score color changes based on value:
  - Green (#4ade80) for 80+
  - Yellow (#fbbf24) for 50-79
  - Red (#f87171) for <50
- ✅ Emoji changes based on score
- ✅ Attempt count increments

**How to Test:**
1. Record audio multiple times
2. Verify score updates
3. Verify colors change appropriately

---

### Test 8: Lesson Navigation
**Expected:**
- ✅ "Câu tiếp theo" button works
- ✅ Lesson progress bar updates
- ✅ New lesson loads
- ✅ Chat history preserved
- ✅ Avatar remains in correct state

**How to Test:**
1. Complete a lesson (score 50+)
2. Click "Câu tiếp theo"
3. Verify new lesson loads
4. Verify progress bar updates

---

### Test 9: Session End
**Expected:**
- ✅ "Kết thúc buổi học" button works
- ✅ Summary card appears
- ✅ Stats display correctly:
  - Mouth count today
  - Progress percentage
  - Completed lessons
  - Streak days
- ✅ Redirects to streak counter

**How to Test:**
1. Complete at least one attempt
2. Click "Kết thúc buổi học"
3. Verify summary appears
4. Verify redirect works

---

### Test 10: Animations
**Expected:**
- ✅ Avatar blinks periodically
- ✅ Wings flap (Owl) or buzz (Bee)
- ✅ Bobbing animation when speaking
- ✅ Message pop animation
- ✅ Star pulse animation
- ✅ Record pulse animation

**How to Test:**
1. Watch avatar for 10 seconds
2. Verify blink occurs
3. Verify wing/buzz animation
4. Record audio and verify bobbing
5. Send message and verify pop animation

---

### Test 11: Responsive Design

#### Mobile (320px - 767px)
**Expected:**
- ✅ Layout adapts to small screen
- ✅ Avatar scales appropriately
- ✅ Chat bubbles fit within screen
- ✅ Input field accessible
- ✅ All buttons tappable

**How to Test:**
1. Open DevTools
2. Set viewport to 375px × 667px (iPhone SE)
3. Test all features
4. Verify no horizontal scroll

#### Tablet (768px - 1023px)
**Expected:**
- ✅ Layout uses available space
- ✅ Chat bubbles centered
- ✅ All elements visible

**How to Test:**
1. Set viewport to 768px × 1024px (iPad)
2. Test all features

#### Desktop (1024px+)
**Expected:**
- ✅ Layout centered
- ✅ Max width constraints applied
- ✅ All elements properly spaced

**How to Test:**
1. Set viewport to 1920px × 1080px
2. Test all features

---

### Test 12: Error Handling
**Expected:**
- ✅ Microphone permission denied: Shows error message
- ✅ Short audio (<1s): Shows warning
- ✅ Network error: Shows error message
- ✅ API error: Shows error message

**How to Test:**
1. Deny microphone permission
2. Verify error message appears
3. Record very short audio (<1s)
4. Verify warning appears

---

### Test 13: Performance
**Expected:**
- ✅ Avatar transition: 60fps
- ✅ Chat scroll: Smooth
- ✅ Message render: <50ms
- ✅ No memory leaks
- ✅ No console errors

**How to Test:**
1. Open DevTools Performance tab
2. Record while triggering transitions
3. Analyze frame rate
4. Check for dropped frames
5. Check console for errors

---

### Test 14: Accessibility
**Expected:**
- ✅ Avatar focusable via keyboard
- ✅ Tab order logical
- ✅ Focus rings visible
- ✅ Color contrast meets WCAG AA
- ✅ Screen reader announces state changes

**How to Test:**
1. Navigate using Tab key
2. Verify focus order
3. Use screen reader (NVDA/JAWS)
4. Verify announcements

---

## Browser Compatibility

Test on:
- ✅ Chrome (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Edge (latest)
- ✅ iOS Safari
- ✅ Android Chrome

---

## Known Issues

None currently identified.

---

## Regression Tests

Verify these existing features still work:

1. ✅ Voice recording
2. ✅ Text input
3. ✅ Audio playback
4. ✅ Score calculation
5. ✅ Lesson progression
6. ✅ Session completion
7. ✅ Streak tracking
8. ✅ Quick suggestions
9. ✅ Voice selector
10. ✅ Progress bar

---

## Performance Benchmarks

Target metrics:
- Avatar transition: <500ms
- Message render: <50ms
- Chat scroll: 60fps
- Total layout shift: <0.1 CLS
- First contentful paint: <1.5s

---

## Testing Tools

- **Browser DevTools:** Performance, Network, Console
- **React DevTools:** Component inspection
- **Lighthouse:** Performance audit
- **Screen Reader:** NVDA (Windows), VoiceOver (Mac/iOS)
- **Device Testing:** BrowserStack or real devices

---

## Reporting Issues

When reporting issues, include:
1. Browser and version
2. Device and screen size
3. Steps to reproduce
4. Expected vs actual behavior
5. Screenshots/video if applicable
6. Console errors if any

---

## Sign-off Checklist

Before marking as complete:

- [ ] All test cases pass
- [ ] No console errors
- [ ] No TypeScript errors
- [ ] Performance targets met
- [ ] Responsive design verified
- [ ] Accessibility verified
- [ ] Browser compatibility verified
- [ ] User acceptance testing complete

---

## Next Steps After Testing

1. Document any issues found
2. Prioritize fixes
3. Implement fixes
4. Re-test
5. Get user feedback
6. Iterate as needed

---

## Contact

For questions or issues, contact the development team.

**Last Updated:** January 2025
