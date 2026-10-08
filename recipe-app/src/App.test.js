import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import RecipeList from './RecipeList';
import RecipeDetail from './RecipeDetail';
import RecipeForm from './RecipeForm';
import KitchenTools, { KitchenTimer } from './KitchenTools';
import { act } from '@testing-library/react';
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

test('notebook saves a rating and notes without changing recipe instructions', () => {
  const save = jest.fn(), cooked = jest.fn(), duplicate = jest.fn();
  render(<KitchenTools recipe={recipe} servings={2} onJournal={save} onCooked={cooked} onDuplicate={duplicate} />);
  expect(screen.getByRole('button', { name: 'Save notes & rating' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Kitchen notes'), { target: { value: 'More garlic next time.' } });
  fireEvent.change(screen.getByLabelText('My rating'), { target: { value: '4' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save notes & rating' }));
  expect(save).toHaveBeenCalledWith(recipe, { notes: 'More garlic next time.', rating: 4 });
  fireEvent.click(screen.getByRole('button', { name: 'I cooked this today' }));
  expect(cooked).toHaveBeenCalledWith(recipe);
  fireEvent.click(screen.getByRole('button', { name: 'Make my own version' }));
  expect(duplicate).toHaveBeenCalledWith(recipe);
});
test('timer pauses, resumes, finishes, and resets using elapsed time', () => {
  jest.useFakeTimers();
  render(<KitchenTimer />);
  fireEvent.change(screen.getByLabelText('Timer minutes'), { target: { value: '1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Start timer' }));
  act(() => jest.advanceTimersByTime(10000));
  expect(screen.getByLabelText('Time remaining')).toHaveTextContent('00:50');
  fireEvent.click(screen.getByRole('button', { name: 'Pause timer' }));
  act(() => jest.advanceTimersByTime(20000));
  expect(screen.getByLabelText('Time remaining')).toHaveTextContent('00:50');
  fireEvent.click(screen.getByRole('button', { name: 'Resume timer' }));
  act(() => jest.advanceTimersByTime(50000));
  expect(screen.getByText('Timer finished — check your dish.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reset timer' }));
  expect(screen.getByLabelText('Time remaining')).toHaveTextContent('00:00');
  jest.useRealTimers();
});
test('timer rejects zero minutes and invalid durations', () => {
  render(<KitchenTimer />);
  fireEvent.change(screen.getByLabelText('Timer minutes'), { target: { value: '0' } });
  expect(screen.getByRole('button', { name: 'Start timer' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Timer minutes'), { target: { value: '181' } });
  expect(screen.getByRole('button', { name: 'Start timer' })).toBeDisabled();
});
