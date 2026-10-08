const aliases = { g: 'g', gram: 'g', grams: 'g', kg: 'kg', kilogram: 'kg', kilograms: 'kg', ml: 'ml', millilitre: 'ml', millilitres: 'ml', l: 'l', litre: 'l', litres: 'l', tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp', tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', cup: 'cup', cups: 'cup', clove: 'clove', cloves: 'clove', slice: 'slice', slices: 'slice', whole: 'whole' };
export function parseMeasure(measure) {
  let value = String(measure || '').trim().toLowerCase().replace(/\b(tsp|tbsp)\./g, '$1');
  const fractions = { '¼': '1/4', '½': '1/2', '¾': '3/4', '⅓': '1/3', '⅔': '2/3', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8' };
  value = value.replace(/[¼½¾⅓⅔⅛⅜⅝⅞]/g, fraction => ' ' + fractions[fraction]).trim();
  const match = value.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s*([a-z]*)$/);
  if (!match) return { quantity: '', unit: 'whole' };
  const parts = match[1].split(/\s+/);
  const amount = token => { const [n, d] = token.split('/').map(Number); return d === undefined ? n : d === 0 ? NaN : n / d; };
  let quantity = parts.reduce((sum, token) => sum + amount(token), 0);
  let unit = aliases[match[2]] || (match[2] === '' ? 'whole' : '');
  if (['lb', 'lbs', 'pound', 'pounds'].includes(match[2])) { quantity *= 453.59237; unit = 'g'; }
  if (['oz', 'ounce', 'ounces'].includes(match[2])) { quantity *= 28.349523125; unit = 'g'; }
  if (!unit || !Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) return { quantity: '', unit: 'whole' };
  return { quantity: Number(quantity.toFixed(3)), unit };
}
export function mealDraft(meal) {
  const ingredients = [];
  for (let i = 1; i <= 20; i++) {
    const name = (meal['strIngredient' + i] || '').trim();
    if (name) ingredients.push({ name, ...parseMeasure(meal['strMeasure' + i]), source_measure: (meal['strMeasure' + i] || '').trim().slice(0, 100) });
  }
  const category = ({ Dessert: 'Desserts', Breakfast: 'Breakfast', Starter: 'Snacks' })[meal.strCategory] || 'Mains';
  const image = /^https:\/\/www\.themealdb\.com\/images\/media\/meals\/[^?#]+$/.test(meal.strMealThumb || '') ? meal.strMealThumb : '';
  return {
    title: meal.strMeal, description: [meal.strArea, meal.strCategory, 'Recipe from TheMealDB.'].filter(Boolean).join(' · '),
    category, art: category === 'Desserts' ? 'cookies' : category === 'Breakfast' ? 'pancakes' : 'pasta',
    time: '', servings: '', favorite: false, mealdb_id: meal.idMeal, image, prevent_duplicate: true,
    ingredients: ingredients.length ? ingredients : [{ name: '', quantity: '', unit: 'whole', source_measure: '' }],
    instructions: (meal.strInstructions || '').split(/\r?\n+/).map(s => s.trim()).filter(Boolean),
  };
}
