// Shared API-error formatter. Was copy-pasted byte-identically into App.tsx, AuthModal.tsx,
// and ParentGateModal.tsx (notes.md 3.C.22). The backend error envelope is either a
// pydantic validation payload ({issues: [{loc, msg}]}) or a plain {message}; this turns
// either into a human string, falling back to the caller's default.
export function formatApiError(payload: any, fallback: string, isEnglish: boolean): string {
  const issues = Array.isArray(payload?.issues) ? payload.issues : [];
  if (issues.length > 0) {
    const details = issues
      .map((issue: any) => {
        const location = Array.isArray(issue?.loc) ? issue.loc.filter(Boolean).join('.') : '';
        const message = typeof issue?.msg === 'string' ? issue.msg : '';
        return location ? `${location}: ${message}` : message;
      })
      .filter(Boolean)
      .join(' | ');

    if (details) {
      return isEnglish ? `Validation failed: ${details}` : `Dữ liệu chưa hợp lệ: ${details}`;
    }
  }

  if (typeof payload?.message === 'string' && payload.message.trim()) {
    return payload.message;
  }

  return fallback;
}
