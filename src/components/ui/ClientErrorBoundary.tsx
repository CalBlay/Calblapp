'use client'

import React from 'react'
import { Button } from '@/components/ui/button'

type Props = {
  children: React.ReactNode
  title?: string
  onReset?: () => void
}

type State = {
  error: Error | null
}

export default class ClientErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ClientErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">{this.props.title || "S'ha produït un error"}</p>
          <p className="mt-2 break-words">{this.state.error.message || 'Error inesperat'}</p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 h-10"
            onClick={() => {
              this.setState({ error: null })
              this.props.onReset?.()
            }}
          >
            Tornar a provar
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
