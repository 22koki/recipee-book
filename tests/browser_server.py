"""CI-only Flask server with deterministic CocktailDB provider responses."""
import json
import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from backend import app as backend

if not os.environ.get('RECIPE_DATABASE'):
    raise RuntimeError('Set a disposable RECIPE_DATABASE for browser tests.')
DRINKS = json.loads((Path(__file__).parent / 'fixtures' / 'drinks.json').read_text())

def fixture_drinks(endpoint, params, key='1', alcohol=''):
    if endpoint == 'lookup.php':
        return [row for row in DRINKS if row['cocktaildb_id'] == params.get('i')]
    if endpoint == 'filter.php':
        return [dict(row, ingredients=[], instructions='') for row in DRINKS if row['alcohol'] == alcohol]
    if endpoint == 'random.php':
        return [DRINKS[0]]
    return [row for row in DRINKS if params.get('s', '').lower() in row['title'].lower()]

backend.fetch_drinks = fixture_drinks
backend.create_app().run(host='127.0.0.1', port=5000)
