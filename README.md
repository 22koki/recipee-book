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
