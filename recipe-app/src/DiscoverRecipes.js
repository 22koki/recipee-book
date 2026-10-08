import React, { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { mealDraft } from './mealdb';

export default function DiscoverRecipes({ onReview }) {
  const [query, setQuery] = useState(''), [meals, setMeals] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState(''), [searched, setSearched] = useState(false);
  const controller = useRef(null), requestId = useRef(0);
  useEffect(() => () => { requestId.current++; controller.current?.abort(); }, []);
  async function run(path, review = false) {
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    const id = ++requestId.current;
    setBusy(true); setError('');
    try {
      const data = await api(path, { signal: abort.signal });
      if (id !== requestId.current) return;
      if (review) onReview(mealDraft(data));
      else { setMeals(data); setSearched(true); }
    } catch (e) { if (id === requestId.current && e.name !== 'AbortError') setError(e.message); }
    finally { if (id === requestId.current) setBusy(false); }
  }
  return <section className="discover-page"><div className="section-heading"><div><span className="eyebrow">SOMETHING NEW FOR YOUR TABLE</span><h1>Find your next favorite.</h1><p className="muted">Explore recipes from <a href="https://www.themealdb.com" target="_blank" rel="noreferrer">TheMealDB</a>. Review the details before adding them to your cookbook.</p></div></div><form className="discovery-search" onSubmit={e => { e.preventDefault(); run('/discover?q=' + encodeURIComponent(query.trim())); }}><label htmlFor="discover-query">Search by dish name</label><div><input id="discover-query" value={query} maxLength="100" required onChange={e => setQuery(e.target.value)} placeholder="Try chicken, pasta, or curry" /><button className="button primary" disabled={busy || !query.trim()}>Search recipes</button><button type="button" className="button" disabled={busy} onClick={() => run('/discover/random')}>Surprise me</button></div></form>{busy && <p role="status">Finding something delicious…</p>}{error && <p className="error-banner" role="alert">{error}</p>}{!busy && !error && searched && !meals.length && <div className="empty"><h2>No dishes found.</h2><p>Try a different dish name. You can also add your own recipe.</p></div>}<div className="recipe-grid">{meals.map(meal => <article className="recipe-card" key={meal.idMeal}><div className="recipe-picture">{/^https:\/\/www\.themealdb\.com\/images\/media\/meals\/[^?#]+$/.test(meal.strMealThumb) && <img src={meal.strMealThumb} alt={meal.strMeal} loading="lazy" onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = '/art/pasta.svg'; }} />}</div><div className="recipe-card-copy"><div className="recipe-meta">{meal.strArea} · {meal.strCategory}</div><h2 className="recipe-title">{meal.strMeal}</h2><button className="button small" disabled={busy} onClick={() => run('/discover/' + encodeURIComponent(meal.idMeal), true)}>Review {meal.strMeal}</button></div></article>)}</div>{!searched && <div className="empty"><h2>A world of things to cook.</h2><p>Search for a dish or let us pick one to inspire you.</p></div>}</section>;
}
