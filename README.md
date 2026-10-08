# The Everyday Table

A working personal cookbook built with React, Flask, and SQLite. This completes the unfinished `recipee-book` project: the recursive recipe list, missing detail props, empty form, and disconnected backend are replaced with a complete recipe and meal-planning flow.

## What you can do

- Browse eight complete starter recipes with bundled dish illustrations, ingredient quantities, and cooking steps.
- Search recipes by title, description, or ingredient; filter categories; sort by name, cooking time, or newest.
- Add, edit, delete, and save recipes. Deletes require confirmation and also remove planned meals using that recipe.
- Adjust recipe servings from 1 to 24 and scale displayed ingredient quantities.
- Tick off cooking steps while the recipe is open.
- Plan breakfast, lunch, and dinner for any week, with a serving count for each meal.
- Generate a shopping list for the selected week, combining matching ingredient names and units after serving adjustments.
- Save shopping checkmarks and download a text list.
- Keep recipes, favorites, meal plans, and shopping checkmarks in SQLite across browser reloads and server restarts.

All starter artwork is local SVG. The app works without recipe API keys or remote image services.

## Setup

Requires Python 3.10+ and Node.js 20+.

From the repository root, create a fresh virtual environment and install the backend dependencies:

```sh
python -m venv .venv
```

On Windows PowerShell, activation is optional. Use the environment's Python directly:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m flask --app backend.app:create_app run --port 5000
```

On macOS/Linux:

```sh
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m flask --app backend.app:create_app run --port 5000
```

Leave the backend running. In a second terminal:

```sh
cd recipe-app
npm ci
npm start
```

Open http://localhost:3000. The React development server proxies `/api` to http://127.0.0.1:5000, so no CORS configuration is needed.

## One-server build

Build the React app:

```sh
cd recipe-app
npm ci
npm run build
```

Return to the repository root and start Flask with the command above. Open http://127.0.0.1:5000: Flask serves both the built frontend and `/api` from the same origin.

This is a **personal, single-user cookbook**, with no account system. The local commands bind to localhost. Public hosting requires authentication/access control, a production WSGI server, and persistent storage for SQLite. GitHub Pages alone cannot run the Flask API. The current change does not publish a live site.

## Data behavior

The default database is `instance/recipes.sqlite3`, ignored by Git. Set `RECIPE_DATABASE` to a different SQLite file path if needed. Back up that file to keep your cookbook. Starter recipes seed only on the first database initialization; deleting every recipe does not cause them to reappear after restart. There is no migration of the old nonfunctional Flask scaffolds, which did not have a usable configured database.

A meal slot holds one recipe. Assigning another replaces it. Deleting a recipe removes its meal slots. Shopping sums recipes inside the selected Monday–Sunday week only. Matching ingredient names are case-insensitive; units must match exactly. For example, `rice / g` and `rice / cup` stay separate. There is no gram-to-cup conversion. Shopping checkmarks are shared across weeks for the same ingredient name and unit, which is useful for ingredients you already have at home; untick them when you need to buy more.

Serving adjustments change ingredient quantities, not written instructions or cooking time. Cooking-step checkmarks last only while the detail view is open. SQLite data is shared by browsers using the same server; browser storage is not the source of truth.

## Validation and tests

From the repository root, using the environment's Python:

```sh
python -m unittest discover -s tests -v
```

React tests:

```sh
npm --prefix recipe-app test -- --watchAll=false --runInBand
```

Browser tests exercise the built frontend against a real Flask API. Use a fresh temporary database for these tests so your personal recipes are untouched:

```sh
npm install
npx playwright install chromium
```

Build the React app, start Flask with `RECIPE_DATABASE` pointing to a fresh test file, then run:

```sh
npm run test:browser
```

The default test URL is http://127.0.0.1:5000. Override it with `TEST_BASE_URL`. Screenshots go to `test-results/`. GitHub Actions runs API tests, React tests, the production build, and Chromium browser checks, including 320/390/768/1440px layouts.

## Layout

- `backend/app.py`: app factory, validated JSON API, SQLite persistence, frontend serving.
- `backend/seed.json`: eight full starter recipes.
- `recipe-app/src/`: React screens and API client.
- `recipe-app/public/art/`: eight bundled dish illustrations.
- `tests/`: backend and real-browser regression checks.

Duplicated incomplete frontend/backend scaffolds and the previously committed virtual environment are removed from the working tree. Their original source remains in Git history. Create `.venv` on your own machine rather than reusing a copied environment.

## Recipe notebook and collection additions

- Save a personal 0–5 star rating (0 means unrated) and kitchen notes up to 2,000 characters per recipe.
- Record each cooking session with **I cooked this today**; see the total and last cooking date. Dates use the server's calendar date.
- Use a 1–180 minute kitchen timer with pause, resume, reset, and an on-screen completion message. It runs only while that recipe is open; it uses elapsed wall-clock time rather than counting interval callbacks.
- Duplicate a recipe with **Make my own version**. A new recipe is saved immediately and opens for editing; the original recipe stays in place. Notes, ratings, and cooking history stay with the original.
- Download a readable recipe using the selected serving count, including your saved notes.
- Export a portable JSON recipe file, keeping its original serving size and excluding personal notes/history.
- Add recipes manually with **Add recipe**, or use **Import recipes** to preview and add 1–50 exported recipes at once. Each import creates new recipes; repeating an import creates more copies. Files must be under 90 KB. All recipe details validate before any recipe in a batch is inserted.
- Filter the shelf to recipes taking 30 minutes or less, alongside search and category filters.

The recipe journal table initializes automatically on existing SQLite databases without reseeding or replacing recipes. Editing a recipe or toggling its favorite preserves its notebook and cooking history. Deleting a recipe also deletes its journal.

## Find recipes from TheMealDB

Open **Find recipes**, search a dish name, or choose **Surprise me**. Select a result to review it in the recipe editor, then click **Add to my cookbook**. Searching and previewing do not save anything.

The backend uses TheMealDB's V1 search, lookup, and single-random-meal endpoints through a fixed-host client with an eight-second timeout and bounded response size. No extra Python packages are needed. Requests default to the developer/educational test key `1`. Set the server environment variable `MEALDB_API_KEY` to your own key when needed; it is never included in frontend code. Check [TheMealDB's API access guidance](https://www.themealdb.com/api.php) before public distribution; supporter access is required for public app-store releases.

The provider does not consistently supply cooking time or serving count. Those fields start blank and must be completed during review. Explicit numeric units and fractions convert to supported shopping-list quantities; pounds/ounces convert to grams. Ranges, tins, pinches, leaves, and “to taste” stay blank instead of guessing. Original measurement text remains visible beside each ingredient. Confirm quantities, units, time, and servings before saving.

Imported recipes retain a TheMealDB source link and the provider's meal photo. A bundled illustration is used if the photo fails. Sources and photos persist through editing, duplication, and portable exports. Your saved recipes and planning API remain usable when the provider is offline; finding new recipes requires internet.

Tests mock provider responses for deterministic search, lookup, empty results, network errors, review, import, persistence, and shopping-list integration. Transport tests cover URL encoding, timeout, response-size limits, and malformed upstream data.
