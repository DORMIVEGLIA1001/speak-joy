# Requirements Document

## Introduction

This feature enhances the SpeakJoy call preparation page (the idle state before a call starts) by adding two new informational sections flanking the central character and call button. A Tips/Notes panel appears on the left side providing helpful guidance to the child or parent, and a Conversation History panel appears on the right side showing previous call sessions grouped by date. The layout becomes a three-column arrangement: Tips (left) | Character + Call button (center) | History (right).

## Glossary

- **Call_Prep_Page**: The SpeakJoy page in its idle state before a call is initiated, displaying the Joy character and the call button
- **Tips_Panel**: A floating card-based panel on the left side of the character that displays helpful notes and tips for the user
- **History_Panel**: A scrollable panel on the right side of the character that displays a list of previous conversation sessions grouped by date
- **Tip_Card**: An individual dismissible card within the Tips_Panel containing a single tip or note
- **Session_Entry**: A single row in the History_Panel representing one completed or abandoned call session
- **Date_Group**: A labeled section within the History_Panel that groups Session_Entries by their calendar date (e.g., "Hôm nay", "Hôm qua")
- **Backend_API**: The existing FastAPI backend that serves session data via the /api/sessions endpoint

## Requirements

### Requirement 1: Three-Column Layout for Call Prep Page

**User Story:** As a user viewing the call preparation page, I want to see tips on the left and history on the right alongside the central character, so that I have useful context before starting a call.

#### Acceptance Criteria

1. WHILE the Call_Prep_Page is in idle state, THE Call_Prep_Page SHALL display a three-column layout with the Tips_Panel on the left, the character and call button in the center, and the History_Panel on the right
2. WHEN the viewport width is less than 1024 pixels, THE Call_Prep_Page SHALL stack the Tips_Panel above the character and the History_Panel below the character in a single-column layout
3. WHEN a call becomes active, THE Call_Prep_Page SHALL hide both the Tips_Panel and the History_Panel and display the call interface
4. THE Call_Prep_Page SHALL preserve the existing character animation, call button, speaker selector, and header without modification

### Requirement 2: Tips/Notes Panel Display

**User Story:** As a child or parent, I want to see helpful tips before starting a call, so that I can prepare for a better conversation experience.

#### Acceptance Criteria

1. WHILE the Call_Prep_Page is in idle state, THE Tips_Panel SHALL display a vertical list of Tip_Cards on the left side of the character
2. THE Tips_Panel SHALL display tips as floating cards with readable text on a semi-transparent background consistent with the existing page design
3. THE Tips_Panel SHALL display at least the following default tips: a tip about ensuring a quiet space for conversation quality, and a tip noting that the feature is experimental
4. WHEN the Tips_Panel contains more tips than fit in the visible area, THE Tips_Panel SHALL allow vertical scrolling to reveal additional tips

### Requirement 3: Tip Card Dismissal

**User Story:** As a user, I want to dismiss tips I have already read, so that the interface remains uncluttered.

#### Acceptance Criteria

1. THE Tip_Card SHALL display a close button (X icon) in the top-right corner of each card
2. WHEN the user clicks the close button on a Tip_Card, THE Tips_Panel SHALL remove that Tip_Card from the display with a fade-out animation
3. WHEN all Tip_Cards have been dismissed, THE Tips_Panel SHALL display an empty state or collapse gracefully without leaving blank space

### Requirement 4: Conversation History Panel Display

**User Story:** As a parent or child, I want to see my previous conversation sessions before starting a new call, so that I can track my learning progress.

#### Acceptance Criteria

1. WHILE the Call_Prep_Page is in idle state, THE History_Panel SHALL display a scrollable list of previous Session_Entries on the right side of the character
2. THE History_Panel SHALL display the title "LỊCH SỬ CUỘC TRÒ CHUYỆN" at the top of the panel
3. THE History_Panel SHALL group Session_Entries by Date_Group using relative labels such as "Hôm nay" for today and "Hôm qua" for yesterday
4. WHEN the History_Panel contains more entries than fit in the visible area, THE History_Panel SHALL allow vertical scrolling to reveal additional entries

### Requirement 5: Session Entry Information

**User Story:** As a user, I want to see key details about each past session, so that I can understand my conversation history at a glance.

#### Acceptance Criteria

1. THE Session_Entry SHALL display the timestamp of when the session occurred
2. THE Session_Entry SHALL display the number of messages exchanged during the session (derived from the turnCount field)
3. THE Session_Entry SHALL display the duration of the call session (computed from startedAt and endedAt)
4. IF a session has no endedAt value, THEN THE Session_Entry SHALL display a status indicator showing the session was not completed

### Requirement 6: History Data Fetching

**User Story:** As a developer, I want the history panel to fetch session data from the existing backend API, so that the feature integrates with the current data infrastructure.

#### Acceptance Criteria

1. WHEN the Call_Prep_Page loads, THE History_Panel SHALL fetch session data from the Backend_API /api/sessions endpoint using the current user authentication token
2. IF the Backend_API returns an error or is unreachable, THEN THE History_Panel SHALL display an empty state message without blocking the rest of the page
3. IF the user has no previous sessions, THEN THE History_Panel SHALL display a message indicating no conversation history exists
4. WHEN session data is being fetched, THE History_Panel SHALL display a loading indicator

### Requirement 7: Visual Consistency and Animation

**User Story:** As a user, I want the new panels to feel visually integrated with the existing page design, so that the experience feels cohesive.

#### Acceptance Criteria

1. THE Tips_Panel SHALL use semi-transparent backgrounds with backdrop blur consistent with the existing Call_Prep_Page styling (bg-black/20 or bg-white/14 patterns with backdrop-blur-md)
2. THE History_Panel SHALL use semi-transparent backgrounds with backdrop blur consistent with the existing Call_Prep_Page styling
3. WHEN the Call_Prep_Page first loads, THE Tips_Panel and History_Panel SHALL animate into view using Framer Motion with a fade-in and slide-in effect
4. THE Tips_Panel and History_Panel SHALL use border styling consistent with the existing purple/violet border theme (border-purple-700/40 or border-white/20 patterns)
