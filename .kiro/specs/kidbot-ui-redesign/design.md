# Design: KidBot Practice UI Redesign

## Design Overview

This document describes the visual and interaction design for the redesigned KidBot Practice interface, focusing on a cleaner, more centered chat experience.

---

## Visual Design

### Layout Structure

```
┌─────────────────────────────────────────┐
│ Header (Compact)                        │
│ - Logo + Title (left)                   │
│ - Voice selector + Progress (below)     │
├─────────────────────────────────────────┤
│                                         │
│         [Bot Avatar - Large]            │  ← Initial state
│         [Name Badge]                    │
│         [Status Chip]                   │
│         [Lesson Label]                  │
│         [Target Sentence]               │
│                                         │
│                                         │
│                                         │
│                                         │
├─────────────────────────────────────────┤
│ [Score Card]                            │
│ [Text Input]                            │
│ [Bottom Controls]                       │
└─────────────────────────────────────────┘

After chat starts:

┌─────────────────────────────────────────┐
│ Header (Compact)                        │
├─────────────────────────────────────────┤
│     [Bot Avatar - Small]                │  ← Shrunk & moved up
│     [Status Chip - Small]               │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Bot: Hi! Let's practice...      │   │
│  └─────────────────────────────────┘   │
│                                         │
│              ┌──────────────────────┐   │
│              │ User: Hello!         │   │
│              └──────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Bot: Great! What's your...      │   │
│  └─────────────────────────────────┘   │
│                                         │
├─────────────────────────────────────────┤
│ [Score Card]                            │
│ [Text Input]                            │
│ [Bottom Controls]                       │
└─────────────────────────────────────────┘
```

---

## Component Specifications

### 1. Header (Simplified)

**Before:**
```
┌──────────────────────────────────────────┐
│ KidBot ✨              [Switch Bot 🐝]   │
│ Bấm logo để nói 🎙️                      │
│ 🎤 Giọng: [Ryan ▼]                      │
│ Progress: ████░░░░░░ 4/10               │
└──────────────────────────────────────────┘
```

**After:**
```
┌──────────────────────────────────────────┐
│ KidBot ✨                                │
│ Bấm logo để nói 🎙️                      │
│ 🎤 Giọng: [Ryan ▼]                      │
│ Progress: ████░░░░░░ 4/10               │
└──────────────────────────────────────────┘
```

**Changes:**
- Remove "Switch Bot" button
- Keep logo, title, voice selector, progress bar
- Maintain compact layout

---

### 2. Bot Avatar (Dynamic)

**Large State (Initial):**
- **Size:** 160px × 184px
- **Position:** Center-top of screen
- **Margin:** 20px from top
- **Transition:** All properties 400ms ease-in-out

**Small State (Chat Active):**
- **Size:** 90px × 104px (56% of original)
- **Position:** Center-top, closer to header
- **Margin:** 10px from top
- **Transition:** All properties 400ms ease-in-out

**Trigger:**
- Shrink when `messages.length > 2` (excluding initial greeting)
- Expand when messages cleared (optional)

**CSS Implementation:**
```css
.avatar-container {
  width: var(--avatar-width);
  height: var(--avatar-height);
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  margin-top: var(--avatar-margin-top);
}

/* Large state */
--avatar-width: 160px;
--avatar-height: 184px;
--avatar-margin-top: 20px;

/* Small state */
--avatar-width: 90px;
--avatar-height: 104px;
--avatar-margin-top: 10px;
```

---

### 3. Name Badge (Dynamic)

**Large State:**
- **Display:** Visible
- **Padding:** 6px 18px
- **Font Size:** 20px (name), 11px (tagline)
- **Opacity:** 1

**Small State:**
- **Display:** Hidden or very compact
- **Option 1:** Hide completely
- **Option 2:** Show only emoji (22px)
- **Transition:** Opacity 300ms, transform 300ms

**Recommended:** Hide completely when small to save space.

---

### 4. Status Chip (Dynamic)

**Large State:**
- **Padding:** 6px 16px
- **Font Size:** 13px
- **Indicator:** 10px circle
- **Opacity:** 1

**Small State:**
- **Padding:** 4px 10px
- **Font Size:** 10px
- **Indicator:** 6px circle
- **Opacity:** 0.9
- **Transition:** All 300ms ease

---

### 5. Chat Container (Expanded)

**Large Avatar State:**
- **Max Height:** 300px
- **Flex:** 1
- **Overflow:** auto

**Small Avatar State:**
- **Max Height:** 450px (or calc based on viewport)
- **Flex:** 1
- **Overflow:** auto
- **Transition:** Max-height 400ms ease

**Formula:**
```
maxHeight = viewportHeight 
          - headerHeight 
          - smallAvatarHeight 
          - scoreCardHeight 
          - inputHeight 
          - bottomControlsHeight 
          - margins
```

---

### 6. Chat Bubbles (Centered)

**Bot Bubble:**
- **Alignment:** flex-start (left-aligned)
- **Max Width:** 72% of container
- **Margin:** 0 auto (centered container)
- **Background:** cfg.bubbleBg
- **Border Radius:** 6px 20px 20px 20px

**User Bubble:**
- **Alignment:** flex-end (right-aligned)
- **Max Width:** 72% of container
- **Margin:** 0 auto (centered container)
- **Background:** cfg.userBubble (gradient)
- **Border Radius:** 20px 6px 20px 20px

**Container:**
```css
.chat-messages-container {
  display: flex;
  flex-direction: column;
  align-items: center; /* Center all messages */
  gap: 10px;
  padding: 0 16px;
}

.message-row {
  display: flex;
  width: 100%;
  max-width: 600px; /* Limit width on large screens */
  justify-content: flex-start; /* or flex-end for user */
}
```

---

## Animation Specifications

### Avatar Size Transition

**Timing Function:** cubic-bezier(0.4, 0, 0.2, 1) (ease-in-out)  
**Duration:** 400ms  
**Properties:** width, height, margin-top

**Keyframes:**
```css
@keyframes avatarShrink {
  from {
    width: 160px;
    height: 184px;
    margin-top: 20px;
  }
  to {
    width: 90px;
    height: 104px;
    margin-top: 10px;
  }
}
```

### Name Badge Fade Out

**Timing Function:** ease-out  
**Duration:** 300ms  
**Properties:** opacity, transform

```css
@keyframes badgeFadeOut {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.8);
  }
}
```

### Chat Container Expand

**Timing Function:** ease  
**Duration:** 400ms  
**Properties:** max-height

```css
@keyframes chatExpand {
  from {
    max-height: 300px;
  }
  to {
    max-height: 450px;
  }
}
```

---

## Responsive Breakpoints

### Mobile (320px - 767px)

**Avatar Large:** 140px × 161px  
**Avatar Small:** 80px × 92px  
**Chat Max Width:** 90%  
**Chat Max Height (small avatar):** calc(100vh - 400px)

### Tablet (768px - 1023px)

**Avatar Large:** 160px × 184px  
**Avatar Small:** 90px × 104px  
**Chat Max Width:** 80%  
**Chat Max Height (small avatar):** 450px

### Desktop (1024px+)

**Avatar Large:** 160px × 184px  
**Avatar Small:** 90px × 104px  
**Chat Max Width:** 600px  
**Chat Max Height (small avatar):** 500px

---

## Color Scheme (Unchanged)

**Owl (Hoot):**
- Primary: #a78bfa (purple)
- Background: Gradient from #0f0528 to #2d1b69
- Accent: #c4b5fd

**Bee (Buzzy):**
- Primary: #fbbf24 (yellow)
- Background: Gradient from #1a0e00 to #78350f
- Accent: #fde68a

---

## Interaction States

### Avatar Click (Recording)

**Visual Feedback:**
1. Red pulse ring appears
2. Status chip shows "Đang ghi âm..."
3. Avatar continues normal animations (blink, wings)
4. Click again to stop

**No change from current implementation.**

### Message Send

**Visual Feedback:**
1. User bubble appears with pop animation
2. Bot typing indicator appears
3. Bot bubble appears with pop animation
4. Chat scrolls to bottom

**No change from current implementation.**

---

## Accessibility Considerations

### Focus Management

- Avatar remains focusable when small
- Tab order: Header controls → Avatar → Chat messages → Input → Bottom buttons
- Focus ring visible on all interactive elements

### Screen Reader

- Announce avatar size change: "Chat started, avatar minimized"
- Announce new messages: "Bot says: [message text]"
- Announce recording state: "Recording started" / "Recording stopped"

### Color Contrast

- All text meets WCAG AA standards (4.5:1 for normal text)
- Status indicators have sufficient contrast
- Focus rings are visible against all backgrounds

---

## Performance Targets

- **Avatar transition:** 60fps, no jank
- **Chat scroll:** Smooth, no lag
- **Message render:** <50ms per message
- **Total layout shift:** <0.1 CLS

---

## Design Rationale

### Why Remove Bot Switcher?

1. **Simplicity:** Reduces cognitive load for children
2. **Focus:** Keeps attention on conversation
3. **Space:** Frees up header space
4. **Usage:** Most users don't switch bots frequently

### Why Shrink Avatar?

1. **Space:** Maximizes chat area
2. **Context:** Avatar still visible for identity
3. **Smooth:** Transition feels natural, not jarring
4. **Modern:** Matches chat app conventions

### Why Center Chat?

1. **Focus:** Draws attention to conversation
2. **Balance:** Symmetrical layout is pleasing
3. **Readability:** Centered text is easier to scan
4. **Reference:** Matches provided design (image 2)

---

## Open Design Questions

1. **Name badge visibility:** Hide completely or show emoji only when small?
   - **Recommendation:** Hide completely for maximum space

2. **Status chip size:** Keep visible or hide when small?
   - **Recommendation:** Keep visible but smaller (important feedback)

3. **Lesson label:** Keep visible or hide when chat active?
   - **Recommendation:** Hide when chat active (not needed during conversation)

4. **Target sentence:** Keep visible or hide when chat active?
   - **Recommendation:** Hide when chat active (user already knows the target)

5. **Tokens counter:** Keep in same position or move?
   - **Recommendation:** Keep in same position (top-right)

---

## Design Assets

### Reference Images

- **Image 1:** Current state (before redesign)
- **Image 2:** Target state (after redesign) ← Primary reference

### Figma/Sketch Files

- Not applicable (design based on provided images)

---

## Implementation Notes

### CSS Variables Approach

Use CSS variables for easy theming and state management:

```css
:root {
  --avatar-size-large: 160px;
  --avatar-size-small: 90px;
  --chat-height-large: 300px;
  --chat-height-small: 450px;
  --transition-duration: 400ms;
  --transition-timing: cubic-bezier(0.4, 0, 0.2, 1);
}
```

### React State Management

```typescript
const hasChatStarted = useMemo(() => {
  // Exclude initial greeting messages (first 2)
  return messages.length > 2;
}, [messages]);

const avatarSize = hasChatStarted ? 'small' : 'large';
const chatMaxHeight = hasChatStarted ? 450 : 300;
```

### Conditional Rendering

```typescript
{!hasChatStarted && (
  <>
    <NameBadge />
    <LessonLabel />
    <TargetSentence />
  </>
)}

{hasChatStarted && (
  <CompactStatusChip />
)}
```

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-XX | AI Assistant | Initial design document |
