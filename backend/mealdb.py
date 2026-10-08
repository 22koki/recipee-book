"""Small, bounded client for TheMealDB's public V1 endpoints."""
import json
import re
from urllib.parse import urlencode
from urllib.request import Request, urlopen

class MealDBError(Exception):
    pass

def fetch_meals(endpoint, params, key='1'):
    if endpoint not in ('search.php', 'lookup.php', 'random.php') or not re.fullmatch(r'[A-Za-z0-9]{1,64}', key):
        raise MealDBError('Recipe discovery is not configured correctly.')
    url = f'https://www.themealdb.com/api/json/v1/{key}/{endpoint}'
    if params:
        url += '?' + urlencode(params)
    try:
        request = Request(url, headers={'Accept': 'application/json', 'User-Agent': 'EverydayTable/1.0'})
        with urlopen(request, timeout=8) as response:
            body = response.read(1_000_001)
        if len(body) > 1_000_000:
            raise MealDBError('The recipe provider returned too much data. Try a more specific search.')
        data = json.loads(body)
        if not isinstance(data, dict) or 'meals' not in data or (data['meals'] is not None and not isinstance(data['meals'], list)):
            raise MealDBError('The recipe provider returned an unexpected response.')
        result = []
        for meal in (data['meals'] or [])[:50]:
            if not isinstance(meal, dict) or not re.fullmatch(r'[0-9]{1,12}', str(meal.get('idMeal', ''))) or not isinstance(meal.get('strMeal'), str):
                continue
            # Return only fields needed by discovery and recipe review.
            fields = ['idMeal', 'strMeal', 'strCategory', 'strArea', 'strInstructions', 'strMealThumb']
            fields += [f'strIngredient{i}' for i in range(1, 21)] + [f'strMeasure{i}' for i in range(1, 21)]
            result.append({field: meal.get(field) if isinstance(meal.get(field), str) else '' for field in fields})
        return result
    except MealDBError:
        raise
    except (OSError, ValueError, TypeError):
        raise MealDBError('TheMealDB is unavailable right now. Try again; your saved cookbook still works.') from None
