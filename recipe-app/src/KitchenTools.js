import React, { useEffect, useRef, useState } from 'react';
import { quantity } from './api';

export function downloadRecipe(recipe, servings, format = 'text') {
  const ratio = servings / recipe.servings;
  const journal = recipe.journal || {};
  const copy = { ...recipe }; delete copy.id; delete copy.journal;
  const content = format === 'json' ? JSON.stringify({ recipes: [copy] }, null, 2) : [
    recipe.title, recipe.description, ...(recipe.mealdb_id ? ['Source: https://www.themealdb.com/meal/' + recipe.mealdb_id] : []), `${recipe.time} minutes · ${servings} servings`, '',
    'INGREDIENTS', ...recipe.ingredients.map(i => `${quantity(i.quantity * ratio)} ${i.unit} ${i.name}`),
    '', 'METHOD', ...recipe.instructions.map((step, i) => `${i + 1}. ${step}`),
    '', 'Quantities scaled; cooking times and written instructions stay as written.',
    ...(journal.notes ? ['', 'MY NOTES', journal.notes] : []),
  ].join('\n');
  const url = URL.createObjectURL(new Blob([content], { type: format === 'json' ? 'application/json' : 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = `recipe-${recipe.id}.${format === 'json' ? 'json' : 'txt'}`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function KitchenTimer() {
  const [minutes, setMinutes] = useState('5'), [seconds, setSeconds] = useState(0), [running, setRunning] = useState(false), [finished, setFinished] = useState(false);
  const deadline = useRef(0), remaining = useRef(0);
  useEffect(() => {
    if (!running) return undefined;
    const tick = () => {
      const next = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      remaining.current = next; setSeconds(next);
      if (next === 0) { setRunning(false); setFinished(true); }
    };
    tick(); const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [running]);
  const valid = /^\d{1,3}$/.test(minutes) && Number(minutes) >= 1 && Number(minutes) <= 180;
  function start() { const next = remaining.current || Number(minutes) * 60; remaining.current = next; setSeconds(next); deadline.current = Date.now() + next * 1000; setFinished(false); setRunning(true); }
  function pause() { const next = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000)); remaining.current = next; setSeconds(next); setRunning(false); }
  function reset() { remaining.current = 0; setSeconds(0); setRunning(false); setFinished(false); }
  return <section className="kitchen-tool" aria-label="Kitchen timer"><h3>A little kitchen timer</h3><p className="muted tiny">Keep this recipe open. The timer stops when you close it.</p><div className="timer-controls"><label>Minutes<input aria-label="Timer minutes" type="number" min="1" max="180" value={minutes} disabled={running || seconds > 0} onChange={e => setMinutes(e.target.value)} /></label><output aria-label="Time remaining">{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</output></div><div className="tool-actions"><button className="button small" disabled={!running && !valid} onClick={running ? pause : start}>{running ? 'Pause timer' : seconds ? 'Resume timer' : 'Start timer'}</button><button className="text-button" onClick={reset}>Reset timer</button></div><p role="status" className="timer-status">{finished ? 'Timer finished — check your dish.' : ''}</p></section>;
}

export default function KitchenTools({ recipe, servings, busy, onJournal, onCooked, onDuplicate }) {
  const journal = recipe.journal || {};
  const [notes, setNotes] = useState(journal.notes || ''), [rating, setRating] = useState(journal.rating || 0);
  useEffect(() => { setNotes(recipe.journal?.notes || ''); setRating(recipe.journal?.rating || 0); }, [recipe.journal?.notes, recipe.journal?.rating]);
  const dirty = notes !== (journal.notes || '') || rating !== (journal.rating || 0);
  return <div className="kitchen-tools"><KitchenTimer /><section className="kitchen-tool"><h3>Your recipe notebook</h3><p className="muted tiny">Remember the tweaks that made it yours. Save before closing this recipe.</p><label htmlFor="recipe-rating">My rating</label><select id="recipe-rating" value={rating} disabled={busy} onChange={e => setRating(Number(e.target.value))}><option value="0">Not rated yet</option>{[1, 2, 3, 4, 5].map(n => <option value={n} key={n}>{n} {n === 1 ? 'star' : 'stars'}</option>)}</select><label htmlFor="recipe-notes">Kitchen notes<textarea id="recipe-notes" rows="4" maxLength="2000" value={notes} disabled={busy} onChange={e => setNotes(e.target.value)} placeholder="Less salt next time? A swap everyone loved?" /></label><span className="muted tiny">{notes.length}/2000 characters{dirty ? ' · Unsaved changes' : ''}</span><div className="tool-actions"><button className="button small" disabled={busy || !dirty} onClick={() => onJournal?.(recipe, { notes, rating })}>Save notes & rating</button></div><p data-testid="cooking-history">Made {journal.cooked_count || 0} {(journal.cooked_count || 0) === 1 ? 'time' : 'times'}{journal.last_cooked ? ` · Last cooked ${journal.last_cooked}` : ''}</p><button className="button small" disabled={busy} onClick={() => onCooked?.(recipe)}>I cooked this today</button><p className="muted tiny">Each click records one cooking session.</p></section><section className="kitchen-tool"><h3>Keep it. Share it. Make it yours.</h3><div className="tool-actions"><button className="button small" disabled={busy} onClick={() => onDuplicate?.(recipe)}>Make my own version</button><button className="button small" onClick={() => downloadRecipe(recipe, servings)}>Download recipe</button><button className="button small" onClick={() => downloadRecipe(recipe, servings, 'json')}>Export recipe file</button></div><p className="muted tiny">Download a readable recipe at {servings} servings. Export a recipe file to import into another Everyday Table cookbook. Copies start without notes, ratings, or cooking history.</p></section></div>;
}
