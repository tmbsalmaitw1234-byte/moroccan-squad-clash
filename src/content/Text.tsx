import { Fragment, ReactNode, useEffect, useState, useSyncExternalStore } from 'react';
import { act, useTournament } from '../store';
import { can } from '../engine/permissions';
import { TEXT_DEFAULTS } from './defaults';
import { Button, cx, inputCls, Modal, PageHeader } from '../components/ui';

/* ───── Edit-mode state (per browser tab) ───── */

let editMode = false;
let editingKey: string | undefined;
const subs = new Set<() => void>();
const notify = () => subs.forEach((l) => l());
const subscribe = (l: () => void) => { subs.add(l); return () => { subs.delete(l); }; };

export function setEditMode(on: boolean) { editMode = on; notify(); }
export function openEditor(key: string) { editingKey = key; notify(); }
function closeEditor() { editingKey = undefined; notify(); }
export function useEditMode() { return useSyncExternalStore(subscribe, () => editMode); }
function useEditingKey() { return useSyncExternalStore(subscribe, () => editingKey); }

/* ───── Reading text ───── */

type Vars = Record<string, string | number>;

function fill(s: string, vars?: Vars) {
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

export function useText() {
  const { state } = useTournament();
  const raw = (k: string) => state.content?.[k] ?? TEXT_DEFAULTS[k]?.value ?? k;
  return {
    t: (k: string, vars?: Vars) => fill(raw(k), vars),
    lines: (k: string, vars?: Vars) => fill(raw(k), vars).split('\n').map((l) => l.trim()).filter(Boolean),
    isCustom: (k: string) => state.content?.[k] !== undefined,
  };
}

/** Renders **highlight** and line breaks. */
export function rich(text: string, accent = 'text-mred-2'): ReactNode {
  return text.split('\n').map((line, i, arr) => (
    <Fragment key={i}>
      {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
        part.startsWith('**') && part.endsWith('**') ? <span key={j} className={accent}>{part.slice(2, -2)}</span> : <Fragment key={j}>{part}</Fragment>,
      )}
      {i < arr.length - 1 && <br />}
    </Fragment>
  ));
}

/* ───── Editable wrappers ───── */

/** Wraps any block of text; in edit mode it is outlined and clicking it opens the editor. */
export function Editable({ k, children, className, block }: { k: string; children: ReactNode; className?: string; block?: boolean }) {
  const editing = useEditMode();
  const Tag = block ? 'div' : 'span';
  if (!editing) return <Tag className={className}>{children}</Tag>;
  return (
    <Tag
      className={cx(className, 'cursor-text rounded outline-dashed outline-1 outline-offset-2 outline-gold/70 transition hover:bg-gold/10')}
      title={`Edit: ${TEXT_DEFAULTS[k]?.label ?? k}`}
      onClickCapture={(e) => { e.preventDefault(); e.stopPropagation(); openEditor(k); }}
    >
      {children}
    </Tag>
  );
}

/** Inline editable text. */
export function Txt({ k, vars, accent, className }: { k: string; vars?: Vars; accent?: string; className?: string }) {
  const { t } = useText();
  return <Editable k={k} className={className}>{rich(t(k, vars), accent)}</Editable>;
}

/** Page header whose kicker, title and description are all editable. */
export function PageHeaderT({ page, accent, right }: { page: string; accent?: string; right?: ReactNode }) {
  return (
    <PageHeader
      kicker={<Txt k={`${page}.kicker`} />}
      title={<Txt k={`${page}.title`} accent={accent} />}
      subtitle={<Txt k={`${page}.subtitle`} />}
      right={right}
    />
  );
}

/* ───── Editor modal + edit bar (mounted once in Layout) ───── */

export function TextEditor() {
  const key = useEditingKey();
  const { state, server } = useTournament();
  const def = key ? TEXT_DEFAULTS[key] : undefined;
  const current = key ? state.content?.[key] ?? def?.value ?? '' : '';
  const [value, setValue] = useState(current);
  useEffect(() => { setValue(current); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!key || !def) return null;
  const custom = state.content?.[key] !== undefined;
  const save = async () => {
    const v = value.trim() === def.value.trim() ? null : value;
    const r = await act(async () => { await server.setContent(key, v); return true; }, v === null ? 'Back to default text.' : 'Text saved — everyone sees it now.');
    if (r) closeEditor();
  };
  const reset = async () => {
    const r = await act(async () => { await server.setContent(key, null); return true; }, 'Back to default text.');
    if (r) closeEditor();
  };

  return (
    <Modal open onClose={closeEditor} title="✏️ Edit text" wide>
      <div className="mb-2 text-sm font-semibold">{def.label}</div>
      <textarea className={cx(inputCls, 'font-sans')} rows={def.list ? Math.min(14, value.split('\n').length + 2) : Math.min(8, Math.ceil(value.length / 70) + 2)} value={value} onChange={(e) => setValue(e.target.value)} autoFocus maxLength={5000} />
      <p className="mt-2 text-xs text-mute">
        {def.list ? 'One item per line. ' : 'New line = line break. '}
        Use <code className="text-gold">**word**</code> to highlight a word.
        {/\{\w+\}/.test(def.value) && <> Keep the <code className="text-gold">{'{…}'}</code> parts — they are filled in automatically.</>}
      </p>
      <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3 text-sm">
        <div className="mb-1 text-[11px] uppercase tracking-wider text-mute">Preview</div>
        {def.list ? <ul className="list-disc space-y-0.5 pl-5">{value.split('\n').filter((l) => l.trim()).map((l, i) => <li key={i}>{rich(l)}</li>)}</ul> : rich(value)}
      </div>
      {custom && <p className="mt-2 text-xs text-mute">Original: <span className="text-white/70">{def.value.split('\n')[0]}{def.value.includes('\n') ? ' …' : ''}</span></p>}
      <div className="mt-4 flex flex-wrap justify-between gap-2">
        <Button variant="ghost" onClick={reset} disabled={!custom}>↺ Reset to default</Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={closeEditor}>Cancel</Button>
          <Button variant="gold" onClick={save} disabled={!value.trim()}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

export function EditBar() {
  const on = useEditMode();
  const { me } = useTournament();
  if (!on || !can(me, 'staff.manage')) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-3 rounded-full border border-gold/60 bg-ink/95 px-4 py-2 text-sm shadow-[0_10px_40px_-10px_rgba(245,197,66,.6)] backdrop-blur">
      <span>✏️ <b>Edit mode</b> <span className="hidden text-mute sm:inline">— click any outlined text to change it</span></span>
      <button onClick={() => setEditMode(false)} className="rounded-full bg-gold px-3 py-1 font-semibold text-black">Done</button>
    </div>
  );
}

export function EditToggle() {
  const on = useEditMode();
  const { me } = useTournament();
  if (!can(me, 'staff.manage')) return null;
  return (
    <button
      onClick={() => setEditMode(!on)}
      className={cx('flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition', on ? 'border-gold bg-gold/15 text-gold' : 'border-white/10 text-white/70 hover:border-gold/50 hover:text-white')}
    >
      ✏️ {on ? 'Editing text… (click to stop)' : 'Edit site text'}
    </button>
  );
}
