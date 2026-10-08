import json
import tempfile
import unittest
from unittest.mock import patch, MagicMock
from urllib.error import URLError
from backend.app import create_app
from backend.cocktaildb import fetch_drinks, CocktailDBError

RAW = {'idDrink': '11007', 'strDrink': 'Margarita', 'strAlcoholic': 'Alcoholic', 'strGlass': 'Cocktail glass', 'strCategory': 'Ordinary Drink', 'strInstructions': 'Shake and serve.', 'strDrinkThumb': 'https://www.thecocktaildb.com/images/media/drink/test.jpg', 'strIngredient1': 'Tequila', 'strMeasure1': '1 1/2 oz', 'strIngredient2': 'Salt', 'strMeasure2': None}
DRINK = {'cocktaildb_id': '11007', 'title': 'Margarita', 'alcohol': 'Alcoholic', 'category': 'Ordinary Drink', 'glass': 'Cocktail glass', 'image': RAW['strDrinkThumb'], 'ingredients': [{'name': 'Tequila', 'measure': '1 1/2 oz'}, {'name': 'Salt', 'measure': ''}], 'instructions': 'Shake and serve.'}

class CocktailTransportTests(unittest.TestCase):
    @patch('backend.cocktaildb.urlopen')
    def test_fixed_host_encoded_search_bounded_read_and_original_measures(self, open_url):
        response = MagicMock(); response.read.return_value = json.dumps({'drinks': [RAW]}).encode()
        open_url.return_value.__enter__.return_value = response
        self.assertEqual(fetch_drinks('search.php', {'s': 'gin & tonic'}), [DRINK])
        self.assertEqual(open_url.call_args.args[0].full_url, 'https://www.thecocktaildb.com/api/json/v1/1/search.php?s=gin+%26+tonic')
        self.assertEqual(open_url.call_args.kwargs['timeout'], 8)
        response.read.assert_called_once_with(1_000_001)

    @patch('backend.cocktaildb.urlopen')
    def test_null_malformed_and_oversized_results(self, open_url):
        response = MagicMock(); open_url.return_value.__enter__.return_value = response
        response.read.return_value = b'{"drinks":null}'
        self.assertEqual(fetch_drinks('random.php', {}), [])
        for body in [b'[]', b'{}', b'{"drinks":"wrong"}', b'broken', b'x' * 1_000_001]:
            response.read.return_value = body
            with self.assertRaises(CocktailDBError): fetch_drinks('random.php', {})

    @patch('backend.cocktaildb.urlopen')
    def test_filter_summaries_unknown_alcohol_and_photo_allowlist(self, open_url):
        response = MagicMock(); open_url.return_value.__enter__.return_value = response
        raw = {'idDrink': '123', 'strDrink': 'Lemonade', 'strDrinkThumb': 'https://example.com/drink.jpg'}
        response.read.return_value = json.dumps({'drinks': [raw]}).encode()
        summary = fetch_drinks('filter.php', {'a': 'Non_Alcoholic'}, alcohol='Non alcoholic')[0]
        self.assertEqual(summary['alcohol'], 'Non alcoholic'); self.assertEqual(summary['image'], '')
        self.assertEqual(summary['ingredients'], [])
        self.assertEqual(fetch_drinks('lookup.php', {'i': '123'})[0]['alcohol'], 'Not specified')

    @patch('backend.cocktaildb.urlopen', side_effect=URLError('offline'))
    def test_network_failure_is_friendly(self, open_url):
        with self.assertRaisesRegex(CocktailDBError, 'saved drinks still work'): fetch_drinks('random.php', {})

    @patch('backend.cocktaildb.urlopen')
    def test_rejects_arbitrary_endpoints_or_keys(self, open_url):
        for endpoint, key in [('https://evil.test', '1'), ('random.php', '../key'), ('lookup.php', '')]:
            with self.assertRaises(CocktailDBError): fetch_drinks(endpoint, {}, key)
        open_url.assert_not_called()

class DrinksAPITests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.path = self.directory.name + '/test.sqlite3'
        self.app = create_app(self.path); self.client = self.app.test_client()
    def tearDown(self): self.directory.cleanup()

    @patch('backend.app.fetch_drinks')
    def test_search_filter_browse_random_and_full_preview(self, fetch):
        fetch.return_value = [DRINK, dict(DRINK, cocktaildb_id='123', alcohol='Non alcoholic')]
        response = self.client.get('/api/drinks/discover?q=lemon&alcohol=non-alcoholic')
        self.assertEqual(response.status_code, 200); self.assertEqual(len(response.json), 1)
        self.assertEqual(response.json[0]['alcohol'], 'Non alcoholic')
        self.client.get('/api/drinks/discover?alcohol=non-alcoholic')
        fetch.assert_called_with('filter.php', {'a': 'Non_Alcoholic'}, '1', alcohol='Non alcoholic')
        self.client.get('/api/drinks/discover/random'); fetch.assert_called_with('random.php', {}, '1')
        self.assertEqual(self.client.get('/api/drinks/discover/11007').json, DRINK)

    @patch('backend.app.fetch_drinks')
    def test_validation_before_network_and_not_found(self, fetch):
        for path in ['/api/drinks/discover', '/api/drinks/discover?alcohol=invalid', '/api/drinks/discover/evil', '/api/drinks/discover?q=' + 'a'*101]:
            self.assertEqual(self.client.get(path).status_code, 400)
        for value in [None, True, '../evil', 123]:
            self.assertEqual(self.client.post('/api/drinks', json={'cocktaildb_id': value}).status_code, 400)
        fetch.assert_not_called(); fetch.return_value = []
        self.assertEqual(self.client.get('/api/drinks/discover/999').status_code, 404)
        self.assertEqual(self.client.post('/api/drinks', json={'cocktaildb_id': '999'}).status_code, 404)

    @patch('backend.app.fetch_drinks', return_value=[DRINK])
    def test_save_persists_without_touching_food_and_duplicate_is_offline(self, fetch):
        count = len(self.client.get('/api/recipes').json)
        response = self.client.post('/api/drinks', json={'cocktaildb_id': '11007', 'title': 'Untrusted client text'})
        self.assertEqual(response.status_code, 201); self.assertEqual(response.json['title'], 'Margarita')
        drink_id = response.json['id']; fetch.reset_mock(); fetch.side_effect = CocktailDBError('offline')
        duplicate = self.client.post('/api/drinks', json={'cocktaildb_id': '11007'})
        self.assertEqual(duplicate.status_code, 200); self.assertEqual(duplicate.json['id'], drink_id); fetch.assert_not_called()
        restarted = create_app(self.path).test_client()
        self.assertEqual(len(restarted.get('/api/drinks').json), 1)
        self.assertEqual(len(restarted.get('/api/recipes').json), count)
        self.assertEqual(restarted.delete(f'/api/drinks/{drink_id}').status_code, 204)
        self.assertEqual(restarted.get('/api/drinks').json, [])
        self.assertEqual(restarted.delete(f'/api/drinks/{drink_id}').status_code, 404)

    @patch('backend.app.fetch_drinks')
    def test_provider_errors_and_incomplete_drinks_do_not_save(self, fetch):
        fetch.side_effect = CocktailDBError('provider unavailable')
        self.assertEqual(self.client.get('/api/drinks/discover/random').status_code, 503)
        self.assertEqual(self.client.post('/api/drinks', json={'cocktaildb_id': '11007'}).status_code, 503)
        fetch.side_effect = None; fetch.return_value = [dict(DRINK, instructions='')]
        self.assertEqual(self.client.post('/api/drinks', json={'cocktaildb_id': '11007'}).status_code, 422)
        self.assertEqual(self.client.get('/api/drinks').json, [])
