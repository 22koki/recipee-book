import React from 'react';
import { artURL } from './api';

export default function RecipeList({ recipes, onOpen, onFavorite, busy }) {
  if (!recipes.length) return <div className="empty"><span aria-hidden="true">✳</span><h3>No recipes on this shelf.</h3><p>Try a different search or add a dish you love.</p></div>;
  return <div className="recipe-grid">{recipes.map(recipe => <article className="recipe-card" key={recipe.id}>
    <div className="recipe-picture"><button className="image-button" onClick={() => onOpen(recipe)} aria-label={`Open ${recipe.title}`}><img src={artURL(recipe)} alt={`Illustration of ${recipe.title}`} loading="lazy" /></button><span className="category-badge">{recipe.category}</span><button className={`save-button ${recipe.favorite ? 'saved' : ''}`} disabled={busy} onClick={() => onFavorite(recipe)} aria-label={`${recipe.favorite ? 'Unsave' : 'Save'} ${recipe.title}`} aria-pressed={recipe.favorite}>{recipe.favorite ? '♥' : '♡'}</button></div>
    <div className="recipe-card-copy"><div className="recipe-meta"><span>◷ {recipe.time} min</span><span>{recipe.servings} servings</span></div><button className="recipe-title" onClick={() => onOpen(recipe)}>{recipe.title}</button><p>{recipe.description}</p><button className="recipe-link" onClick={() => onOpen(recipe)}>Let’s cook <span aria-hidden="true">↗</span></button></div>
  </article>)}</div>;
}
