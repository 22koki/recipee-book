import json
import unittest
from unittest.mock import patch, MagicMock
from urllib.error import URLError
from backend.mealdb import fetch_meals, MealDBError

class MealDBTransportTests(unittest.TestCase):
    @patch('backend.mealdb.urlopen')
    def test_encoded_query_timeout_and_bounded_read(self, open_url):
        response = MagicMock()
        response.read.return_value = json.dumps({'meals': [{'idMeal': '52771', 'strMeal': 'Pasta', 'strIngredient1': 'rice', 'unused': 'private'}]}).encode()
        open_url.return_value.__enter__.return_value = response
        meals = fetch_meals('search.php', {'s': 'rice & beans'})
        request = open_url.call_args.args[0]
        self.assertEqual(request.full_url, 'https://www.themealdb.com/api/json/v1/1/search.php?s=rice+%26+beans')
        self.assertEqual(open_url.call_args.kwargs['timeout'], 8)
        response.read.assert_called_once_with(1_000_001)
        self.assertEqual(meals[0]['strIngredient1'], 'rice')
        self.assertNotIn('unused', meals[0])

    @patch('backend.mealdb.urlopen')
    def test_empty_results_and_malformed_provider_data(self, open_url):
        response = MagicMock()
        open_url.return_value.__enter__.return_value = response
        response.read.return_value = b'{"meals":null}'
        self.assertEqual(fetch_meals('random.php', {}), [])
        for body in [b'not json', b'[]', b'{}', b'{"meals":"wrong"}', b'x' * 1_000_001]:
            response.read.return_value = body
            with self.assertRaises(MealDBError):
                fetch_meals('random.php', {})

    @patch('backend.mealdb.urlopen', side_effect=URLError('test'))
    def test_network_failure_is_a_friendly_error(self, open_url):
        with self.assertRaisesRegex(MealDBError, 'unavailable'):
            fetch_meals('random.php', {})

    @patch('backend.mealdb.urlopen')
    def test_only_fixed_endpoints_and_keys_are_allowed(self, open_url):
        for endpoint, key in [('https://evil.test', '1'), ('random.php', '../private'), ('random.php', '')]:
            with self.assertRaises(MealDBError):
                fetch_meals(endpoint, {}, key)
        open_url.assert_not_called()

if __name__ == '__main__':
    unittest.main()
