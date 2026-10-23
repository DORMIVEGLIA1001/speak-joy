import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * Hồ sơ một bé. Giữ permissive để mọi consumer (App, ProfileTab, HomePage,
 * Sidebar) có thể import và dùng chung một định nghĩa. `avatarUrl` là trường
 * tùy chọn được thêm cho tính năng ảnh đại diện.
 */
export type ChildProfile = {
  id: string;
  parentId: string;
  name: string;
  age: number;
  level: string;
  status: string;
  sessionsCompleted: number;
  latestScore: number;
  topicsCompleted: number;
  streakDays: number;
  weeklyGoal: number;
  weeklyCompleted: number;
  totalMinutes: number;
  badgesEarned: number;
  attendanceRate: number;
  lastSessionAt: string;
  learningGoal: string;
  nextFocus: string;
  avatarUrl?: string | null;
  experiencePoints?: number;
  mouthCountTotal?: number;
  lastSessionMouthCount?: number;
  lastSessionEarnedXp?: number;
};

export type ActiveChildContextValue = {
  /** Id của bé đang được chọn để học, hoặc null nếu chưa chọn. */
  activeChildId: string | null;
  /** Bé đang chọn (suy ra từ `activeChildId` + `children`). */
  activeChild: ChildProfile | null;
  /** Danh sách bé của phụ huynh. */
  children: ChildProfile[];
  /** Chọn bé đang học; lưu xuống backend rồi cập nhật state cục bộ. */
  setActiveChild: (id: string | null) => Promise<void>;
  /** Tải lại danh sách bé từ backend. */
  refreshChildren: () => Promise<void>;
  /**
   * Nạp danh sách bé từ bên ngoài (ví dụ App.tsx đã fetch rồi) để tránh
   * double-fetch. Context sẽ dùng dữ liệu này thay vì tự gọi API.
   */
  seedChildren: (list: ChildProfile[], preferredId?: string | null) => void;
  /** Đang nạp dữ liệu khôi phục lần đầu. */
  isLoading: boolean;
};

const ActiveChildContext = createContext<ActiveChildContextValue | null>(null);

const extractChildren = (payload: unknown): ChildProfile[] => {
  const data = payload as
    | { children?: ChildProfile[]; data?: { children?: ChildProfile[] } }
    | null
    | undefined;
  return (data?.children || data?.data?.children || []) as ChildProfile[];
};

const extractActiveChildId = (payload: unknown): string | null => {
  const data = payload as
    | { activeChildId?: string | null; data?: { activeChildId?: string | null } }
    | null
    | undefined;
  const value = data?.activeChildId ?? data?.data?.activeChildId ?? null;
  return value ?? null;
};

export function ActiveChildProvider({ children }: { children: ReactNode }) {
  const [childList, setChildList] = useState<ChildProfile[]>([]);
  const [activeChildId, setActiveChildId] = useState<string | null>(null);
  // isLoading bắt đầu false — context KHÔNG tự fetch khi mount.
  // App.tsx sẽ gọi seedChildren() sau khi nó đã fetch xong /api/children.
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const fetchChildren = useCallback(async (): Promise<ChildProfile[]> => {
    try {
      const response = await fetch('/api/children', { credentials: 'include' });
      if (!response.ok) {
        return [];
      }
      const payload = await response.json().catch(() => ({}));
      return extractChildren(payload);
    } catch (error) {
      console.warn('Unable to load children:', error);
      return [];
    }
  }, []);

  /**
   * Nạp children từ bên ngoài (App.tsx đã fetch rồi) để tránh double-fetch.
   * Nếu preferredId được truyền vào, dùng nó làm activeChildId.
   */
  const seedChildren = useCallback((list: ChildProfile[], preferredId?: string | null) => {
    setChildList(list);
    setActiveChildId((current) => {
      // Ưu tiên: preferredId → current (nếu còn hợp lệ) → first child
      const candidate = preferredId !== undefined ? preferredId : current;
      if (candidate && list.some((c) => c.id === candidate)) {
        return candidate;
      }
      return list.length > 0 ? list[0].id : null;
    });
    setIsLoading(false);
  }, []);

  const refreshChildren = useCallback(async () => {
    setIsLoading(true);
    const nextChildren = await fetchChildren();
    setChildList(nextChildren);
    // Nếu bé đang active không còn trong danh sách, chọn lại bé hợp lệ đầu tiên.
    setActiveChildId((current) => {
      if (current && nextChildren.some((child) => child.id === current)) {
        return current;
      }
      return nextChildren.length > 0 ? nextChildren[0].id : null;
    });
    setIsLoading(false);
  }, [fetchChildren]);

  const setActiveChild = useCallback(async (id: string | null) => {
    try {
      const response = await fetch('/api/active-child', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childId: id }),
      });
      if (!response.ok) {
        console.warn('Unable to persist active child, status:', response.status);
        return;
      }
      const payload = await response.json().catch(() => ({}));
      // Ưu tiên giá trị backend xác nhận, fallback về id đã yêu cầu.
      const confirmedId = extractActiveChildId(payload) ?? id;
      setActiveChildId(confirmedId);
    } catch (error) {
      console.warn('Unable to set active child:', error);
    }
  }, []);

  const activeChild = useMemo(
    () => childList.find((child) => child.id === activeChildId) ?? null,
    [childList, activeChildId]
  );

  const value = useMemo<ActiveChildContextValue>(
    () => ({
      activeChildId,
      activeChild,
      children: childList,
      setActiveChild,
      refreshChildren,
      seedChildren,
      isLoading,
    }),
    [activeChildId, activeChild, childList, setActiveChild, refreshChildren, seedChildren, isLoading]
  );

  return <ActiveChildContext.Provider value={value}>{children}</ActiveChildContext.Provider>;
}

const _noOpSetActiveChild = async (_id: string | null) => {
  // no-op outside provider
};
const _noOpRefreshChildren = async () => {
  // no-op outside provider
};
const _noOpSeedChildren = (_list: ChildProfile[], _preferredId?: string | null) => {
  // no-op outside provider
};
const _defaultContextValue: ActiveChildContextValue = {
  activeChildId: null,
  activeChild: null,
  children: [],
  setActiveChild: _noOpSetActiveChild,
  refreshChildren: _noOpRefreshChildren,
  seedChildren: _noOpSeedChildren,
  isLoading: false,
};

export function useActiveChild(): ActiveChildContextValue {
  const context = useContext(ActiveChildContext);
  if (context === null) {
    // Return safe defaults when used outside provider (e.g. in tests that render App directly).
    // In production main.tsx wraps App with ActiveChildProvider, so this path is test-only.
    if (process.env.NODE_ENV !== 'test') {
      console.warn('useActiveChild: used outside ActiveChildProvider — returning no-op defaults');
    }
    return _defaultContextValue;
  }
  return context;
}

export default ActiveChildContext;
