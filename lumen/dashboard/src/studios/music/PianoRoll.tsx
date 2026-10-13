// Piano roll for the poly synth: click to add, drag to move, drag the right edge to resize, double-click to delete.
import { useRef } from "react";
import { agentProps } from "../../takeover/registry";
import { addNote, midiName, music, playhead, ROLL_HIGH, ROLL_LOW, ROLL_STEPS, type Note } from "./store";
import { audition } from "./engine";

const ROW = 14;

/** Playhead bar + the "playing" glow on notes: the only part of the roll that re-renders on every step. */
function RollHead({ notes }: { notes: Note[] }) {
  const step = playhead.use((p) => p.step);
  if (step < 0) return null;
  return (
    <>
      <div className="roll-head" style={{ left: `${(step / ROLL_STEPS) * 100}%`, width: `${100 / ROLL_STEPS}%` }} />
      {notes.filter((n) => step >= n.at && step < n.at + n.dur).map((n) => (
        <div key={n.id} className="nr playing ghost" style={{ left: `${(n.at / ROLL_STEPS) * 100}%`, width: `${(n.dur / ROLL_STEPS) * 100}%`, top: (ROLL_HIGH - n.pitch) * ROW, height: ROW - 1 }} />
      ))}
    </>
  );
}

export function PianoRoll() {
  const notes = music.use((st) => st.notes);
  const grid = useRef<HTMLDivElement>(null);
  const rows = Array.from({ length: ROLL_HIGH - ROLL_LOW + 1 }, (_, i) => ROLL_HIGH - i);
  const colW = () => (grid.current ? grid.current.clientWidth / ROLL_STEPS : 20);

  const update = (id: string, patch: Partial<Note>) => music.set((st) => ({ notes: st.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }));
  const remove = (id: string) => music.set((st) => ({ notes: st.notes.filter((n) => n.id !== id) }));

  function onGridDown(e: React.PointerEvent) {
    if (e.target !== grid.current) return;
    const r = grid.current!.getBoundingClientRect();
    const step = Math.floor((e.clientX - r.left) / colW());
    const pitch = ROLL_HIGH - Math.floor((e.clientY - r.top) / ROW);
    if (pitch < ROLL_LOW || pitch > ROLL_HIGH) return;
    addNote(pitch, step, 2);
    audition("note", pitch);
  }

  function onNoteDown(e: React.PointerEvent, n: Note) {
    e.stopPropagation();
    const resize = (e.target as HTMLElement).classList.contains("nr-edge");
    const x0 = e.clientX, y0 = e.clientY;
    const start = { ...n };
    const cw = colW();
    const move = (ev: PointerEvent) => {
      const ds = Math.round((ev.clientX - x0) / cw);
      if (resize) update(n.id, { dur: Math.max(1, Math.min(ROLL_STEPS - start.at, start.dur + ds)) });
      else {
        const dp = -Math.round((ev.clientY - y0) / ROW);
        update(n.id, { at: Math.max(0, Math.min(ROLL_STEPS - start.dur, start.at + ds)), pitch: Math.max(ROLL_LOW, Math.min(ROLL_HIGH, start.pitch + dp)) });
      }
    };
    const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  }

  return (
    <div className="roll" {...agentProps("music.pianoroll", "Piano roll", "canvas")}>
      <div className="roll-keys">
        {rows.map((p) => <div key={p} className={`rk ${[1, 3, 6, 8, 10].includes(p % 12) ? "black" : ""}`} style={{ height: ROW }} onPointerDown={() => audition("note", p)}>{p % 12 === 0 ? midiName(p) : ""}</div>)}
      </div>
      <div className="roll-grid" ref={grid} onPointerDown={onGridDown} style={{ height: rows.length * ROW, backgroundSize: `calc(100% / ${ROLL_STEPS}) ${ROW}px, calc(100% / ${ROLL_STEPS / 4}) 100%` }}>
        <RollHead notes={notes} />
        {notes.filter((n) => n.pitch >= ROLL_LOW && n.pitch <= ROLL_HIGH).map((n) => (
          <div key={n.id} className="nr" title={`${midiName(n.pitch)} · step ${n.at + 1} · ${n.dur} steps`}
            style={{ left: `${(n.at / ROLL_STEPS) * 100}%`, width: `${(n.dur / ROLL_STEPS) * 100}%`, top: (ROLL_HIGH - n.pitch) * ROW, height: ROW - 1 }}
            onPointerDown={(e) => onNoteDown(e, n)} onDoubleClick={() => remove(n.id)}>
            <span className="nr-edge" />
          </div>
        ))}
      </div>
    </div>
  );
}
