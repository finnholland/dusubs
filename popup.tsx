import { render } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import './popup.css';

declare const browser: {
  storage: {
    local: {
      get(keys: Record<string, unknown>): Promise<Record<string, any>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
    onChanged: {
      addListener(listener: (changes: Record<string, { newValue?: any; oldValue?: any }>) => void): void;
      removeListener(listener: (changes: Record<string, { newValue?: any; oldValue?: any }>) => void): void;
    };
  };
  runtime: {
    getManifest(): { version: string };
  };
};

interface Track { languageCode: string; name: string; }
interface SavedWord { zh: string; py: string; en: string; url?: string; sentZh?: string; sentEn?: string; }
interface Settings {
  fontScale: number; subPosition: number;
  zhTrack: string; enTrack: string;
  zhColor: string; enColor: string;
  stroke: boolean; window: boolean; shadow: boolean;
  learnMode: 'none' | 'en' | 'zh';
  pinyinEnabled: boolean; sandhiEnabled: boolean;
}

const DEFAULTS: Settings = {
  fontScale: 100, subPosition: 8, zhTrack: '', enTrack: '',
  zhColor: '#ffffff', enColor: '#ffe97a',
  stroke: true, window: false, shadow: false,
  learnMode: 'none', pinyinEnabled: true, sandhiEnabled: true,
};

const COLORS_ZH = ['#ffffff', '#ffe97a', '#F6B8FF', '#a8d8ff', '#b8ffb8'];
const COLORS_EN = ['#ffe97a', '#ffffff', '#F6B8FF', '#a8d8ff', '#b8ffb8'];
const COLOR_NAMES: Record<string, string> = {
  '#ffffff': 'White', '#ffe97a': 'Yellow', '#F6B8FF': 'Pink', '#a8d8ff': 'Blue', '#b8ffb8': 'Green',
};

function escHtml(s: string) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function downloadText(content: string, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
  a.download = filename;
  a.click();
}

function autoSelect(tracks: Track[], zhTrack: string, enTrack: string) {
  const newZh = zhTrack || tracks.find(t => t.languageCode.startsWith('zh'))?.languageCode || '';
  const newEn = enTrack || tracks.find(t => t.languageCode.startsWith('en'))?.languageCode || '';
  return { newZh, newEn };
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function Toggle({ id, checked, disabled, onChange }: { id: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label class="toggle" style={disabled ? 'opacity:0.4;pointer-events:none' : ''}>
      <input type="checkbox" id={id} checked={checked} disabled={disabled} onChange={e => onChange((e.target as HTMLInputElement).checked)} />
      <span class="slider" />
    </label>
  );
}

function ColorSelect({ id, value, colorOrder, onChange }: {
  id: string; value: string; colorOrder: string[]; onChange: (v: string) => void;
}) {
  return (
    <div class="color-select-wrap">
      <div class="color-swatch" style={{ background: value }} />
      <select id={id} value={value} onChange={e => onChange((e.target as HTMLSelectElement).value)}>
        {colorOrder.map(c => <option key={c} value={c}>{COLOR_NAMES[c]}</option>)}
      </select>
      <span class="color-arrow">▾</span>
    </div>
  );
}

function TrackOptions({ tracks }: { tracks: Track[] }) {
  if (!tracks.length) return <option value="">No video open…</option>;
  return (
    <>
      <option value="">Off</option>
      {tracks.map(t => <option key={t.languageCode} value={t.languageCode}>{t.name}</option>)}
    </>
  );
}

function App() {
  const [tab, setTab] = useState<'settings' | 'words'>('settings');
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [words, setWords] = useState<Record<string, SavedWord>>({});
  const [exportOpen, setExportOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    browser.storage.local.get({ ...DEFAULTS, availableTracks: [] }).then(data => {
      const ts: Track[] = data.availableTracks || [];
      const { newZh, newEn } = autoSelect(ts, data.zhTrack, data.enTrack);
      if (newZh !== data.zhTrack || newEn !== data.enTrack) {
        browser.storage.local.set({ zhTrack: newZh, enTrack: newEn });
      }
      setS({
        fontScale: data.fontScale, subPosition: data.subPosition,
        zhTrack: newZh, enTrack: newEn,
        zhColor: data.zhColor, enColor: data.enColor,
        stroke: data.stroke, window: data.window, shadow: data.shadow,
        learnMode: data.learnMode ?? 'none',
        pinyinEnabled: data.pinyinEnabled ?? true,
        sandhiEnabled: data.sandhiEnabled ?? true,
      });
      setTracks(ts);
    });

    function onChanged(changes: Record<string, { newValue?: any }>) {
      if ('availableTracks' in changes) {
        const ts: Track[] = changes.availableTracks.newValue;
        setTracks(ts);
        browser.storage.local.get({ zhTrack: '', enTrack: '' }).then(data => {
          const { newZh, newEn } = autoSelect(ts, data.zhTrack, data.enTrack);
          if (newZh !== data.zhTrack || newEn !== data.enTrack) {
            browser.storage.local.set({ zhTrack: newZh, enTrack: newEn });
          }
          setS(prev => ({ ...prev, zhTrack: newZh, enTrack: newEn }));
        });
      }
    }
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);

  useEffect(() => {
    if (tab === 'words') {
      browser.storage.local.get({ savedWords: {} }).then(data => setWords(data.savedWords));
    }
  }, [tab]);

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setS(prev => ({ ...prev, [key]: value }));
    browser.storage.local.set({ [key]: value });
  }

  function deleteWord(zh: string) {
    const next = { ...words };
    delete next[zh];
    setWords(next);
    browser.storage.local.set({ savedWords: next });
  }

  function exportAnki() {
    const lines = Object.values(words).map(w => {
      let back = `${escHtml(w.py)}<br>${escHtml(w.en)}`;
      if (w.sentEn || w.sentZh) {
        back += `<br><i>${escHtml([w.sentZh, w.sentEn].filter(Boolean).join(' · '))}</i>`;
      }
      return `${w.zh}\t${back}`;
    });
    downloadText(lines.join('\n'), 'saved-words-anki.txt');
    setExportOpen(false);
  }

  function exportQuizlet() {
    const lines = Object.values(words).map(w =>
      `${w.zh}\t${w.py} · ${w.en}`
    );
    downloadText(lines.join('\n'), 'saved-words-quizlet.txt');
    setExportOpen(false);
  }

  function startDeleteAll() {
    setConfirmDelete(true);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => setConfirmDelete(false), 3000);
  }

  function confirmDeleteAll() {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    setConfirmDelete(false);
    browser.storage.local.set({ savedWords: {} }).then(() => setWords({}));
  }

  function toggleExportOpen() {
    clearTimeout(dismissTimer.current);
    dismissTimer.current = null;
    setConfirmDelete(false);
    setExportOpen(o => !o);
  }

  function cycleLearnMode() {
    const next: 'none' | 'en' | 'zh' = s.learnMode === 'none' ? 'en' : s.learnMode === 'en' ? 'zh' : 'none';
    set('learnMode', next);
  }
  const learnLabel = s.learnMode === 'none' ? 'Off' : s.learnMode === 'en' ? '🇬🇧 English' : '🇨🇳 Chinese';
  const { version } = browser.runtime.getManifest();

  const wordList = Object.values(words);

  return (
    <>
      <div class="tabs">
        <button class={`tab${tab === 'settings' ? ' active' : ''}`} onClick={() => setTab('settings')}>Settings</button>
        <button class={`tab${tab === 'words' ? ' active' : ''}`} onClick={() => setTab('words')}>Saved</button>
      </div>

      <div class={`tab-panel${tab !== 'settings' ? ' hidden' : ''}`}>
        <div class="learn-row">
          <span class="learn-label">Learn mode</span>
          <button class="learn-btn" onClick={cycleLearnMode}>{learnLabel}</button>
        </div>
        {s.learnMode === 'zh' && (
          <div class="toggle-sub">
            <div class="toggle-row">
              <label class="name" for="tog-pinyin">Pinyin</label>
              <Toggle id="tog-pinyin" checked={s.pinyinEnabled} onChange={v => set('pinyinEnabled', v)} />
            </div>
            <div class="toggle-row">
              <label class="name" for="tog-sandhi">Sandhi colours</label>
              <Toggle id="tog-sandhi" checked={s.sandhiEnabled && s.pinyinEnabled} disabled={!s.pinyinEnabled} onChange={v => set('sandhiEnabled', v)} />
            </div>
          </div>
        )}
        <hr class="divider" />
        <div class="track-row">
          <div class="track-label">Top</div>
          <div class="track-controls">
            <select id="zh-track" value={s.zhTrack} onChange={e => set('zhTrack', (e.target as HTMLSelectElement).value)}>
              <TrackOptions tracks={tracks} />
            </select>
            <ColorSelect id="zh-color" value={s.zhColor} colorOrder={COLORS_ZH} onChange={v => set('zhColor', v)} />
          </div>
        </div>

        <div class="track-row">
          <div class="track-label">Bottom</div>
          <div class="track-controls">
            <select id="en-track" value={s.enTrack} onChange={e => set('enTrack', (e.target as HTMLSelectElement).value)}>
              <TrackOptions tracks={tracks} />
            </select>
            <ColorSelect id="en-color" value={s.enColor} colorOrder={COLORS_EN} onChange={v => set('enColor', v)} />
          </div>
        </div>

        <hr class="divider" />

        <div class="slider-row">
          <label for="font-scale">Scale</label>
          <span>{s.fontScale}%</span>
          <input type="range" id="font-scale" min="50" max="200" step="5" value={s.fontScale}
            onInput={e => set('fontScale', Number((e.target as HTMLInputElement).value))} />
        </div>
        <div class="slider-row">
          <label for="sub-position">Position</label>
          <span>{s.subPosition}%</span>
          <input type="range" id="sub-position" min="0" max="40" step="1" value={s.subPosition}
            onInput={e => set('subPosition', Number((e.target as HTMLInputElement).value))} />
        </div>

        <hr class="divider" />

        <div class="toggle-row">
          <label class="name" for="tog-stroke">Stroke</label>
          <Toggle id="tog-stroke" checked={s.stroke} onChange={v => set('stroke', v)} />
        </div>
        <div class="toggle-row">
          <label class="name" for="tog-window">Window</label>
          <Toggle id="tog-window" checked={s.window} onChange={v => set('window', v)} />
        </div>
        <div class="toggle-row">
          <label class="name" for="tog-shadow">Shadow</label>
          <Toggle id="tog-shadow" checked={s.shadow} onChange={v => set('shadow', v)} />
        </div>

        <hr class="divider" />
        <div class="popup-footer">
          <a href="https://github.com/finnholland/dusubs" target="_blank" title="GitHub">
            <GitHubIcon /> GitHub
          </a>
          <a href="https://www.dusubs.com" target="_blank" title="Website">
            <GlobeIcon /> dusubs.com
          </a>
          <span class="popup-version">v{version}</span>
        </div>
      </div>

      <div class={`tab-panel${tab !== 'words' ? ' hidden' : ''}`}>
        <div id="word-list">
          {wordList.length === 0
            ? <p class="no-words">Hover a word while watching to save it.</p>
            : wordList.map(w => (
              <div key={w.zh} class="word-row">
                <span class="word-zh">{w.zh}</span>
                <span class="word-meta">
                  <div class="word-py">{w.py}</div>
                  <div class="word-en">{w.en}</div>
                </span>
                {w.url && (
                  <a class="word-link" href={w.url} target="_blank" title="Open video at time">
                    <LinkIcon />
                  </a>
                )}
                <button class="word-del" title="Remove" onClick={() => deleteWord(w.zh)}>
                  <TrashIcon />
                </button>
              </div>
            ))}
        </div>

        <button id="export-btn" disabled={wordList.length === 0} onClick={toggleExportOpen}>
          {exportOpen ? 'Cancel' : 'Export all'}
        </button>
        <div id="export-sub-btns" class={exportOpen ? 'visible' : ''}>
          <button class="export-sub-btn" onClick={exportAnki}>Anki</button>
          <button class="export-sub-btn" onClick={exportQuizlet}>Quizlet</button>
        </div>

        {!exportOpen && confirmDelete &&
          <button id="confirm-delete-btn" onClick={confirmDeleteAll}>
            Confirm<span id="confirm-bar" />
          </button>
        }

        {!exportOpen && !confirmDelete &&
          <button id="delete-all-btn" disabled={wordList.length === 0} onClick={startDeleteAll}>
            Delete all
          </button>
        }
      </div>
    </>
  );
}

render(<App />, document.getElementById('root')!);
