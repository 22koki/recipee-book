export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || 'The kitchen is unreachable. Check that the Flask server is running.');
  if (data === null) throw new Error('The server returned an unexpected response.');
  return data;
}
export const artURL = recipe => recipe.image || `${process.env.PUBLIC_URL}/art/${recipe.art}.svg`;
export const fallbackImage = (event, recipe) => { event.currentTarget.onerror = null; event.currentTarget.src = `${process.env.PUBLIC_URL}/art/${recipe.art}.svg`; };
export const quantity = value => Number(value.toFixed(3)).toLocaleString();
export const localDay = value => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
export function weekDays(offset = 0) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (today.getDay() + 6) % 7 + offset * 7);
  return Array.from({ length: 7 }, (_, i) => { const date = new Date(start); date.setDate(start.getDate() + i); return { day: localDay(date), label: date.toLocaleDateString(undefined, { weekday: 'short' }), date: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }; });
}
