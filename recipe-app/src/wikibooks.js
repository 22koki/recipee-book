import { parseMeasure } from './mealdb';

export function wikiIngredient(line) {
  const source_measure = line.trim();
  const unknown = { name: source_measure, quantity: '', unit: 'whole', source_measure };
  // Ranges, containers, alternatives and approximate amounts need human review.
  if (/\d\s*[-–—]\s*\d|\([^)]*\d/.test(source_measure)) return unknown;
  const number = '(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?[¼½¾⅓⅔⅛⅜⅝⅞]?|[¼½¾⅓⅔⅛⅜⅝⅞])';
  const unit = '(?:kilograms?|kg|grams?|g|millilitres?|ml|litres?|l|teaspoons?|tsp\\.?|tablespoons?|tbsp\\.?|cups?|cloves?|slices?|whole|pounds?|lbs?|ounces?|oz)';
  const match = source_measure.match(new RegExp('^(' + number + ')\\s*(' + unit + ')\\s+(.+)$', 'i'));
  if (match) {
    const parsed = parseMeasure(match[1] + ' ' + match[2]);
    if (parsed.quantity !== '') return { name: match[3], ...parsed, source_measure };
  }
  const count = source_measure.match(new RegExp('^(' + number + ')\\s+(.+)$'));
  if (count && !/^(tins?|cans?|packets?|packages?|bunch(?:es)?|pinch(?:es)?|handfuls?|bags?|bottles?|leaves|sprigs?|stalks?|heads?|fluid|fl|pints?|pt|quarts?|qt|gallons?|gal|decilit(?:er|re)s?|dl|milliliters?|liters?|c|t|dessertspoons?|dsp)\b/i.test(count[2])) {
    const parsed = parseMeasure(count[1]);
    if (parsed.quantity !== '') return { name: count[2], ...parsed, source_measure };
  }
  return unknown;
}

export function wikiDraft(page) {
  return {
    title: page.title, description: 'A recipe from the Wikibooks Cookbook. Review quantities and preparation details before cooking.',
    category: 'Mains', art: 'pasta', time: '', servings: '', favorite: false,
    wikibooks_id: page.page_id, wikibooks_revision: page.revision, wikibooks_title: page.title,
    ingredients: page.ingredients.map(wikiIngredient), instructions: page.instructions,
    prevent_duplicate: true,
  };
}
