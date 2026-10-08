import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DiscoverRecipes from './DiscoverRecipes';
import RecipeSource, { sourceText } from './RecipeSource';
import { wikiIngredient, wikiDraft } from './wikibooks';
import { api } from './api';
jest.mock('./api', () => ({ api: jest.fn() }));

afterEach(() => jest.clearAllMocks());
const page = { page_id: '123', revision: '456', title: 'Community rice', ingredients: ['1/2 cup rice', 'Salt to taste'], instructions: ['Cook rice.', 'Serve.'] };

test.each([['2 cups rice', 'rice', 2, 'cup'], ['¼ tsp salt', 'salt', 0.25, 'tsp'], ['2 eggs', 'eggs', 2, 'whole']])('extracts explicit Wikibooks ingredient %s', (line, name, quantity, unit) => {
  expect(wikiIngredient(line)).toEqual({ name, quantity, unit, source_measure: line });
});
test.each(['Salt to taste', '1–2 cloves garlic', '1 tin tomatoes', '1 lb (450 g) pasta'])('keeps uncertain ingredient %s for review', line => {
  expect(wikiIngredient(line).quantity).toBe('');
  expect(wikiIngredient(line).source_measure).toBe(line);
});
test('drafts retain revision and complete original text without guessed metadata', () => {
  const draft = wikiDraft(page);
  expect(draft.wikibooks_revision).toBe('456');
  expect(draft.time).toBe(''); expect(draft.servings).toBe('');
  expect(draft.ingredients[1].name).toBe('Salt to taste');
  expect(draft.prevent_duplicate).toBe(true);
});
test('source credit includes original revision, contributor history and licence', () => {
  const draft = wikiDraft(page);
  render(<RecipeSource recipe={draft} />);
  expect(screen.getByRole('link', { name: 'Wikibooks contributors — view original' })).toHaveAttribute('href', 'https://en.wikibooks.org/w/index.php?oldid=456');
  expect(screen.getByRole('link', { name: 'CC BY-SA 4.0' })).toBeInTheDocument();
  expect(sourceText(draft)).toContain('curid=123&action=history');
  expect(sourceText(draft)).toContain('shared adaptations retain this licence');
});
test('combined search keeps available results when one provider fails', async () => {
  api.mockImplementation(path => path.startsWith('/discover/wikibooks') ? Promise.reject(new Error('Wikibooks offline')) : Promise.resolve([{ idMeal: '123', strMeal: 'MealDB rice' }]));
  render(<DiscoverRecipes />);
  fireEvent.change(screen.getByLabelText('Search by dish name'), { target: { value: 'rice' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search recipes' }));
  expect(await screen.findByRole('button', { name: 'Review MealDB rice' })).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Wikibooks offline');
});
test('source-specific search previews before saving and opens already saved recipes', async () => {
  api.mockImplementation(path => path.endsWith('/123') ? Promise.resolve(page) : Promise.resolve([{ page_id: '123', title: 'Community rice' }]));
  const review = jest.fn(), open = jest.fn();
  const { rerender } = render(<DiscoverRecipes onReview={review} />);
  fireEvent.change(screen.getByLabelText('Recipe source'), { target: { value: 'wikibooks' } });
  fireEvent.change(screen.getByLabelText('Search by dish name'), { target: { value: 'rice' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search recipes' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Review Community rice' }));
  await waitFor(() => expect(review).toHaveBeenCalledWith(expect.objectContaining({ wikibooks_id: '123', time: '', servings: '' })));
  const saved = { id: 9, wikibooks_id: '123', title: 'Community rice' };
  rerender(<DiscoverRecipes onReview={review} onOpen={open} recipes={[saved]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Open saved Community rice' }));
  expect(open).toHaveBeenCalledWith(saved);
  expect(api.mock.calls.every(call => !call[1]?.method)).toBe(true);
});
