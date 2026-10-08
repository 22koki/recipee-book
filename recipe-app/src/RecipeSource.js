import React from 'react';

export function sourceText(recipe) {
  if (recipe.wikibooks_id) return `Adapted from Wikibooks contributors: ${recipe.wikibooks_title}. Original revision: https://en.wikibooks.org/w/index.php?oldid=${recipe.wikibooks_revision}. Contributor history: https://en.wikibooks.org/w/index.php?curid=${recipe.wikibooks_id}&action=history. Recipe text is CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/. Measurements, serving information, or wording may have been adapted; shared adaptations retain this licence.`;
  return recipe.mealdb_id ? `Source: https://www.themealdb.com/meal/${recipe.mealdb_id}` : '';
}

export default function RecipeSource({ recipe }) {
  if (recipe.wikibooks_id) return <p className="source-credit">Adapted from <a href={`https://en.wikibooks.org/w/index.php?oldid=${recipe.wikibooks_revision}`} target="_blank" rel="noreferrer">Wikibooks contributors — view original</a> · <a href={`https://en.wikibooks.org/w/index.php?curid=${recipe.wikibooks_id}&action=history`} target="_blank" rel="noreferrer">Contributor history</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a><br /><span>Measurements, serving information, or wording may have been adapted. Keep this credit and licence when sharing the recipe.</span></p>;
  return recipe.mealdb_id ? <p className="source-credit">Recipe via <a href={`https://www.themealdb.com/meal/${recipe.mealdb_id}`} target="_blank" rel="noreferrer">TheMealDB — view original</a></p> : null;
}
