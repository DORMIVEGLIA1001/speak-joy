# API Key Flow (FE + BE)

![API Key Flow](./api-key-flow.png)

## 1) Save API key flow

```mermaid
sequenceDiagram
  autonumber
  participant U as User (Browser)
  participant FE as Frontend (Next.js)
  participant BE as Backend (FastAPI)
  participant KMS as KMS / Secret Manager
  participant DB as Database

  U->>FE: Enter API key over HTTPS
  FE->>BE: POST key + access token
  BE->>BE: Verify token + ownership
  BE->>KMS: Encrypt key / create secret ref
  KMS-->>BE: Ciphertext / secretRef
  BE->>DB: Store ciphertext + metadata
  DB-->>BE: OK
  BE-->>FE: Return apiKeyMasked only
  FE-->>U: Show "saved" status
```

## 2) Runtime usage flow

```mermaid
sequenceDiagram
  autonumber
  participant U as User
  participant FE as Frontend
  participant BE as Backend
  participant KMS as KMS / Secret Manager
  participant DB as Database
  participant AI as AI Provider

  U->>FE: Start practice / TTS
  FE->>BE: Request with access token
  BE->>BE: Verify token + resolve owner/child
  BE->>DB: Load ciphertext / secretRef
  DB-->>BE: Ciphertext / secretRef
  BE->>KMS: Decrypt in memory
  KMS-->>BE: Plain key (temporary)
  BE->>AI: Call provider with key
  AI-->>BE: AI result
  BE-->>FE: Return result (no key)
  FE-->>U: Render output
```

## Security notes

- Do not store plaintext key in frontend.
- Do not return raw key to client.
- Redact key values in logs/monitoring.
- Rotate/revoke keys and apply rate limits.
