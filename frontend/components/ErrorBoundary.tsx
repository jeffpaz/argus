'use client'

import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode; label?: string }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 px-6">
          <div className="border border-a-red/40 bg-a-red/5 text-a-red rounded-lg px-6 py-5 text-sm max-w-xl w-full">
            <div className="font-semibold mb-1">
              ⚠ {this.props.label ?? 'Page'} failed to render
            </div>
            <div className="text-xs font-mono text-a-muted break-all">
              {this.state.error.message}
            </div>
          </div>
          <button
            className="text-xs text-a-teal hover:underline"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
