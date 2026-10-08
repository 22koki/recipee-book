"""Bounded V1 client; keep drink measures exactly as supplied by TheCocktailDB."""
import json
import re
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen


class CocktailDBError(Exception):
    pass


def fetch_drinks(endpoint, params, key='1', alcohol=''):
    if endpoint not in ('search.php', 'lookup.php', 'random.php', 'filter.php') or not re.fullmatch(r'[A-Za-z0-9]{1,64}', key):
        raise CocktailDBError('Drink discovery is not configured correctly.')
    url = f'https://www.thecocktaildb.com/api/json/v1/{key}/{endpoint}'
    if params:
        url += '?' + urlencode(params)
    try:
        with urlopen(Request(url, headers={'Accept': 'application/json', 'User-Agent': 'EverydayTable/1.0'}), timeout=8) as response:
            body = response.read(1_000_001)
        if len(body) > 1_000_000:
            raise CocktailDBError('Too many drinks returned. Try a more specific search.')
        data = json.loads(body)
        if not isinstance(data, dict) or 'drinks' not in data or (data['drinks'] is not None and not isinstance(data['drinks'], list)):
            raise CocktailDBError('The drink provider returned an unexpected response.')
        rows = []
        for raw in (data['drinks'] or [])[:100]:
            if not isinstance(raw, dict):
                continue
            def field(name, limit=600):
                value = raw.get(name)
                return value.strip() if isinstance(value, str) and len(value) <= limit else ''
            reference, title = field('idDrink', 12), field('strDrink', 100)
            if not re.fullmatch(r'[0-9]{1,12}', reference) or not title:
                continue
            image = field('strDrinkThumb', 500)
            parsed = urlparse(image)
            if parsed.scheme != 'https' or parsed.netloc != 'www.thecocktaildb.com' or not parsed.path.startswith('/images/media/drink/') or parsed.query or parsed.fragment:
                image = ''
            label = field('strAlcoholic', 40) or alcohol
            if label not in ('Alcoholic', 'Non alcoholic', 'Optional alcohol'):
                label = 'Not specified'
            ingredients = [{'name': field(f'strIngredient{i}', 100), 'measure': field(f'strMeasure{i}', 100)} for i in range(1, 16) if field(f'strIngredient{i}', 100)]
            rows.append({'cocktaildb_id': reference, 'title': title, 'alcohol': label, 'category': field('strCategory', 100), 'glass': field('strGlass', 100), 'image': image, 'ingredients': ingredients, 'instructions': field('strInstructions', 6000)})
        return rows
    except CocktailDBError:
        raise
    except (OSError, ValueError, TypeError):
        raise CocktailDBError('TheCocktailDB is unavailable right now. Try again; your saved drinks still work.') from None
