import React, { useState } from 'react';

export default function RecipeImport({ busy, onImport }) {
  const [recipes, setRecipes] = useState([]), [error, setError] = useState('');
  async function choose(event) {
    const file = event.target.files?.[0];
    setRecipes([]); setError('');
    if (!file) return;
    try {
      if (file.size > 90000) throw new Error('Choose a recipe file smaller than 90 KB.');
      const data = JSON.parse(await file.text());
      const rows = Array.isArray(data) ? data : Array.isArray(data.recipes) ? data.recipes : data.title ? [data] : [];
      if (!rows.length || rows.length > 50 || rows.some(r => !r || typeof r !== 'object' || typeof r.title !== 'string')) throw new Error('Choose a file with 1–50 recipes exported from this cookbook.');
      setRecipes(rows);
    } catch (e) { setError(e instanceof SyntaxError ? 'This file is not a valid recipe file. Choose a JSON recipe export.' : e.message); }
    finally { event.target.value = ''; }
  }
  return <section className="recipe-import"><span className="eyebrow">MORE GOOD THINGS TO COOK</span><h2>Bring recipes to your table.</h2><p>Import a recipe file exported from another Everyday Table cookbook. You can import up to 50 at once. Your existing recipes stay in place; each imported recipe is a new copy.</p><label className="import-file">Choose recipe file<input aria-label="Choose recipe file" type="file" accept=".json,application/json" disabled={busy} onChange={choose} /></label>{error && <p role="alert">{error}</p>}{recipes.length > 0 && <><h3>{recipes.length} {recipes.length === 1 ? 'recipe' : 'recipes'} ready to add</h3><ul>{recipes.map((r, i) => <li key={i}>{r.title}</li>)}</ul><p className="muted tiny">Recipe details are checked before saving. Notes, ratings, and cooking history are not imported.</p><button className="button primary" disabled={busy} onClick={() => onImport(recipes)}>Add these recipes</button></>}</section>;
}
