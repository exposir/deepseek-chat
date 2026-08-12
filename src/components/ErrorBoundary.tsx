import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/** 全局错误兜底：任何组件异常不再白屏，提供刷新恢复 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[var(--color-bg)] px-6">
          <div className="text-2xl">😵</div>
          <div className="text-sm text-[var(--color-text)]">页面出错了</div>
          <div className="text-xs text-[var(--color-text-dim)]">你的会话数据仍保存在本地，刷新即可恢复</div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-[var(--color-accent)] text-[var(--color-accent-foreground)] px-4 py-2 text-sm font-medium"
          >
            刷新页面
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
