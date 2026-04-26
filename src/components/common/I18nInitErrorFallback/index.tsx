/**
 * Rendered when i18next fails before translations load. `t()` is unavailable — copy is fixed English.
 *
 * CSS-independence: uses inline styles for spacing and the action button so the
 * fallback stays visible even in the worst case where `index.css` itself failed
 * to load (Tailwind tokens like `bg-background` would resolve to undefined and
 * paint white-on-white). Tailwind classes remain as the normal-state styling;
 * inline styles are the floor.
 */

const sectionStyle = {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
    background: '#ffffff',
    color: '#0a0a0a',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
};

const headingStyle = {
    fontSize: '1.5rem',
    fontWeight: 700,
    margin: '0 0 0.75rem'
};

const bodyStyle = {
    margin: '0 0 1.25rem',
    maxWidth: '32rem',
    lineHeight: 1.5
};

const buttonStyle = {
    padding: '0.5rem 1rem',
    background: '#0a0a0a',
    color: '#ffffff',
    border: 'none',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: 500
};

export const I18nInitErrorFallback = () => (
    <section
        role="alert"
        aria-live="assertive"
        className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-foreground"
        style={sectionStyle}
    >
        <div className="max-w-md space-y-4 text-center" style={{ textAlign: 'center' }}>
            <h1 className="text-2xl font-bold" style={headingStyle}>
                Unable to load translations
            </h1>
            <p className="text-muted-foreground" style={bodyStyle}>
                Check your network connection and try again. If the problem persists, contact
                support.
            </p>
            <button
                type="button"
                onClick={() => {
                    window.location.reload();
                }}
                style={buttonStyle}
            >
                Reload page
            </button>
        </div>
    </section>
);
