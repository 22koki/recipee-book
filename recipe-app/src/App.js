import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import RecipeList from './RecipeList';
import RecipeDetail from './RecipeDetail';
import RecipeForm from './RecipeForm';
import RecipeImport from './RecipeImport';
import DiscoverRecipes from './DiscoverRecipes';
import { api, artURL, fallbackImage, quantity, weekDays } from './api';
import './App.css';

function Modal({ children, onClose, title }) {
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const node = dialog.current;
    node.showModal();
    return () => { node.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={dialog} className="modal" aria-label={title} onCancel={onClose}><button className="close-modal" aria-label="Close dialog" onClick={onClose}>×</button>{children}</dialog>;
}

export default function App() {
  const [recipes, setRecipes] = useState([]), [plan, setPlan] = useState([]), [shopping, setShopping] = useState([]);
  const [view, setView] = useState('recipes'), [query, setQuery] = useState(''), [category, setCategory] = useState('All recipes'), [sort, setSort] = useState('recent'), [quickOnly, setQuickOnly] = useState(false);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [toast, setToast] = useState('');
  const [modal, setModal] = useState(null), [offset, setOffset] = useState(0), [shoppingLoading, setShoppingLoading] = useState(false);
  const locked = useRef(false), toastTimer = useRef(null), header = useRef(null);
  const days = useMemo(() => weekDays(offset), [offset]);
  const load = useCallback(async () => {
    const [nextRecipes, nextPlan] = await Promise.all([api('/recipes'), api('/plan')]);
    setRecipes(nextRecipes); setPlan(nextPlan);
  }, []);
  useEffect(() => { load().catch(e => setError(e.message)).finally(() => setLoading(false)); return () => clearTimeout(toastTimer.current); }, [load]);
  useEffect(() => {
    let active = true;
    setShoppingLoading(true);
    api(`/shopping?start=${days[0].day}&end=${days[6].day}`).then(items => { if (active) setShopping(items); }).catch(e => { if (active) { setShopping([]); setError(e.message); } }).finally(() => { if (active) setShoppingLoading(false); });
    return () => { active = false; };
  }, [days, plan]);
  const notify = message => { setToast(message); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 4000); };
  async function change(action, message, after) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try { const result = await action(); await load(); after?.(result); notify(message); return true; }
    catch (e) { setError(e.message); return false; }
    finally { locked.current = false; setBusy(false); }
  }
  async function toggleShopping(item) {
    if (locked.current) return;
    const checked = !item.checked;
    setShopping(current => current.map(row => row.key === item.key ? { ...row, checked } : row));
    const saved = await change(() => api('/shopping/check', { method: 'PATCH', body: JSON.stringify({ key: item.key, checked }) }), checked ? 'One less thing to pick up.' : 'Added back to your list.');
    if (!saved) setShopping(current => current.map(row => row.key === item.key ? { ...row, checked: item.checked } : row));
  }
  function navigate(next) { setView(next); setError(''); setModal(null); }
  function closeModal() { setModal(null); setError(''); }
  const favorite = recipe => change(() => api(`/recipes/${recipe.id}/favorite`, { method: 'PATCH', body: JSON.stringify({ favorite: !recipe.favorite }) }), recipe.favorite ? 'Recipe removed from saved.' : 'A keeper. Recipe saved.');
  const importRecipes = rows => change(() => api('/recipes/import', { method: 'POST', body: JSON.stringify({ recipes: rows }) }), 'New recipes added to your table.', () => setModal(null));
  const saveJournal = (recipe, journal) => change(() => api(`/recipes/${recipe.id}/journal`, { method: 'PATCH', body: JSON.stringify(journal) }), 'Your kitchen notes are saved.');
  const markCooked = recipe => change(() => api(`/recipes/${recipe.id}/cooked`, { method: 'POST', body: '{}' }), 'Another good meal in the books.');
  const duplicateRecipe = recipe => {
    const copy = { ...recipe, title: `${recipe.title.slice(0, 88)} (my version)`, favorite: false };
    delete copy.id; delete copy.journal;
    return change(() => api('/recipes', { method: 'POST', body: JSON.stringify(copy) }), 'Your copy is ready to make your own.', saved => setModal({ type: 'form', id: saved.id }));
  };
  const saveRecipe = recipe => change(() => api(recipe.id ? `/recipes/${recipe.id}` : '/recipes', { method: recipe.id ? 'PUT' : 'POST', body: JSON.stringify(recipe) }), 'Your recipe is ready for the table.', saved => setModal({ type: 'detail', id: saved.id }));
  const deleteRecipe = recipe => change(() => api(`/recipes/${recipe.id}`, { method: 'DELETE' }), 'Recipe deleted and removed from your meal plan.', () => setModal(null));
  const setMeal = (recipeId, day, slot, servings) => change(() => api(`/plan/${day}/${slot}`, { method: 'PUT', body: JSON.stringify({ recipe_id: recipeId, servings }) }), `${slot} is on the menu.`);
  const removeMeal = (day, slot) => change(() => api(`/plan/${day}/${slot}`, { method: 'DELETE' }), 'Meal removed.');
  const visible = recipes.filter(r => (view !== 'saved' || r.favorite) && (!quickOnly || r.time <= 30) && (category === 'All recipes' || r.category === category) && `${r.title} ${r.description} ${r.ingredients.map(i => i.name).join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  if (sort === 'time') visible.sort((a, b) => a.time - b.time);
  if (sort === 'name') visible.sort((a, b) => a.title.localeCompare(b.title));
  if (sort === 'recent') visible.sort((a, b) => b.id - a.id);
  const selected = modal?.draft || (modal?.id ? recipes.find(r => r.id === modal.id) : null);
  const featured = recipes.find(r => r.art === 'pancakes') || recipes[0];
  const weekPlan = plan.filter(meal => meal.day >= days[0].day && meal.day <= days[6].day);
  const weekControl = <div className="week-control"><button aria-label="Previous week" onClick={() => setOffset(o => o - 1)}>←</button><span>{days[0].date} — {days[6].date}</span><button aria-label="Next week" onClick={() => setOffset(o => o + 1)}>→</button>{offset !== 0 && <button className="this-week" onClick={() => setOffset(0)}>This week</button>}</div>;
  function exportShopping() {
    const text = `THE EVERYDAY TABLE\nShopping list · ${days[0].day} to ${days[6].day}\n\n${shopping.map(item => `${item.checked ? '[x]' : '[ ]'} ${item.name}: ${quantity(item.quantity)} ${item.unit}`).join('\n')}`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `shopping-${days[0].day}.txt`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <><a className="skip-link" href="#main">Skip to content</a><header className="site-header" ref={header}><button className="brand" onClick={() => navigate('recipes')}><span className="brand-symbol" aria-hidden="true">✳</span><span>the everyday<br /><strong>table.</strong></span></button><nav aria-label="Main navigation">{[['recipes', 'Recipes'], ['saved', 'Saved recipes'], ['discover', 'Find recipes'], ['plan', 'Meal planner'], ['shopping', 'Shopping list']].map(([key, label]) => <button key={key} className={view === key ? 'active' : ''} aria-current={view === key ? 'page' : undefined} onClick={() => navigate(key)}>{label}</button>)}</nav><button className="button primary add-recipe" onClick={() => setModal({ type: 'form' })}>＋ Add recipe</button></header>
    <main id="main">{!modal && error && <div className="error-banner" role="alert"><strong>The kitchen needs a moment.</strong><span>{error}</span><button className="button small" onClick={() => { setLoading(true); setError(''); load().catch(e => setError(e.message)).finally(() => setLoading(false)); }}>Try again</button></div>}
    {loading ? <div className="empty loading" role="status">Setting the table…</div> : <>
    {view === 'recipes' && <section className="hero"><div className="hero-copy"><div className="eyebrow"><span className="small-star" aria-hidden="true">✳</span> GOOD FOOD. EVERYDAY MOMENTS.</div><h1>A little inspiration.<br />A lot of <em>flavor.</em></h1><p>For the meals you make on repeat, the recipes you’re<br className="desktop-break" /> still dreaming of, and the people around your table.</p><a className="button primary" href="#recipe-shelf">Find your next favorite <span aria-hidden="true">↗</span></a><div className="hero-footnote"><span aria-hidden="true">✶</span> Made for real kitchens and everyday cooks.</div></div><div className="hero-feature">{featured ? <button className="featured-button" onClick={() => setModal({ type: 'detail', id: featured.id })}><img src={artURL(featured)} onError={e => fallbackImage(e, featured)} alt={`${featured.image ? 'Photo' : 'Illustration'} of ${featured.title}`} /><span className="feature-tag">THIS MORNING’S LITTLE JOY</span><span className="featured-caption"><span><small>A SLOW MORNING FAVORITE</small><strong>{featured.title}</strong></span><span className="feature-arrow">↗</span></span></button> : <div className="empty"><p>Your next favorite starts with your first recipe.</p></div>}<span className="round-sticker" aria-hidden="true">a little<br /><em>homemade</em><br />happiness</span></div></section>}
    {(view === 'recipes' || view === 'saved') && <><section className="collection-stats" aria-label="Cookbook summary"><span><strong>{recipes.length}</strong> recipes to come home to</span><span><strong>{recipes.filter(r => r.favorite).length}</strong> tried-and-loved keepers</span><span><strong>{weekPlan.length}</strong> meals planned this week</span><span className="stats-note">A little less “what’s for dinner?” ↗</span></section><section className="recipe-shelf" id="recipe-shelf"><div className="section-heading"><div><span className="eyebrow">{view === 'saved' ? 'THE ONES YOU LOVE' : 'FROM YOUR RECIPE SHELF'}</span><h2>{view === 'saved' ? 'Worth making again.' : 'What sounds good today?'}</h2><p className="muted">{view === 'saved' ? 'Your favorites, all in one little place.' : 'A collection of good things. Find something to make your own.'}</p></div><label className="search-box"><span aria-hidden="true">⌕</span><input aria-label="Search recipes" value={query} onChange={e => setQuery(e.target.value)} placeholder="A dish, an ingredient, a craving…" /></label></div><div className="shelf-toolbar"><div className="category-tabs" aria-label="Recipe categories">{['All recipes', 'Breakfast', 'Mains', 'Soups', 'Salads', 'Snacks', 'Desserts'].map(c => <button className={category === c ? 'selected' : ''} aria-pressed={category === c} onClick={() => setCategory(c)} key={c}>{c}</button>)}</div><button className="button small" onClick={() => setModal({ type: 'import' })}>Import recipes</button><label className="quick-filter"><input type="checkbox" checked={quickOnly} onChange={e => setQuickOnly(e.target.checked)} />30 minutes or less</label><label className="sort-label">Sort <select value={sort} onChange={e => setSort(e.target.value)}><option value="recent">Newest first</option><option value="time">Quickest first</option><option value="name">Name A–Z</option></select></label></div><RecipeList recipes={visible} onOpen={r => setModal({ type: 'detail', id: r.id })} onFavorite={favorite} busy={busy} /></section><section className="planner-promo"><span className="promo-doodle" aria-hidden="true">✳</span><div><span className="eyebrow">A LITTLE PLANNING GOES A LONG WAY</span><h2>Good weeks start at the table.</h2><p>Pick your meals. We’ll gather the ingredients into one handy shopping list.</p></div><button className="button primary" onClick={() => navigate('plan')}>Plan something delicious ↗</button></section></>}
    {view === 'discover' && <DiscoverRecipes recipes={recipes} onOpen={recipe => setModal({ type: 'detail', id: recipe.id })} onReview={draft => setModal({ type: 'form', draft })} />}
    {view === 'plan' && <section className="planning-page"><div className="section-heading"><div><span className="eyebrow">MAKE ROOM FOR GOOD FOOD</span><h1>Your week, well fed.</h1><p className="muted">A little plan for the meals ahead. One recipe per meal; adding another replaces it.</p></div>{weekControl}</div><div className="planner-grid">{days.map(d => <section className="day-card" key={d.day}><div className="day-heading"><h2>{d.label}</h2><span>{d.date}</span></div>{['Breakfast', 'Lunch', 'Dinner'].map(slot => { const meal = plan.find(m => m.day === d.day && m.slot === slot); const r = recipes.find(r => r.id === meal?.recipe_id); return <div className="meal-slot" key={slot}><label htmlFor={`${d.day}-${slot}`}>{slot}</label>{r && <img src={artURL(r)} onError={e => fallbackImage(e, r)} alt="" />}<select id={`${d.day}-${slot}`} aria-label={`${d.label} ${slot} recipe`} value={r?.id || ''} disabled={busy} onChange={e => e.target.value ? setMeal(Number(e.target.value), d.day, slot, recipes.find(r => r.id === Number(e.target.value)).servings) : removeMeal(d.day, slot)}><option value="">＋ Choose a recipe</option>{recipes.map(r => <option value={r.id} key={r.id}>{r.title}</option>)}</select>{r && <div className="meal-controls"><label>Servings<select aria-label={`${d.label} ${slot} servings`} disabled={busy} value={meal.servings} onChange={e => setMeal(r.id, d.day, slot, Number(e.target.value))}>{Array.from({ length: 24 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label><button disabled={busy} className="text-button" onClick={() => removeMeal(d.day, slot)} aria-label={`Remove ${d.label} ${slot}`}>Remove</button></div>}</div>; })}</section>)}</div><div className="plan-summary"><p><strong>{weekPlan.length}</strong> meals planned · {shopping.length} ingredients on your list</p><button className="button primary" onClick={() => navigate('shopping')}>See my shopping list ↗</button></div></section>}
    {view === 'shopping' && <section className="shopping-page"><div className="section-heading"><div><span className="eyebrow">FROM YOUR PLAN TO YOUR PANTRY</span><h1>A little list. A good week.</h1><p className="muted">Ingredients combined from this week’s meals, adjusted to your planned servings.</p></div>{weekControl}</div>{shoppingLoading ? <p role="status" className="empty">Gathering your ingredients…</p> : shopping.length ? <div className="shopping-layout"><div className="shopping-items">{shopping.map(item => <label key={item.key} className={`shopping-item ${item.checked ? 'checked' : ''}`}><input type="checkbox" checked={item.checked} disabled={busy} onChange={() => toggleShopping(item)} /><span>{item.name}</span><strong>{quantity(item.quantity)} {item.unit}</strong></label>)}</div><aside className="shopping-aside"><span className="eyebrow">YOUR MARKET COMPANION</span><h2>{shopping.filter(i => i.checked).length} of {shopping.length}<br />picked up.</h2><p>Identical names and units are combined. Different units stay separate so you can check them before shopping.</p><button className="button primary full" onClick={exportShopping}>Download my list ↓</button><button className="text-button" onClick={() => navigate('plan')}>Back to meal planner</button></aside></div> : <div className="empty"><span aria-hidden="true">✳</span><h2>Your basket starts with a plan.</h2><p>Add a meal to this week and we’ll gather what you need.</p><button className="button primary" onClick={() => navigate('plan')}>Plan my first meal ↗</button></div>}</section>}
    </>}
    </main><footer><button className="brand" onClick={() => navigate('recipes')}>✳ the everyday table.</button><p>Good food tastes better when it feels like home.</p><span>A personal cookbook, made with care.</span></footer>
    {modal && <Modal onClose={closeModal} title={modal.type === 'import' ? 'Import recipes' : modal.type === 'form' ? selected?.id ? 'Edit recipe' : (selected?.mealdb_id || selected?.wikibooks_id) ? 'Review imported recipe' : 'Add recipe' : selected?.title || 'Recipe'}>{error && <div className="modal-error" role="alert">{error}</div>}{modal.type === 'import' ? <RecipeImport busy={busy} onImport={importRecipes} /> : modal.type === 'form' ? <RecipeForm key={modal.id || modal.draft?.mealdb_id || modal.draft?.wikibooks_id || 'new'} recipe={selected} busy={busy} onSubmit={saveRecipe} /> : selected && <RecipeDetail key={selected.id} recipe={selected} busy={busy} onFavorite={favorite} onEdit={r => setModal({ type: 'form', id: r.id })} onDelete={deleteRecipe} onPlan={setMeal} onJournal={saveJournal} onCooked={markCooked} onDuplicate={duplicateRecipe} />}</Modal>}
    <div className={`toast ${toast ? 'visible' : ''}`} role="status" aria-live="polite">{toast}</div>
  </>;
}
