import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import RecipeList from './RecipeList';
import RecipeDetail from './RecipeDetail';
import RecipeForm from './RecipeForm';
const recipe = { id: 1, title: 'Test pasta', description: 'A good bowl.', category: 'Mains', time: 20, servings: 2, art: 'pasta', favorite: false, ingredients: [{ name: 'pasta', quantity: 100, unit: 'g' }], instructions: ['Cook pasta.', 'Serve it.'] };
test('recipe list renders a finite collection and opens the selected recipe', () => {
  const open = jest.fn(), save = jest.fn();
  render(<RecipeList recipes={[recipe]} onOpen={open} onFavorite={save} busy={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Open Test pasta' }));
  expect(open).toHaveBeenCalledWith(recipe);
  fireEvent.click(screen.getByRole('button', { name: 'Save Test pasta' }));
  expect(save).toHaveBeenCalledWith(recipe);
});
test('recipe details scale ingredient quantities and preserve cooking steps', () => {
  const plan = jest.fn();
  render(<RecipeDetail recipe={recipe} onPlan={plan} />);
  fireEvent.click(screen.getByRole('button', { name: 'Increase servings' }));
  expect(screen.getByTestId('ingredient-quantity')).toHaveTextContent('150 g');
  expect(screen.getByText('Cook pasta.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Mark step 1 complete' }));
  expect(screen.getByRole('button', { name: 'Mark step 1 incomplete' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Add to meal plan ↗' }));
  expect(plan).toHaveBeenCalledWith(1, expect.any(String), 'Dinner', 3);
});
test('recipe form supports editing and submits structured ingredient data', () => {
  const save = jest.fn();
  render(<RecipeForm recipe={recipe} onSubmit={save} busy={false} />);
  fireEvent.change(screen.getByLabelText('Recipe name'), { target: { value: 'Updated pasta' } });
  fireEvent.click(screen.getByRole('button', { name: '＋ Add ingredient' }));
  fireEvent.change(screen.getByLabelText('Ingredient 2 name'), { target: { value: 'tomatoes' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes ↗' }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ title: 'Updated pasta', ingredients: [{ name: 'pasta', quantity: 100, unit: 'g' }, { name: 'tomatoes', quantity: 1, unit: 'g' }] }));
});
test('empty collections show a useful empty state', () => {
  render(<RecipeList recipes={[]} />);
  expect(screen.getByText('No recipes on this shelf.')).toBeInTheDocument();
});
