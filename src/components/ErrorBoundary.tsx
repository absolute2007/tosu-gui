import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 32,
          color: '#e8ecf2',
          fontFamily: 'Segoe UI, system-ui, sans-serif',
          background: '#161a22',
          height: '100%',
        }}>
          <h2 style={{ marginBottom: 12 }}>Ошибка интерфейса</h2>
          <pre style={{
            background: '#1e2430',
            padding: 16,
            borderRadius: 8,
            fontSize: 12,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
          }}>
            {this.state.error.message}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}