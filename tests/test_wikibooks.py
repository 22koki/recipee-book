import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock
from urllib.error import URLError
from backend.app import create_app
from backend.wikibooks import extract_recipe, search_recipes, lookup_recipe, request_wiki, WikibooksError

HTML = '<table><tr><td>Ingredients navigation</td></tr></table><div class="mw-heading mw-heading2"><h2>Ingredients</h2><span class="mw-editsection">edit</span></div><ul><li>2 cups <a href="/wiki/Cookbook:Rice">rice</a></li><li>Salt to taste<sup>1</sup></li></ul><h2>Procedure</h2><ol><li>Boil the rice.</li><li>Serve <b>warm</b>.</li></ol><h2>Notes</h2><ul><li>Do not import this note as an ingredient.</li></ul>'

class WikibooksTests(unittest.TestCase):
    def test_extracts_recipe_sections_and_ignores_navigation_and_notes(self):
        self.assertEqual(extract_recipe(HTML), (['2 cups rice', 'Salt to taste'], ['Boil the rice.', 'Serve warm.']))

    def test_nested_headings_do_not_end_ingredient_groups(self):
        html = '<h2>Ingredients</h2><h3>Sauce</h3><ul><li>1 cup water</li></ul><h3>Base</h3><ul><li>2 cups rice</li></ul><h2>Preparation</h2><p>Mix and cook.</p>'
        self.assertEqual(extract_recipe(html), (['1 cup water', '2 cups rice'], ['Mix and cook.']))

    def test_prose_ingredient_article_is_not_mistaken_for_recipe(self):
        self.assertEqual(extract_recipe('<h2>Ingredients</h2><p>Pasta is made of flour.</p><h2>Production</h2><p>Factory processes.</p>'), ([], []))

    @patch('backend.wikibooks.request_wiki')
    def test_search_only_cookbook_recipes_and_safe_titles(self, request):
        request.return_value = {'query': {'search': [{'pageid': 123, 'title': 'Cookbook:Rice'}, {'pageid': 5, 'title': 'Help:Pages'}]}}
        self.assertEqual(search_recipes('rice'), [{'page_id': '123', 'title': 'Rice', 'provider': 'wikibooks'}])
        params = request.call_args.args[0]
        self.assertEqual(params['srnamespace'], 102)
        self.assertIn('incategory:Recipes', params['srsearch'])

    @patch('backend.wikibooks.request_wiki')
    def test_lookup_preserves_revision_and_complete_plain_text(self, request):
        request.return_value = {'parse': {'title': 'Cookbook:Rice', 'pageid': 123, 'revid': 456, 'text': HTML}}
        result = lookup_recipe('123')
        self.assertEqual(result['revision'], '456')
        self.assertEqual(result['ingredients'], ['2 cups rice', 'Salt to taste'])
        self.assertEqual(request.call_args.args[0]['pageid'], '123')

    @patch('backend.wikibooks.request_wiki')
    def test_lookup_rejects_non_recipe_or_wrong_page(self, request):
        for page in [{'title': 'Help:Pages', 'pageid': 123, 'revid': 456, 'text': HTML}, {'title': 'Cookbook:Rice', 'pageid': 999, 'revid': 456, 'text': HTML}, {'title': 'Cookbook:Pasta', 'pageid': 123, 'revid': 456, 'text': '<p>Ingredients guide only.</p>'}]:
            request.return_value = {'parse': page}
            with self.assertRaises(WikibooksError):
                lookup_recipe('123')

    @patch('backend.wikibooks.urlopen')
    def test_transport_bounds_data_and_encodes_fixed_host_request(self, open_url):
        response = MagicMock()
        response.read.return_value = b'{"query":{"search":[]}}'
        open_url.return_value.__enter__.return_value = response
        request_wiki({'action': 'query', 'srsearch': 'rice & beans'})
        self.assertTrue(open_url.call_args.args[0].full_url.startswith('https://en.wikibooks.org/w/api.php?'))
        self.assertIn('rice+%26+beans', open_url.call_args.args[0].full_url)
        self.assertEqual(open_url.call_args.kwargs['timeout'], 8)
        response.read.assert_called_once_with(1_000_001)
        for body in [b'bad json', b'[]', b'{"error":{"code":"missingtitle"}}', b'x' * 1_000_001]:
            response.read.return_value = body
            with self.assertRaises(WikibooksError):
                request_wiki({'action': 'query'})

    @patch('backend.wikibooks.urlopen', side_effect=URLError('test failure'))
    def test_network_failure_is_friendly(self, open_url):
        with self.assertRaisesRegex(WikibooksError, 'unavailable'):
            request_wiki({'action': 'query'})

class WikibooksApiTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.app = create_app(Path(self.folder.name) / 'recipes.sqlite3')
        self.client = self.app.test_client()

    def tearDown(self):
        self.folder.cleanup()

    @patch('backend.app.search_wikibooks')
    @patch('backend.app.lookup_wikibooks')
    def test_routes_validate_and_preview_without_saving(self, lookup, search):
        search.return_value = [{'page_id': '123', 'title': 'Rice'}]
        lookup.return_value = {'page_id': '123', 'revision': '456', 'title': 'Rice'}
        self.assertEqual(self.client.get('/api/discover/wikibooks?q=rice').status_code, 200)
        self.assertEqual(self.client.get('/api/discover/wikibooks/123').get_json()['revision'], '456')
        self.assertEqual(self.client.get('/api/discover/wikibooks?q=').status_code, 400)
        self.assertEqual(self.client.get('/api/discover/wikibooks/bad').status_code, 400)
        self.assertEqual(len(self.client.get('/api/recipes').get_json()), 8)
        search.side_effect = WikibooksError('Provider unavailable.')
        self.assertEqual(self.client.get('/api/discover/wikibooks?q=rice').status_code, 503)

    def test_source_metadata_round_trip_and_duplicate_protection(self):
        recipe = self.client.get('/api/recipes/1').get_json()
        recipe.update(wikibooks_id='123', wikibooks_revision='456', wikibooks_title='Rice', prevent_duplicate=True)
        first = self.client.post('/api/recipes', json=recipe)
        self.assertEqual(first.status_code, 201)
        duplicate = self.client.post('/api/recipes', json=recipe)
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(duplicate.get_json()['existing_id'], first.get_json()['id'])
        recipe['prevent_duplicate'] = False
        self.assertEqual(self.client.post('/api/recipes', json=recipe).status_code, 201)
        saved = first.get_json()
        self.assertEqual(self.client.put(f"/api/recipes/{saved['id']}", json=saved).get_json()['wikibooks_revision'], '456')
        exported_copy = self.client.post('/api/recipes/import', json={'recipes': [saved]}).get_json()[0]
        self.assertEqual(exported_copy['wikibooks_title'], 'Rice')

    def test_invalid_source_metadata_and_measurement_limits(self):
        recipe = self.client.get('/api/recipes/1').get_json()
        for fields in [{'wikibooks_id': 'bad', 'wikibooks_revision': '456', 'wikibooks_title': 'Rice'}, {'wikibooks_id': '123'}, {'wikibooks_id': '123', 'wikibooks_revision': '456', 'wikibooks_title': 'Rice', 'mealdb_id': '1'}]:
            data = dict(recipe, **fields)
            self.assertEqual(self.client.post('/api/recipes', json=data).status_code, 400)
        recipe['ingredients'][0]['source_measure'] = 'x' * 601
        self.assertEqual(self.client.post('/api/recipes', json=recipe).status_code, 400)

    def test_mealdb_duplicate_detection_is_source_specific(self):
        recipe = self.client.get('/api/recipes/1').get_json()
        recipe.update(mealdb_id='123', prevent_duplicate=True)
        self.assertEqual(self.client.post('/api/recipes', json=recipe).status_code, 201)
        self.assertEqual(self.client.post('/api/recipes', json=recipe).status_code, 409)
        recipe.pop('mealdb_id')
        recipe.update(wikibooks_id='123', wikibooks_revision='456', wikibooks_title='Rice')
        self.assertEqual(self.client.post('/api/recipes', json=recipe).status_code, 201)

if __name__ == '__main__':
    unittest.main()
