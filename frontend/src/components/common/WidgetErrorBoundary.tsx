import React from 'react';

interface WidgetErrorBoundaryProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  className?: string;
}

interface WidgetErrorBoundaryState {
  hasError: boolean;
}

class WidgetErrorBoundary extends React.Component<
  WidgetErrorBoundaryProps,
  WidgetErrorBoundaryState
> {
  state: WidgetErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): WidgetErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('Widget boundary captured an error.', error);
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <section
        className={`rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-50 ${
          this.props.className ?? ''
        }`}
        role="alert"
      >
        <h2 className="text-base font-semibold">
          {this.props.title ?? 'Widget temporarily unavailable'}
        </h2>
        <p className="mt-1 text-rose-100/90">
          {this.props.description ??
            'A widget failed to render. Retry this surface without losing the rest of the page.'}
        </p>
        <button
          type="button"
          onClick={this.handleRetry}
          className="mt-3 rounded-lg bg-white px-3 py-2 font-semibold text-rose-700 hover:bg-rose-50"
        >
          Retry widget
        </button>
      </section>
    );
  }
}

export default WidgetErrorBoundary;
