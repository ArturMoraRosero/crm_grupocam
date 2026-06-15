import React from 'react';

/**
 * Captura cualquier excepción lanzada durante el render del árbol hijo.
 * Sin esto, un error de render desmonta toda la app y deja el #root vacío
 * (pantalla "negra" sobre el fondo oscuro del tema). Aquí lo convertimos en
 * una tarjeta de error recuperable que además muestra el mensaje real.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Queda registrado en consola para depurar la causa raíz.
    console.error('[CRM ErrorBoundary] Render crash:', error, info);
    this.setState({ info });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, info: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { error, info } = this.state;

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-primary, #1a1a1a)',
          padding: '2rem',
          fontFamily: 'system-ui, sans-serif'
        }}
      >
        <div
          style={{
            maxWidth: '640px',
            width: '100%',
            background: 'var(--bg-secondary, #242424)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '12px',
            padding: '2rem',
            boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
            color: '#fff'
          }}
        >
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem' }}>
            ⚠️ Ocurrió un error al mostrar la vista
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', marginBottom: '1rem' }}>
            Tus datos están a salvo. Puedes volver al pipeline sin recargar la página.
          </p>

          <pre
            style={{
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              padding: '1rem',
              fontSize: '0.78rem',
              color: '#fca5a5',
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              maxHeight: '240px'
            }}
          >
            {error?.toString()}
            {info?.componentStack ? `\n${info.componentStack}` : ''}
          </pre>

          <div style={{ display: 'flex', gap: '0.8rem', marginTop: '1.2rem' }}>
            <button
              onClick={this.handleReset}
              style={{
                flex: 1,
                padding: '0.7rem 1rem',
                background: 'var(--cam-red, #c9242a)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Volver al pipeline
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                flex: 1,
                padding: '0.7rem 1rem',
                background: 'transparent',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              Recargar página
            </button>
          </div>
        </div>
      </div>
    );
  }
}
