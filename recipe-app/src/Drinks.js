import React, { useEffect, useRef, useState } from 'react';
import { api } from './api';

const sourceURL = drink => `https://www.thecocktaildb.com/api/json/v1/1/lookup.php?i=${encodeURIComponent(drink.cocktaildb_id)}`;
function DrinkImage({ drink }) {
  return <img src={drink.image || '/art/drinks.svg'} alt={drink.title} loading="lazy" onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = '/art/drinks.svg'; }} />;
}
function DrinkDialog({ drink, saved, busy, error, onClose, onSave, onRemove }) {
  const dialog = useRef(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    const previous = document.activeElement, node = dialog.current;
    node.showModal();
    return () => { node.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  function download() {
    const text = `${drink.title}\n${drink.alcohol}${drink.glass ? ` · ${drink.glass}` : ''}\n\nINGREDIENTS\n${drink.ingredients.map(i => `${i.measure || 'Amount not specified'} — ${i.name}`).join('\n')}\n\nMETHOD\n${drink.instructions}\n\nSource: TheCocktailDB\n${sourceURL(drink)}\nMeasures reproduced as provided by the source.`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `drink-${drink.cocktaildb_id}.txt`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const complete = drink.ingredients?.length > 0 && !!drink.instructions;
  return <dialog ref={dialog} className="modal drink-dialog" aria-label={drink.title} onCancel={onClose}>
    <button className="close-modal" aria-label="Close drink" onClick={onClose}>×</button>
    <div className="drink-detail-photo"><DrinkImage drink={drink} /></div><div className="drink-detail-copy"><span className="eyebrow">A LITTLE SOMETHING TO SIP</span><h2>{drink.title}</h2><p className="drink-tags"><strong>{drink.alcohol}</strong>{drink.category && <span>{drink.category}</span>}{drink.glass && <span>{drink.glass}</span>}</p>
    <p className="muted tiny">From <a href={sourceURL(drink)} target="_blank" rel="noreferrer">TheCocktailDB — original record</a>. Ingredient measures are shown exactly as provided.</p>
    {error && <p className="error-banner" role="alert">{error}</p>}
    <div className="drink-detail-grid"><section><h3>What you’ll need</h3>{drink.ingredients?.length ? <ul className="drink-ingredients">{drink.ingredients.map((i, index) => <li key={index}><span>{i.name}</span><strong>{i.measure || 'Amount not specified'}</strong></li>)}</ul> : <p>No ingredients provided by the source.</p>}</section><section><h3>Make it your way</h3>{drink.instructions ? drink.instructions.split(/\n+/).filter(Boolean).map((step, index) => <p key={index}>{step}</p>) : <p>No instructions provided by the source.</p>}</section></div>
    <div className="drink-actions">{saved ? <><span role="status">♥ In your saved drinks</span><button className="button small" disabled={busy} onClick={() => setConfirm(true)}>Remove saved drink</button></> : <button className="button primary" disabled={busy || !complete} onClick={onSave}>{busy ? 'Saving…' : '♡ Save drink'}</button>}<button className="button" disabled={!complete} onClick={download}>Download drink</button></div>
    {confirm && <div className="drink-remove-confirm"><p>Remove {drink.title} from your saved drinks?</p><button className="button danger" disabled={busy} onClick={onRemove}>Yes, remove drink</button><button className="button" disabled={busy} onClick={() => setConfirm(false)}>Keep drink</button></div>}
    </div></dialog>;
}

export default function Drinks() {
  const [tab, setTab] = useState('discover'), [query, setQuery] = useState(''), [alcohol, setAlcohol] = useState('all'), [rows, setRows] = useState([]), [saved, setSaved] = useState([]), [savedQuery, setSavedQuery] = useState('');
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(''), [busy, setBusy] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState(''), [searched, setSearched] = useState(false), [selected, setSelected] = useState(null);
  const controller = useRef(null), requestId = useRef(0), locked = useRef(false);
  useEffect(() => {
    const abort = new AbortController();
    api('/drinks', { signal: abort.signal }).then(setSaved).catch(e => { if (e.name !== 'AbortError') setLoadError(e.message); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, []);
  useEffect(() => () => { requestId.current++; controller.current?.abort(); }, []);
  async function retrySaved() {
    setLoading(true); setLoadError('');
    try { setSaved(await api('/drinks')); } catch (e) { setLoadError(e.message); } finally { setLoading(false); }
  }
  function cancelSearch() { controller.current?.abort(); requestId.current++; setBusy(false); setError(''); }
  function switchFilter(value) { cancelSearch(); setAlcohol(value); setRows([]); setSearched(false); }
  async function run({ drink, random = false } = {}) {
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort; const id = ++requestId.current;
    setBusy(true); setError(''); if (!drink) setRows([]);
    try {
      const path = drink ? `/drinks/discover/${drink.cocktaildb_id}` : random ? '/drinks/discover/random' : `/drinks/discover?q=${encodeURIComponent(query.trim())}&alcohol=${alcohol}`;
      const data = await api(path, { signal: abort.signal });
      if (id !== requestId.current) return;
      if (drink) setSelected(data); else { setRows(data); setSearched(true); }
    } catch (e) { if (id === requestId.current && e.name !== 'AbortError') setError(e.message); }
    finally { if (id === requestId.current) setBusy(false); }
  }
  const existing = drink => saved.find(row => row.cocktaildb_id === drink.cocktaildb_id);
  async function save() {
    if (locked.current) return; locked.current = true; setSaving(true); setError('');
    try {
      const drink = await api('/drinks', { method: 'POST', body: JSON.stringify({ cocktaildb_id: selected.cocktaildb_id }) });
      setSaved(current => [drink, ...current.filter(row => row.cocktaildb_id !== drink.cocktaildb_id)]); setSelected(drink);
    } catch (e) { setError(e.message); } finally { locked.current = false; setSaving(false); }
  }
  async function remove() {
    if (locked.current) return; const drink = existing(selected); if (!drink) return;
    locked.current = true; setSaving(true); setError('');
    try { await api(`/drinks/${drink.id}`, { method: 'DELETE' }); setSaved(current => current.filter(row => row.id !== drink.id)); setSelected(null); }
    catch (e) { setError(e.message); } finally { locked.current = false; setSaving(false); }
  }
  const visible = tab === 'discover' ? rows : saved.filter(drink => `${drink.title} ${drink.ingredients.map(i => i.name).join(' ')}`.toLowerCase().includes(savedQuery.toLowerCase()));
  return <section className="discover-page drinks-page"><div className="section-heading"><div><span className="eyebrow">FROM THE KITCHEN TO THE GLASS</span><h1>Something good to sip.</h1><p className="muted">Cocktails, refreshing mixers, and non-alcoholic favorites from <a href="https://www.thecocktaildb.com" target="_blank" rel="noreferrer">TheCocktailDB</a>. Find a drink and keep its recipe close.</p></div></div>
    <div className="category-tabs drink-tabs" aria-label="Drinks collection"><button className={tab === 'discover' ? 'selected' : ''} aria-pressed={tab === 'discover'} onClick={() => { cancelSearch(); setTab('discover'); }}>Find drinks</button><button className={tab === 'saved' ? 'selected' : ''} aria-pressed={tab === 'saved'} onClick={() => { cancelSearch(); setTab('saved'); }}>Saved drinks ({saved.length})</button></div>
    {loadError && <div className="error-banner" role="alert"><span>Could not load saved drinks: {loadError}</span><button className="button small" onClick={retrySaved}>Retry saved drinks</button></div>}
    {tab === 'discover' ? <form className="discovery-search" onSubmit={e => { e.preventDefault(); run(); }}><div className="discovery-filters"><label htmlFor="drink-type">Drink type<select id="drink-type" aria-label="Drink type" value={alcohol} onChange={e => switchFilter(e.target.value)}><option value="all">All drinks</option><option value="non-alcoholic">Non-alcoholic</option><option value="alcoholic">Alcoholic</option></select></label><label htmlFor="drink-query">Drink name<input id="drink-query" maxLength="100" value={query} onChange={e => setQuery(e.target.value)} placeholder="Try lemonade or margarita" /></label></div><div><button className="button primary" disabled={busy || (!query.trim() && alcohol === 'all')}>Search drinks</button>{alcohol === 'all' && <button className="button" type="button" disabled={busy} onClick={() => run({ random: true })}>Surprise me with a drink</button>}</div><p className="muted tiny">Search by name, or choose a drink type and leave the name blank to browse up to 100 drinks.</p></form> : <label className="search-box drink-saved-search">Search saved drinks<input aria-label="Search saved drinks" value={savedQuery} onChange={e => setSavedQuery(e.target.value)} placeholder="A drink or an ingredient…" /></label>}
    {busy && <p role="status">Finding something refreshing…</p>}{!selected && error && <p className="error-banner" role="alert">{error}</p>}
    {tab === 'saved' && loading ? <p role="status">Opening your drinks collection…</p> : <><div className="recipe-grid">{visible.map(drink => { const kept = existing(drink); return <article className="recipe-card" key={drink.cocktaildb_id}><div className="recipe-picture"><DrinkImage drink={drink} /></div><div className="recipe-card-copy"><div className="recipe-meta"><span>{drink.alcohol}</span><span>{kept ? 'Saved drink' : 'TheCocktailDB'}</span></div><h2 className="recipe-title">{drink.title}</h2><p>{[drink.category, drink.glass].filter(Boolean).join(' · ') || 'Preview the recipe and ingredients.'}</p><button className="button small" disabled={busy || loading || !!loadError} onClick={() => kept ? setSelected(kept) : run({ drink })}>{kept ? `Open saved drink ${drink.title}` : `Preview ${drink.title}`}</button></div></article>; })}</div>
    {!visible.length && !busy && !error && !loadError && <div className="empty"><h2>{tab === 'saved' ? saved.length ? 'No saved drinks match.' : 'Your drinks shelf is ready.' : searched ? 'No drinks found.' : 'A little inspiration for your glass.'}</h2><p>{tab === 'saved' ? 'Find a drink, preview its recipe, and save it here.' : searched ? 'Try another name or drink type.' : 'Search by name, browse non-alcoholic drinks, or try a surprise.'}</p></div>}</>}
    {selected && <DrinkDialog key={selected.cocktaildb_id} drink={selected} saved={!!existing(selected)} busy={saving} error={error} onClose={() => { setSelected(null); setError(''); }} onSave={save} onRemove={remove} />}
  </section>;
}
