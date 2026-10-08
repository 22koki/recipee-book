import json
import math
import os
import re
from urllib.parse import urlparse
from .cocktaildb import fetch_drinks, CocktailDBError
from .mealdb import fetch_meals, MealDBError
from .wikibooks import search_recipes as search_wikibooks, lookup_recipe as lookup_wikibooks, WikibooksError
import sqlite3
from datetime import date
from pathlib import Path
from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException

ROOT = Path(__file__).resolve().parent.parent
CATEGORIES = ('Breakfast', 'Mains', 'Soups', 'Salads', 'Snacks', 'Desserts')
ART = ('pasta', 'pancakes', 'soup', 'salad', 'curry', 'cookies', 'toast', 'tofu')
SLOTS = ('Breakfast', 'Lunch', 'Dinner')
UNITS = ('g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'whole', 'clove', 'slice', 'cup')


def create_app(database_path=None):
    app = Flask(__name__, static_folder=None)
    app.config['COCKTAILDB_API_KEY'] = os.environ.get('COCKTAILDB_API_KEY', '1')
    app.config['MEALDB_API_KEY'] = os.environ.get('MEALDB_API_KEY', '1')
    app.config['MAX_CONTENT_LENGTH'] = 100_000
    app.config['DATABASE'] = str(database_path or os.environ.get('RECIPE_DATABASE', ROOT / 'instance' / 'recipes.sqlite3'))
    Path(app.config['DATABASE']).parent.mkdir(parents=True, exist_ok=True)

    def db():
        if 'db' not in g:
            g.db = sqlite3.connect(app.config['DATABASE'])
            g.db.row_factory = sqlite3.Row
            g.db.execute('PRAGMA foreign_keys = ON')
        return g.db

    @app.teardown_appcontext
    def close_db(error):
        connection = g.pop('db', None)
        if connection is not None:
            connection.close()

    with app.app_context():
        db().executescript('''
            CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS drinks (id INTEGER PRIMARY KEY, cocktaildb_id TEXT NOT NULL UNIQUE, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS recipes (id INTEGER PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS meals (
                day TEXT NOT NULL, slot TEXT NOT NULL,
                recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
                servings INTEGER NOT NULL, PRIMARY KEY(day, slot));
            CREATE TABLE IF NOT EXISTS recipe_journal (
                recipe_id INTEGER PRIMARY KEY REFERENCES recipes(id) ON DELETE CASCADE,
                notes TEXT NOT NULL DEFAULT '', rating INTEGER NOT NULL DEFAULT 0,
                cooked_count INTEGER NOT NULL DEFAULT 0, last_cooked TEXT);
            CREATE TABLE IF NOT EXISTS shopping_checks (key TEXT PRIMARY KEY, checked INTEGER NOT NULL);
        ''')
        if not db().execute("SELECT 1 FROM meta WHERE key='seeded'").fetchone():
            seed = json.loads((ROOT / 'backend' / 'seed.json').read_text())
            for recipe in seed:
                db().execute('INSERT INTO recipes(data) VALUES (?)', (json.dumps(recipe),))
            db().execute("INSERT INTO meta VALUES ('seeded', '1')")
            db().commit()

    def bad(message, status=400):
        return jsonify(error=message), status

    def recipe_row(recipe_id):
        row = db().execute('SELECT * FROM recipes WHERE id=?', (recipe_id,)).fetchone()
        if not row:
            return None
        journal = db().execute('SELECT notes, rating, cooked_count, last_cooked FROM recipe_journal WHERE recipe_id=?', (recipe_id,)).fetchone()
        return dict(id=row['id'], **json.loads(row['data']), journal=dict(journal) if journal else {'notes': '', 'rating': 0, 'cooked_count': 0, 'last_cooked': None})

    def payload():
        value = request.get_json(silent=True)
        if not isinstance(value, dict):
            raise ValueError('Send a JSON object.')
        return value

    def text(value, label, limit):
        if not isinstance(value, str) or not value.strip() or len(value.strip()) > limit:
            raise ValueError(f'{label} must contain 1–{limit} characters.')
        return value.strip()

    def integer(value, label, low, high):
        if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
            raise ValueError(f'{label} must be a whole number from {low} to {high}.')
        return value

    def validate_recipe(data):
        result = {
            'title': text(data.get('title'), 'Title', 100),
            'description': text(data.get('description'), 'Description', 600),
            'time': integer(data.get('time'), 'Cooking time', 1, 1440),
            'servings': integer(data.get('servings'), 'Servings', 1, 24),
            'category': data.get('category'), 'art': data.get('art'),
            'favorite': data.get('favorite', False),
        }
        if result['category'] not in CATEGORIES or result['art'] not in ART:
            raise ValueError('Choose a valid category and dish illustration.')
        if not isinstance(result['favorite'], bool):
            raise ValueError('Favorite must be true or false.')
        mealdb_id = data.get('mealdb_id', '')
        image = data.get('image', '')
        if not isinstance(mealdb_id, str) or (mealdb_id and not re.fullmatch(r'[0-9]{1,12}', mealdb_id)):
            raise ValueError('Use a valid TheMealDB recipe reference.')
        if not isinstance(image, str) or len(image) > 500:
            raise ValueError('Use a valid recipe photo.')
        if image:
            parsed = urlparse(image)
            if parsed.scheme != 'https' or parsed.netloc != 'www.themealdb.com' or not parsed.path.startswith('/images/media/meals/') or parsed.query or parsed.fragment:
                raise ValueError('Recipe photos must come from TheMealDB.')
        if mealdb_id:
            result['mealdb_id'] = mealdb_id
        wiki_id = data.get('wikibooks_id', '')
        wiki_revision = data.get('wikibooks_revision', '')
        wiki_title = data.get('wikibooks_title', '')
        if any([wiki_id, wiki_revision, wiki_title]):
            if mealdb_id or not isinstance(wiki_id, str) or not re.fullmatch(r'[1-9][0-9]{0,11}', wiki_id) or not isinstance(wiki_revision, str) or not re.fullmatch(r'[1-9][0-9]{0,11}', wiki_revision):
                raise ValueError('Use a valid Wikibooks recipe and revision reference.')
            result.update(wikibooks_id=wiki_id, wikibooks_revision=wiki_revision, wikibooks_title=text(wiki_title, 'Original Wikibooks title', 300))
        if image:
            result['image'] = image
        ingredients = data.get('ingredients')
        if not isinstance(ingredients, list) or not 1 <= len(ingredients) <= 50:
            raise ValueError('Add between 1 and 50 ingredients.')
        result['ingredients'] = []
        for item in ingredients:
            if not isinstance(item, dict):
                raise ValueError('Each ingredient needs a name, quantity, and unit.')
            quantity = item.get('quantity')
            if isinstance(quantity, bool) or not isinstance(quantity, (int, float)) or not math.isfinite(quantity) or not 0 < quantity <= 100000:
                raise ValueError('Ingredient quantities must be positive numbers up to 100,000.')
            if item.get('unit') not in UNITS:
                raise ValueError('Choose a supported ingredient unit.')
            ingredient = {'name': text(item.get('name'), 'Ingredient name', 100), 'quantity': quantity, 'unit': item['unit']}
            source_measure = item.get('source_measure', '')
            if not isinstance(source_measure, str) or len(source_measure) > 600:
                raise ValueError('Original ingredient measurements must be text up to 600 characters.')
            if source_measure:
                ingredient['source_measure'] = source_measure
            result['ingredients'].append(ingredient)
        instructions = data.get('instructions')
        if not isinstance(instructions, list) or not 1 <= len(instructions) <= 30:
            raise ValueError('Add between 1 and 30 cooking steps.')
        result['instructions'] = [text(step, 'Cooking step', 1500) for step in instructions]
        return result

    @app.errorhandler(ValueError)
    def validation_error(error):
        return bad(str(error))

    @app.errorhandler(HTTPException)
    def http_error(error):
        return bad(error.description, error.code)

    @app.errorhandler(MealDBError)
    def discovery_error(error):
        return bad(str(error), 503)

    @app.errorhandler(WikibooksError)
    def wikibooks_error(error):
        return bad(str(error), 503)

    @app.get('/api/discover/wikibooks')
    def wikibooks_search():
        query = request.args.get('q', '').strip()
        if not query or len(query) > 100:
            raise ValueError('Search with a dish name up to 100 characters.')
        return jsonify(search_wikibooks(query))

    @app.get('/api/discover/wikibooks/<page_id>')
    def wikibooks_lookup(page_id):
        if not re.fullmatch(r'[1-9][0-9]{0,11}', page_id):
            raise ValueError('Use a valid Wikibooks recipe ID.')
        return jsonify(lookup_wikibooks(page_id))

    @app.get('/api/discover')
    def discover_recipes():
        query = request.args.get('q', '').strip()
        if not query or len(query) > 100:
            raise ValueError('Search with a dish name up to 100 characters.')
        return jsonify(fetch_meals('search.php', {'s': query}, app.config['MEALDB_API_KEY']))

    @app.get('/api/discover/random')
    def discover_random():
        return jsonify(fetch_meals('random.php', {}, app.config['MEALDB_API_KEY']))

    @app.get('/api/discover/<meal_id>')
    def discover_recipe(meal_id):
        if not re.fullmatch(r'[0-9]{1,12}', meal_id):
            raise ValueError('Use a valid TheMealDB recipe ID.')
        meals = fetch_meals('lookup.php', {'i': meal_id}, app.config['MEALDB_API_KEY'])
        match = next((meal for meal in meals if meal['idMeal'] == meal_id), None)
        return jsonify(match) if match else bad('Recipe not found on TheMealDB.', 404)

    @app.errorhandler(CocktailDBError)
    def drinks_error(error):
        return bad(str(error), 503)

    def drink_reference(reference):
        if not isinstance(reference, str) or not re.fullmatch(r'[0-9]{1,12}', reference):
            raise ValueError('Use a valid TheCocktailDB drink ID.')
        return reference

    def lookup_drink(reference):
        rows = fetch_drinks('lookup.php', {'i': reference}, app.config['COCKTAILDB_API_KEY'])
        return next((row for row in rows if row['cocktaildb_id'] == reference), None)

    @app.get('/api/drinks/discover')
    def discover_drinks():
        query = request.args.get('q', '').strip()
        alcohol = request.args.get('alcohol', 'all')
        labels = {'alcoholic': 'Alcoholic', 'non-alcoholic': 'Non alcoholic'}
        if alcohol not in ('all', *labels) or len(query) > 100:
            raise ValueError('Choose a drink type and a name up to 100 characters.')
        if query:
            rows = fetch_drinks('search.php', {'s': query}, app.config['COCKTAILDB_API_KEY'])
            if alcohol != 'all':
                rows = [row for row in rows if row['alcohol'] == labels[alcohol]]
        elif alcohol != 'all':
            rows = fetch_drinks('filter.php', {'a': 'Non_Alcoholic' if alcohol == 'non-alcoholic' else 'Alcoholic'}, app.config['COCKTAILDB_API_KEY'], alcohol=labels[alcohol])
        else:
            raise ValueError('Enter a drink name or choose a drink type to browse.')
        return jsonify(rows)

    @app.get('/api/drinks/discover/random')
    def random_drink():
        return jsonify(fetch_drinks('random.php', {}, app.config['COCKTAILDB_API_KEY']))

    @app.get('/api/drinks/discover/<reference>')
    def discover_drink(reference):
        drink = lookup_drink(drink_reference(reference))
        return jsonify(drink) if drink else bad('Drink not found on TheCocktailDB.', 404)

    @app.get('/api/drinks')
    def saved_drinks():
        return jsonify([dict(id=row['id'], **json.loads(row['data'])) for row in db().execute('SELECT * FROM drinks ORDER BY id DESC')])

    @app.post('/api/drinks')
    def save_drink():
        reference = drink_reference(payload().get('cocktaildb_id'))
        existing = db().execute('SELECT * FROM drinks WHERE cocktaildb_id=?', (reference,)).fetchone()
        if existing:
            return jsonify(dict(id=existing['id'], **json.loads(existing['data'])))
        drink = lookup_drink(reference)
        if not drink:
            return bad('Drink not found on TheCocktailDB.', 404)
        if not drink['ingredients'] or not drink['instructions']:
            return bad('This drink has no complete ingredient list and instructions to save.', 422)
        # Unique source IDs also prevent duplicates across simultaneous requests.
        db().execute('INSERT OR IGNORE INTO drinks(cocktaildb_id, data) VALUES (?, ?)', (reference, json.dumps(drink)))
        db().commit()
        row = db().execute('SELECT * FROM drinks WHERE cocktaildb_id=?', (reference,)).fetchone()
        return jsonify(dict(id=row['id'], **json.loads(row['data']))), 201

    @app.delete('/api/drinks/<int:drink_id>')
    def remove_drink(drink_id):
        cursor = db().execute('DELETE FROM drinks WHERE id=?', (drink_id,))
        db().commit()
        return ('', 204) if cursor.rowcount else bad('Saved drink not found.', 404)

    @app.get('/api/health')
    def health():
        return jsonify(status='ok')

    @app.get('/api/recipes')
    def recipes():
        return jsonify([recipe_row(row['id']) for row in db().execute('SELECT id FROM recipes ORDER BY id')])

    @app.post('/api/recipes')
    def add_recipe():
        original = payload()
        data = validate_recipe(original)
        prevent_duplicate = original.get('prevent_duplicate', False)
        if not isinstance(prevent_duplicate, bool):
            raise ValueError('Duplicate protection must be true or false.')
        # Serialize duplicate checks with insertion across concurrent browsers.
        db().execute('BEGIN IMMEDIATE')
        with db():
            if prevent_duplicate:
                source_field = 'wikibooks_id' if data.get('wikibooks_id') else 'mealdb_id'
                if data.get(source_field):
                    for row in db().execute('SELECT id, data FROM recipes'):
                        if json.loads(row['data']).get(source_field) == data[source_field]:
                            return jsonify(error='This recipe is already in your cookbook. Open the existing recipe from Find recipes.', existing_id=row['id']), 409
            cursor = db().execute('INSERT INTO recipes(data) VALUES (?)', (json.dumps(data),))
        return jsonify(recipe_row(cursor.lastrowid)), 201

    @app.post('/api/recipes/import')
    def import_recipes():
        rows = payload().get('recipes')
        if not isinstance(rows, list) or not 1 <= len(rows) <= 50:
            raise ValueError('Import between 1 and 50 recipes.')
        if any(not isinstance(row, dict) for row in rows):
            raise ValueError('Each imported recipe must be an object.')
        validated = [validate_recipe(row) for row in rows]
        ids = []
        with db():
            for data in validated:
                ids.append(db().execute('INSERT INTO recipes(data) VALUES (?)', (json.dumps(data),)).lastrowid)
        return jsonify([recipe_row(recipe_id) for recipe_id in ids]), 201

    @app.get('/api/recipes/<int:recipe_id>')
    def get_recipe(recipe_id):
        recipe = recipe_row(recipe_id)
        return jsonify(recipe) if recipe else bad('Recipe not found.', 404)

    @app.put('/api/recipes/<int:recipe_id>')
    def edit_recipe(recipe_id):
        if not recipe_row(recipe_id):
            return bad('Recipe not found.', 404)
        data = validate_recipe(payload())
        db().execute('UPDATE recipes SET data=? WHERE id=?', (json.dumps(data), recipe_id))
        db().commit()
        return jsonify(recipe_row(recipe_id))

    @app.patch('/api/recipes/<int:recipe_id>/favorite')
    def favorite(recipe_id):
        recipe = recipe_row(recipe_id)
        if not recipe:
            return bad('Recipe not found.', 404)
        value = payload().get('favorite')
        if not isinstance(value, bool):
            raise ValueError('Favorite must be true or false.')
        recipe.pop('id')
        recipe.pop('journal', None)
        recipe['favorite'] = value
        db().execute('UPDATE recipes SET data=? WHERE id=?', (json.dumps(recipe), recipe_id))
        db().commit()
        return jsonify(recipe_row(recipe_id))


    @app.patch('/api/recipes/<int:recipe_id>/journal')
    def save_journal(recipe_id):
        if not recipe_row(recipe_id):
            return bad('Recipe not found.', 404)
        data = payload()
        notes = data.get('notes')
        if not isinstance(notes, str) or len(notes) > 2000:
            raise ValueError('Notes must be text up to 2,000 characters.')
        rating = integer(data.get('rating'), 'Rating', 0, 5)
        db().execute('INSERT INTO recipe_journal(recipe_id, notes, rating) VALUES (?, ?, ?) ON CONFLICT(recipe_id) DO UPDATE SET notes=excluded.notes, rating=excluded.rating', (recipe_id, notes.strip(), rating))
        db().commit()
        return jsonify(recipe_row(recipe_id))

    @app.post('/api/recipes/<int:recipe_id>/cooked')
    def cooked_recipe(recipe_id):
        if not recipe_row(recipe_id):
            return bad('Recipe not found.', 404)
        db().execute('INSERT INTO recipe_journal(recipe_id, cooked_count, last_cooked) VALUES (?, 1, ?) ON CONFLICT(recipe_id) DO UPDATE SET cooked_count=cooked_count+1, last_cooked=excluded.last_cooked', (recipe_id, date.today().isoformat()))
        db().commit()
        return jsonify(recipe_row(recipe_id))

    @app.delete('/api/recipes/<int:recipe_id>')
    def delete_recipe(recipe_id):
        if not recipe_row(recipe_id):
            return bad('Recipe not found.', 404)
        db().execute('DELETE FROM recipes WHERE id=?', (recipe_id,))
        db().commit()
        return '', 204

    def valid_day(day):
        try:
            if date.fromisoformat(day).isoformat() != day:
                raise ValueError()
        except (ValueError, TypeError):
            raise ValueError('Use a date in YYYY-MM-DD format.')
        return day

    @app.get('/api/plan')
    def plan():
        return jsonify([dict(row) for row in db().execute('SELECT * FROM meals ORDER BY day, slot')])

    @app.put('/api/plan/<day>/<slot>')
    def set_meal(day, slot):
        valid_day(day)
        if slot not in SLOTS:
            raise ValueError('Choose Breakfast, Lunch, or Dinner.')
        data = payload()
        recipe_id = integer(data.get('recipe_id'), 'Recipe ID', 1, 2147483647)
        servings = integer(data.get('servings'), 'Servings', 1, 24)
        if not recipe_row(recipe_id):
            return bad('Recipe not found.', 404)
        db().execute('INSERT INTO meals VALUES (?, ?, ?, ?) ON CONFLICT(day, slot) DO UPDATE SET recipe_id=excluded.recipe_id, servings=excluded.servings', (day, slot, recipe_id, servings))
        db().commit()
        return jsonify(day=day, slot=slot, recipe_id=recipe_id, servings=servings)

    @app.delete('/api/plan/<day>/<slot>')
    def remove_meal(day, slot):
        valid_day(day)
        if slot not in SLOTS:
            raise ValueError('Choose Breakfast, Lunch, or Dinner.')
        db().execute('DELETE FROM meals WHERE day=? AND slot=?', (day, slot))
        db().commit()
        return '', 204

    @app.get('/api/shopping')
    def shopping():
        start, end = valid_day(request.args.get('start')), valid_day(request.args.get('end'))
        if start > end:
            raise ValueError('The start date must come before the end date.')
        totals = {}
        for meal in db().execute('SELECT meals.servings, recipes.data FROM meals JOIN recipes ON recipes.id=meals.recipe_id WHERE day BETWEEN ? AND ?', (start, end)):
            recipe = json.loads(meal['data'])
            ratio = meal['servings'] / recipe['servings']
            for item in recipe['ingredients']:
                key = json.dumps([item['name'].casefold(), item['unit']], ensure_ascii=False)
                totals.setdefault(key, {'key': key, 'name': item['name'], 'unit': item['unit'], 'quantity': 0})['quantity'] += item['quantity'] * ratio
        checks = {row['key']: bool(row['checked']) for row in db().execute('SELECT * FROM shopping_checks')}
        return jsonify([dict(item, quantity=round(item['quantity'], 3), checked=checks.get(key, False)) for key, item in sorted(totals.items())])

    @app.patch('/api/shopping/check')
    def check_shopping():
        data = payload()
        key = text(data.get('key'), 'Shopping item key', 250)
        checked = data.get('checked')
        if not isinstance(checked, bool):
            raise ValueError('Checked must be true or false.')
        db().execute('INSERT INTO shopping_checks VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET checked=excluded.checked', (key, int(checked)))
        db().commit()
        return jsonify(key=key, checked=checked)

    @app.get('/')
    @app.get('/<path:path>')
    def frontend(path='index.html'):
        if path.startswith('api/'):
            return bad('API endpoint not found.', 404)
        build = ROOT / 'recipe-app' / 'build'
        if not (build / 'index.html').is_file():
            return bad('Frontend not built. Run npm install and npm run build in recipe-app, or use its development server.', 503)
        return send_from_directory(build, path)

    return app
