import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'An unexpected clinical workspace error occurred.',
    };
  }

  componentDidCatch(error: Error) {
    console.error('Clinical Workspace Error:', error);
  }

  render() {
    if (this.state.hasError) {
      let parsedMsg = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message) as { error?: string; operationType?: string };
        if (parsed.error) {
          parsedMsg = `Database ${parsed.operationType || 'operation'} issue: ${parsed.error}`;
        }
      } catch {
        // Keep raw error string
      }

      return (
        <div className="min-h-screen bg-[#f8f9ff] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white rounded-[2rem] border border-[#E2E8F0] p-8 shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-[#FEE2E2] text-[#DC2626] flex items-center justify-center mb-5">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-[#0b1c30] mb-2">Clinical Session Interrupted</h2>
            <p className="text-sm text-[#3f4850] leading-relaxed mb-6 break-words">{parsedMsg}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 min-h-[48px] px-6 rounded-full bg-[#0284C7] text-white font-semibold text-sm hover:bg-[#0369A1] transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Reload Clinical Terminal
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
