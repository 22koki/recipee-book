import json
import math
import os
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
            CREATE TABLE IF NOT EXISTS recipes (id INTEGER PRIMARY KEY, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS meals (
                day TEXT NOT NULL, slot TEXT NOT NULL,
                recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
                servings INTEGER NOT NULL, PRIMARY KEY(day, slot));
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
        return dict(id=row['id'], **json.loads(row['data'])) if row else None

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
            result['ingredients'].append({'name': text(item.get('name'), 'Ingredient name', 100), 'quantity': quantity, 'unit': item['unit']})
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

    @app.get('/api/health')
    def health():
        return jsonify(status='ok')

    @app.get('/api/recipes')
    def recipes():
        return jsonify([dict(id=row['id'], **json.loads(row['data'])) for row in db().execute('SELECT * FROM recipes ORDER BY id')])

    @app.post('/api/recipes')
    def add_recipe():
        data = validate_recipe(payload())
        cursor = db().execute('INSERT INTO recipes(data) VALUES (?)', (json.dumps(data),))
        db().commit()
        return jsonify(recipe_row(cursor.lastrowid)), 201

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
        recipe['favorite'] = value
        db().execute('UPDATE recipes SET data=? WHERE id=?', (json.dumps(recipe), recipe_id))
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
