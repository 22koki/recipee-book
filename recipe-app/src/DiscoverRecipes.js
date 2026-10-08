import React, { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { mealDraft } from './mealdb';
import { wikiDraft } from './wikibooks';

const mealResult = meal => ({ provider: 'mealdb', id: meal.idMeal, title: meal.strMeal, subtitle: [meal.strArea, meal.strCategory].filter(Boolean).join(' · '), image: /^https:\/\/www\.themealdb\.com\/images\/media\/meals\/[^?#]+$/.test(meal.strMealThumb || '') ? meal.strMealThumb : '' });
const wikiResult = page => ({ provider: 'wikibooks', id: page.page_id, title: page.title, subtitle: 'Wikibooks Cookbook · CC BY-SA 4.0', image: '' });

export default function DiscoverRecipes({ onReview, recipes = [], onOpen }) {
  const [query, setQuery] = useState(''), [source, setSource] = useState('all'), [meals, setMeals] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState(''), [searched, setSearched] = useState(false);
  const controller = useRef(null), requestId = useRef(0);
  useEffect(() => () => { requestId.current++; controller.current?.abort(); }, []);
  function switchSource(value) {
    controller.current?.abort(); requestId.current++;
    setSource(value); setMeals([]); setError(''); setSearched(false); setBusy(false);
  }
  async function run({ review, random = false } = {}) {
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    const id = ++requestId.current;
    setBusy(true); setError('');
    try {
      if (review) {
        const path = review.provider === 'wikibooks' ? '/discover/wikibooks/' : '/discover/';
        const data = await api(path + encodeURIComponent(review.id), { signal: abort.signal });
        if (id === requestId.current) onReview(review.provider === 'wikibooks' ? wikiDraft(data) : mealDraft(data));
      } else {
        const providers = random ? ['mealdb'] : source === 'all' ? ['mealdb', 'wikibooks'] : [source];
        const outcomes = await Promise.allSettled(providers.map(async provider => {
          const path = random ? '/discover/random' : provider === 'wikibooks' ? '/discover/wikibooks?q=' : '/discover?q=';
          const data = await api(path + (random ? '' : encodeURIComponent(query.trim())), { signal: abort.signal });
          return data.map(provider === 'wikibooks' ? wikiResult : mealResult);
        }));
        if (id !== requestId.current) return;
        const rows = outcomes.flatMap(result => result.status === 'fulfilled' ? result.value : []);
        const warnings = outcomes.flatMap((result, index) => result.status === 'rejected' && result.reason.name !== 'AbortError' ? [`${providers[index] === 'wikibooks' ? 'Wikibooks' : 'TheMealDB'}: ${result.reason.message}`] : []);
        setMeals(rows); setSearched(true); setError(warnings.join(' '));
      }
    } catch (e) { if (id === requestId.current && e.name !== 'AbortError') setError(e.message); }
    finally { if (id === requestId.current) setBusy(false); }
  }
  function existing(meal) { return recipes.find(recipe => String(meal.provider === 'wikibooks' ? recipe.wikibooks_id : recipe.mealdb_id) === meal.id); }
  return <section className="discover-page"><div className="section-heading"><div><span className="eyebrow">SOMETHING NEW FOR YOUR TABLE</span><h1>Find your next favorite.</h1><p className="muted">Explore <a href="https://www.themealdb.com" target="_blank" rel="noreferrer">TheMealDB</a> and <a href="https://en.wikibooks.org/wiki/Cookbook:Recipes" target="_blank" rel="noreferrer">Wikibooks Cookbook</a>. Review ingredients and preparation details before adding a recipe.</p></div></div><form className="discovery-search" onSubmit={e => { e.preventDefault(); run(); }}><div className="discovery-filters"><label htmlFor="discover-source">Recipe source<select aria-label="Recipe source" id="discover-source" value={source} onChange={e => switchSource(e.target.value)}><option value="all">All sources</option><option value="mealdb">TheMealDB</option><option value="wikibooks">Wikibooks</option></select></label><label htmlFor="discover-query">Search by dish name<input id="discover-query" value={query} maxLength="100" required onChange={e => setQuery(e.target.value)} placeholder="Try chicken, pasta, or curry" /></label></div><div><button className="button primary" disabled={busy || !query.trim()}>Search recipes</button>{source !== 'wikibooks' && <button type="button" className="button" disabled={busy} onClick={() => run({ random: true })}>Surprise me</button>}</div>{source === 'all' && <p className="muted tiny">Surprise me selects a dish from TheMealDB. Search checks both collections.</p>}</form>{busy && <p role="status">Finding something delicious…</p>}{error && <p className="error-banner" role="alert">{error}{meals.length > 0 ? ' Results from the available source are shown below.' : ''}</p>}{!busy && !error && searched && !meals.length && <div className="empty"><h2>No dishes found.</h2><p>Try a different dish name. You can also add your own recipe.</p></div>}<div className="recipe-grid">{meals.map(meal => { const saved = existing(meal); return <article className="recipe-card" key={meal.provider + ':' + meal.id}><div className="recipe-picture">{meal.image ? <img src={meal.image} alt={meal.title} loading="lazy" onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = '/art/pasta.svg'; }} /> : <div className="wiki-recipe-cover"><span aria-hidden="true">✳</span><p>A page from<br />Wikibooks Cookbook</p></div>}</div><div className="recipe-card-copy"><div className="recipe-meta"><span>{meal.provider === 'wikibooks' ? 'Wikibooks' : 'TheMealDB'}</span><span>{saved ? 'In your cookbook' : 'Ready to explore'}</span></div><h2 className="recipe-title">{meal.title}</h2><p>{meal.subtitle}</p><button className="button small" disabled={busy} onClick={() => saved ? onOpen?.(saved) : run({ review: meal })}>{saved ? `Open saved ${meal.title}` : `Review ${meal.title}`}</button></div></article>; })}</div>{!searched && <div className="empty"><h2>A world of things to cook.</h2><p>Search for a dish or select a recipe source to explore.</p></div>}</section>;
}
