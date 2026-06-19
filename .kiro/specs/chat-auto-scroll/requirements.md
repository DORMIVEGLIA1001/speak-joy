# Requirements Document

## Introduction

Cải thiện trải nghiệm cuộn (scroll) trong giao diện trò chuyện thời gian thực của SpeakJoy. Hiện tại, khu vực chat hiển thị một thanh cuộn (scrollbar) lớn màu tím gây mất thẩm mỹ. Tính năng này sẽ ẩn thanh cuộn mặc định, tự động cuộn xuống tin nhắn mới nhất khi có tin nhắn mới, và cho phép người dùng lướt lên xem lại lịch sử hội thoại sau khi AI nói xong.

## Glossary

- **Chat_Container**: Phần tử DOM chứa danh sách tin nhắn trong giao diện trò chuyện thời gian thực của SpeakJoy
- **Auto_Scroll**: Hành vi tự động cuộn Chat_Container xuống tin nhắn mới nhất khi có tin nhắn mới được thêm vào
- **Manual_Scroll**: Hành vi người dùng chủ động lướt lên trên để xem lại các tin nhắn trước đó
- **Scroll_Lock**: Trạng thái tạm dừng Auto_Scroll khi người dùng đang ở chế độ Manual_Scroll
- **Native_Scrollbar**: Thanh cuộn mặc định của trình duyệt hiển thị trên Chat_Container

## Requirements

### Requirement 1: Ẩn thanh cuộn mặc định

**User Story:** As a learner, I want the ugly default scrollbar to be hidden, so that the chat interface looks clean and immersive.

#### Acceptance Criteria

1. THE Chat_Container SHALL hide the Native_Scrollbar visually using CSS while maintaining scroll functionality
2. THE Chat_Container SHALL remain scrollable via touch gestures on mobile devices and mouse wheel on desktop despite the hidden Native_Scrollbar
3. THE Chat_Container SHALL apply scrollbar hiding consistently across Chrome, Firefox, Safari, and Edge browsers

### Requirement 2: Tự động cuộn khi có tin nhắn mới

**User Story:** As a learner, I want the chat to automatically scroll to the latest message when new messages arrive, so that I always see the most recent conversation without manual scrolling.

#### Acceptance Criteria

1. WHEN a new message is added to the conversation, THE Chat_Container SHALL scroll smoothly to display the latest message at the bottom of the visible area
2. WHEN the AI sends a streaming response (partial text updates), THE Chat_Container SHALL continue scrolling to keep the latest content visible
3. WHEN multiple messages arrive in rapid succession, THE Chat_Container SHALL scroll to the final message position without jittering or intermediate scroll jumps

### Requirement 3: Cho phép lướt lên xem lại hội thoại

**User Story:** As a learner, I want to scroll up to review past conversation messages after the AI finishes speaking, so that I can re-read what was said earlier.

#### Acceptance Criteria

1. WHILE the user is performing Manual_Scroll (scrolled away from the bottom), THE Chat_Container SHALL enter Scroll_Lock state and pause Auto_Scroll behavior
2. WHEN the user scrolls back to the bottom of the Chat_Container, THE Chat_Container SHALL exit Scroll_Lock state and resume Auto_Scroll behavior
3. THE Chat_Container SHALL detect the user is near the bottom (within 100 pixels of the maximum scroll position) to determine whether Auto_Scroll should be active

### Requirement 4: Trải nghiệm cuộn mượt mà

**User Story:** As a learner, I want smooth scrolling animations, so that the chat feels polished and natural.

#### Acceptance Criteria

1. THE Chat_Container SHALL use smooth scroll behavior (CSS scroll-behavior or programmatic smooth scrolling) for all Auto_Scroll actions
2. WHEN the Chat_Container transitions from Scroll_Lock to Auto_Scroll, THE Chat_Container SHALL animate the scroll to the bottom smoothly within 300 milliseconds
3. IF the browser does not support smooth scrolling, THEN THE Chat_Container SHALL fall back to instant scroll to ensure the latest message is always visible
