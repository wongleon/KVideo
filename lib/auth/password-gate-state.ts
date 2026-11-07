import type { AuthSession } from '@/lib/store/auth-store';

export type PasswordGateStateResolution =
  | {
      action: 'unlock-session';
      session: AuthSession;
      persistSession: boolean;
    }
  | {
      action: 'unlock-public';
      /** 无鉴权部署下本地残留的旧会话无效，需要一并清理 */
      clearMirroredSession?: boolean;
    }
  | {
      action: 'lock';
      clearMirroredSession: boolean;
    };

export function resolvePasswordGateState({
  hasAuth,
  serverSession,
  mirroredSession,
  persistSession,
}: {
  hasAuth: boolean;
  serverSession: AuthSession | null;
  mirroredSession: AuthSession | null;
  persistSession: boolean;
}): PasswordGateStateResolution {
  // 未启用鉴权时必须直接放行：否则本地残留的旧会话会把用户锁在无法解锁的密码页
  if (!hasAuth) {
    return mirroredSession
      ? { action: 'unlock-public', clearMirroredSession: true }
      : { action: 'unlock-public' };
  }

  if (serverSession) {
    return {
      action: 'unlock-session',
      session: serverSession,
      persistSession,
    };
  }

  if (mirroredSession) {
    return {
      action: 'lock',
      clearMirroredSession: true,
    };
  }

  return {
    action: 'lock',
    clearMirroredSession: false,
  };
}
