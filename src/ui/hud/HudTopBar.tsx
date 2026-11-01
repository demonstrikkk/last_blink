import type { WorldView } from '../../world/worldView.js';

interface HudTopBarProps {
  readonly view: WorldView;
  readonly showObjectives: boolean;
  readonly showMorrow: boolean;
  readonly showEcho: boolean;
  readonly showLedger: boolean;
  readonly quality: 'high' | 'low';
  readonly muted: boolean;
  readonly saveState: 'idle' | 'saving' | 'saved' | 'restored' | 'error';
  readonly lastSavedAt: string | null;
  readonly onToggleObjectives: () => void;
  readonly onToggleMorrow: () => void;
  readonly onToggleEcho: () => void;
  readonly onToggleLedger: () => void;
  readonly onToggleQuality: () => void;
  readonly onToggleMute: () => void;
  readonly onSave: () => void;
  readonly onOpenBlink: () => void;
  readonly onPulse?: () => void;
  readonly timeMode: 'day' | 'night';
  readonly onToggleTimeMode: () => void;
  readonly onOpenDiagnostics: () => void;
}

export function HudTopBar({
  view,
  showObjectives,
  showMorrow,
  showEcho,
  showLedger,
  quality,
  muted,
  saveState,
  lastSavedAt,
  onToggleObjectives,
  onToggleMorrow,
  onToggleEcho,
  onToggleLedger,
  onToggleQuality,
  onToggleMute,
  onSave,
  onOpenBlink,
  onPulse,
  timeMode,
  onToggleTimeMode,
  onOpenDiagnostics,
}: HudTopBarProps) {
  return (
    <header className="hud-topbar" role="banner">
      <div className="hud-brand-group">
        <h1 className="hud-main-title">BLINK</h1>
        <span className="hud-sub-title">A RIN Adventure</span>
      </div>

      <nav className="hud-center-pills" aria-label="Investigation tools">
        <button
          type="button"
          className={`hud-pill-btn${showObjectives ? ' pill-active' : ''}`}
          onClick={onToggleObjectives}
          aria-pressed={showObjectives}
        >
          <span className="pill-glyph glyph-hex" aria-hidden="true">⬡</span>
           <span>Roadmap</span>
        </button>

        <button
          type="button"
          className={`hud-pill-btn${showMorrow ? ' pill-active' : ''}`}
          onClick={onToggleMorrow}
          aria-pressed={showMorrow}
        >
          <span className="pill-glyph glyph-circle" aria-hidden="true">◎</span>
          <span>MORROW</span>
        </button>

        <button
          type="button"
          className={`hud-pill-btn${showEcho ? ' pill-active' : ''}`}
          onClick={onToggleEcho}
          aria-pressed={showEcho}
        >
          <span className="pill-glyph glyph-echo" aria-hidden="true">𝘎</span>
          <span>ECHO</span>
        </button>

        <button
          type="button"
          className={`hud-pill-btn${showLedger ? ' pill-active' : ''}`}
          onClick={onToggleLedger}
          aria-pressed={showLedger}
        >
          <span className="pill-glyph glyph-ledger" aria-hidden="true">⮹</span>
           <span>Case Board</span>
        </button>
      </nav>

      <div className="hud-right-controls">
        <button
          type="button"
          className="hud-timeline-pill mono"
          onClick={onOpenBlink}
          title="Active Timeline Branch (Click to open BLINK panel)"
        >
          <span className="timeline-pulse-dot" aria-hidden="true" />
          <span>V{view.timeline.index + 1}</span>
          <span className="timeline-denom">/{view.timeline.total}</span>
        </button>

        {onPulse ? (
          <button
            type="button"
            className="hud-tool-btn hud-pulse-btn mono"
            onClick={onPulse}
            title="Investigative Echo Pulse (Hotkey Q) — Scan for MORROW frequency overrides & coerced witnesses"
          >
            <span className="pulse-btn-icon" aria-hidden="true">📡</span>
            <span>PULSE [Q]</span>
          </button>
        ) : null}

        <button type="button" className="hud-tool-btn mono" onClick={onToggleTimeMode}>
          {timeMode === 'night' ? 'DAY MODE' : 'NIGHT MODE'}
        </button>
        <button type="button" className="hud-tool-btn mono" onClick={onOpenDiagnostics} title="Developer AI diagnostics">
          AI DIAG
        </button>

        <button
          type="button"
          className="hud-tool-btn mono"
          onClick={onToggleQuality}
          title="Toggle dynamic rain, atmospheric lighting and mist"
        >
          FX: {quality.toUpperCase()}
        </button>

        <button
          type="button"
          className="hud-tool-btn mono"
          onClick={onToggleMute}
          title="Toggle audio sound effects"
        >
          {muted ? 'MUTED' : 'AUDIO'}
        </button>

        <button
          type="button"
          className={`hud-tool-btn hud-save-btn mono${saveState === 'saving' ? ' is-saving' : ''}`}
          onClick={onSave}
          title={lastSavedAt ? `Saved at ${lastSavedAt}` : 'Save to IndexedDB'}
        >
          {saveState === 'saving' ? 'SAVING…' : 'SAVE'}
        </button>
      </div>
    </header>
  );
}
