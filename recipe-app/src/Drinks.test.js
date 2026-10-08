import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Drinks from './Drinks';
import { api } from './api';
jest.mock('./api', () => ({ api: jest.fn() }));
const drink = { cocktaildb_id: '11007', title: 'Margarita', alcohol: 'Alcoholic', glass: 'Cocktail glass', category: 'Cocktail', ingredients: [{ name: 'Tequila', measure: '1 1/2 oz' }, { name: 'Salt', measure: '' }], instructions: 'Shake and serve.', image: '' };
beforeAll(() => { HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); }; HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); }; });
beforeEach(() => api.mockReset());
async function search() {
  fireEvent.change(screen.getByLabelText('Drink name'), { target: { value: 'Margarita' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search drinks' }));
  await screen.findByRole('button', { name: 'Preview Margarita' });
}
test('searches, looks up full details, preserves unknown measures and saves', async () => {
  api.mockImplementation(path => Promise.resolve(path === '/drinks' ? [] : path.includes('discover/11007') ? drink : [drink]));
  render(<Drinks />); await search();
  fireEvent.click(screen.getByRole('button', { name: 'Preview Margarita' }));
  await screen.findByRole('dialog');
  expect(screen.getByText('1 1/2 oz')).toBeInTheDocument(); expect(screen.getByText('Amount not specified')).toBeInTheDocument();
  api.mockResolvedValueOnce({ ...drink, id: 1 });
  fireEvent.click(screen.getByRole('button', { name: '♡ Save drink' }));
  await screen.findByText('♥ In your saved drinks');
  expect(api).toHaveBeenLastCalledWith('/drinks', { method: 'POST', body: JSON.stringify({ cocktaildb_id: '11007' }) });
  expect(screen.getByRole('button', { name: 'Saved drinks (1)' })).toBeInTheDocument();
});
test('non-alcoholic browse passes the filter and hides unrestricted random', async () => {
  api.mockResolvedValue([]); render(<Drinks />);
  fireEvent.change(screen.getByLabelText('Drink type'), { target: { value: 'non-alcoholic' } });
  expect(screen.queryByText('Surprise me with a drink')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Search drinks' }));
  await screen.findByText('No drinks found.');
  expect(api).toHaveBeenLastCalledWith('/drinks/discover?q=&alcohol=non-alcoholic', expect.any(Object));
});
test('saved collection opens offline, filters ingredients, and confirms removal', async () => {
  api.mockResolvedValue([{ ...drink, id: 4 }]); render(<Drinks />);
  fireEvent.click(await screen.findByRole('button', { name: 'Saved drinks (1)' }));
  fireEvent.change(screen.getByLabelText('Search saved drinks'), { target: { value: 'tequila' } });
  fireEvent.click(screen.getByRole('button', { name: 'Open saved drink Margarita' }));
  expect(api).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Remove saved drink' }));
  fireEvent.click(screen.getByRole('button', { name: 'Keep drink' }));
  expect(screen.queryByText('Yes, remove drink')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Remove saved drink' }));
  api.mockResolvedValueOnce(null);
  fireEvent.click(screen.getByRole('button', { name: 'Yes, remove drink' }));
  await screen.findByText('Your drinks shelf is ready.');
  expect(api).toHaveBeenLastCalledWith('/drinks/4', { method: 'DELETE' });
});
test('a provider outage leaves saved drinks usable', async () => {
  api.mockImplementation(path => path === '/drinks' ? Promise.resolve([{ ...drink, id: 4 }]) : Promise.reject(new Error('Provider offline')));
  render(<Drinks />); await screen.findByRole('button', { name: 'Saved drinks (1)' });
  fireEvent.change(screen.getByLabelText('Drink name'), { target: { value: 'Margarita' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search drinks' }));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Saved drinks (1)' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open saved drink Margarita' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
test('filter changes ignore a late search response', async () => {
  let resolve; api.mockImplementation(path => path === '/drinks' ? Promise.resolve([]) : new Promise(done => { resolve = done; }));
  render(<Drinks />);
  fireEvent.change(screen.getByLabelText('Drink name'), { target: { value: 'Margarita' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search drinks' }));
  fireEvent.change(screen.getByLabelText('Drink type'), { target: { value: 'non-alcoholic' } });
  await act(async () => { resolve([drink]); });
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Preview Margarita' })).not.toBeInTheDocument());
});
