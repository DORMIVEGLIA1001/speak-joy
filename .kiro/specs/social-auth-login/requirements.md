# Requirements Document

## Introduction

Tính năng đăng nhập và đăng ký bằng tài khoản mạng xã hội (Google và Facebook) cho ứng dụng SpeakJoy. Tính năng này cho phép phụ huynh xác thực nhanh chóng thông qua OAuth 2.0 mà không cần tạo mật khẩu riêng, đồng thời tích hợp liền mạch với hệ thống xác thực hiện tại (email/password, JWT token, session cookie).

## Glossary

- **Social_Auth_System**: Hệ thống xác thực mạng xã hội, bao gồm backend FastAPI endpoints và frontend UI components xử lý luồng OAuth 2.0
- **OAuth_Provider**: Nhà cung cấp dịch vụ xác thực bên thứ ba (Google hoặc Facebook)
- **Auth_Backend**: Backend FastAPI service xử lý xác thực, tạo JWT token và quản lý session cookie
- **Auth_Frontend**: Frontend Next.js components hiển thị giao diện đăng nhập/đăng ký mạng xã hội
- **OAuth_Callback_Handler**: Module backend xử lý callback từ OAuth Provider sau khi người dùng cấp quyền
- **User_Repository**: Tầng truy cập dữ liệu quản lý thông tin người dùng trong Supabase database
- **Access_Token**: JWT token được tạo sau khi xác thực thành công, dùng để authorize các request tiếp theo
- **Provider_Profile**: Thông tin hồ sơ người dùng nhận được từ OAuth Provider (email, tên, avatar)
- **Account_Linking**: Quá trình liên kết tài khoản mạng xã hội với tài khoản SpeakJoy hiện có dựa trên email

## Requirements

### Requirement 1: Khởi tạo luồng OAuth

**User Story:** As a phụ huynh, I want to click a social login button to start the OAuth flow, so that I can authenticate without creating a separate password.

#### Acceptance Criteria

1. WHEN a user clicks the Google login button, THE Auth_Frontend SHALL redirect the user to the Google OAuth 2.0 authorization endpoint with the correct client_id, redirect_uri, scope, and state parameters
2. WHEN a user clicks the Facebook login button, THE Auth_Frontend SHALL redirect the user to the Facebook OAuth authorization endpoint with the correct client_id, redirect_uri, scope, and state parameters
3. THE Auth_Backend SHALL provide an endpoint that generates the OAuth authorization URL including a cryptographically random state parameter for CSRF protection
4. THE Social_Auth_System SHALL request the email and profile scopes from Google OAuth Provider
5. THE Social_Auth_System SHALL request the email and public_profile permissions from Facebook OAuth Provider

### Requirement 2: Xử lý OAuth Callback

**User Story:** As a phụ huynh, I want the system to securely process the OAuth callback, so that my identity is verified and I can access the application.

#### Acceptance Criteria

1. WHEN the OAuth Provider redirects back with an authorization code, THE OAuth_Callback_Handler SHALL exchange the authorization code for an access token using a server-side request
2. WHEN the OAuth Provider redirects back with an authorization code, THE OAuth_Callback_Handler SHALL validate the state parameter matches the original value to prevent CSRF attacks
3. IF the state parameter does not match the stored value, THEN THE OAuth_Callback_Handler SHALL reject the request and return an error response with status 403
4. IF the authorization code exchange fails, THEN THE OAuth_Callback_Handler SHALL return an error response with a descriptive message and status 401
5. WHEN the access token is obtained from the OAuth Provider, THE OAuth_Callback_Handler SHALL fetch the Provider_Profile using the provider-specific user info endpoint

### Requirement 3: Đăng ký tài khoản mới qua OAuth

**User Story:** As a phụ huynh mới, I want to register using my Google or Facebook account, so that I can quickly start using SpeakJoy without filling out a registration form.

#### Acceptance Criteria

1. WHEN a Provider_Profile is received and no existing user matches the provider email, THE User_Repository SHALL create a new user record with the email, display name from the provider, role set to "parent", and the OAuth provider identifier
2. WHEN a new user is created via OAuth, THE Auth_Backend SHALL generate an Access_Token with the same JWT structure as the existing email/password authentication (sub, email, role, iat, exp claims)
3. WHEN a new user is created via OAuth, THE Auth_Backend SHALL set the session cookie (speakjoy-session) with the same configuration as the existing authentication system
4. THE Social_Auth_System SHALL store the OAuth provider type and provider user ID in the user record for future login identification

### Requirement 4: Đăng nhập tài khoản hiện có qua OAuth

**User Story:** As a phụ huynh đã có tài khoản, I want to log in using my linked social account, so that I can access my existing data without remembering a password.

#### Acceptance Criteria

1. WHEN a Provider_Profile is received and an existing user matches the provider email, THE Auth_Backend SHALL authenticate the user and generate an Access_Token
2. WHEN a user logs in via OAuth, THE Auth_Backend SHALL update the last_login_at timestamp in the user record
3. WHEN a user logs in via OAuth, THE Auth_Backend SHALL set the session cookie with the same parameters as the existing login flow
4. IF the matched user account is inactive (is_active = false), THEN THE Auth_Backend SHALL reject the login and return an error with status 403

### Requirement 5: Account Linking (Liên kết tài khoản)

**User Story:** As a phụ huynh đã đăng ký bằng email, I want to link my Google or Facebook account, so that I can use either method to log in in the future.

#### Acceptance Criteria

1. WHEN a Provider_Profile email matches an existing user who registered via email/password, THE Social_Auth_System SHALL link the OAuth provider to the existing account automatically
2. WHEN an account is linked, THE User_Repository SHALL store the provider type and provider user ID alongside the existing user record
3. WHILE a user has both email/password and OAuth provider linked, THE Auth_Backend SHALL allow login via either method
4. IF a Provider_Profile email matches an existing user already linked to a different account of the same provider, THEN THE Social_Auth_System SHALL reject the linking and return an error with status 409

### Requirement 6: Giao diện đăng nhập mạng xã hội

**User Story:** As a phụ huynh, I want to see social login buttons on the login page, so that I can choose my preferred authentication method.

#### Acceptance Criteria

1. THE Auth_Frontend SHALL display a Google login button with the official Google brand icon on the AuthDrawer component
2. THE Auth_Frontend SHALL display a Facebook login button with the official Facebook brand icon on the AuthDrawer component
3. THE Auth_Frontend SHALL display social login buttons in both login and register modes of the AuthDrawer
4. THE Auth_Frontend SHALL display a visual separator between social login buttons and the email/password form
5. WHILE the OAuth flow is in progress, THE Auth_Frontend SHALL display a loading state on the clicked social button and disable all authentication actions
6. IF the OAuth flow returns an error, THEN THE Auth_Frontend SHALL display the error message in the same status area used by the existing authentication form

### Requirement 7: Bảo mật OAuth

**User Story:** As a system administrator, I want the OAuth implementation to follow security best practices, so that user accounts are protected from unauthorized access.

#### Acceptance Criteria

1. THE Auth_Backend SHALL store OAuth client secrets in environment variables and never expose them to the frontend
2. THE Auth_Backend SHALL perform the authorization code exchange server-side to prevent token interception
3. THE Social_Auth_System SHALL use a cryptographically random state parameter with a minimum length of 32 characters for each OAuth flow
4. THE Social_Auth_System SHALL expire the state parameter within 10 minutes of generation
5. THE Auth_Backend SHALL validate that the redirect_uri in the callback matches the configured allowed redirect URIs
6. IF the OAuth Provider returns an email that is not verified, THEN THE Auth_Backend SHALL reject the authentication and return an error with status 401

### Requirement 8: Cấu hình OAuth Provider

**User Story:** As a developer, I want to configure OAuth providers through environment variables, so that I can manage credentials across different environments.

#### Acceptance Criteria

1. THE Auth_Backend SHALL read Google OAuth credentials (client_id, client_secret) from environment variables GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
2. THE Auth_Backend SHALL read Facebook OAuth credentials (client_id, client_secret) from environment variables FACEBOOK_CLIENT_ID and FACEBOOK_CLIENT_SECRET
3. THE Auth_Backend SHALL read the OAuth redirect base URL from environment variable OAUTH_REDIRECT_BASE_URL
4. IF a required OAuth provider credential is missing, THEN THE Auth_Backend SHALL disable that provider and log a warning at startup
5. WHEN a provider is disabled due to missing credentials, THE Auth_Frontend SHALL hide the corresponding social login button
