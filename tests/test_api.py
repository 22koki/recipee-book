import copy
import json
import tempfile
import unittest
from pathlib import Path
from backend.app import create_app


class RecipeApiTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.database = Path(self.folder.name) / 'test.sqlite3'
        self.app = create_app(self.database)
        self.client = self.app.test_client()
        self.recipe = self.client.get('/api/recipes').get_json()[0]

    def tearDown(self):
        self.folder.cleanup()

    def test_seeded_once_and_database_persists(self):
        self.assertEqual(len(self.client.get('/api/recipes').get_json()), 8)
        other = create_app(self.database).test_client()
        self.assertEqual(len(other.get('/api/recipes').get_json()), 8)
        self.assertEqual(self.client.get('/api/health').get_json(), {'status': 'ok'})

    def test_complete_crud_and_favorite(self):
        new = copy.deepcopy(self.recipe)
        new['title'] = 'My own pasta'
        response = self.client.post('/api/recipes', json=new)
        self.assertEqual(response.status_code, 201)
        recipe_id = response.get_json()['id']
        new['description'] = 'Edited description'
        self.assertEqual(self.client.put(f'/api/recipes/{recipe_id}', json=new).status_code, 200)
        self.assertEqual(self.client.get(f'/api/recipes/{recipe_id}').get_json()['description'], 'Edited description')
        self.assertTrue(self.client.patch(f'/api/recipes/{recipe_id}/favorite', json={'favorite': True}).get_json()['favorite'])
        self.assertTrue(create_app(self.database).test_client().get(f'/api/recipes/{recipe_id}').get_json()['favorite'])
        self.assertEqual(self.client.delete(f'/api/recipes/{recipe_id}').status_code, 204)
        self.assertEqual(self.client.get(f'/api/recipes/{recipe_id}').status_code, 404)

    def test_invalid_recipes_are_rejected(self):
        for field, value in [('title', ' '), ('time', -1), ('servings', 0), ('time', True), ('category', 'bad'), ('art', 'bad'), ('ingredients', []), ('instructions', []), ('favorite', 'yes')]:
            with self.subTest(field=field, value=value):
                data = copy.deepcopy(self.recipe)
                data[field] = value
                response = self.client.post('/api/recipes', json=data)
                self.assertEqual(response.status_code, 400)
                self.assertIn('error', response.get_json())

    def test_invalid_ingredient_quantities_and_units(self):
        for value in [0, -1, True, '2', float('nan'), float('inf'), 100001]:
            data = copy.deepcopy(self.recipe)
            data['ingredients'][0]['quantity'] = value
            self.assertEqual(self.client.post('/api/recipes', json=data).status_code, 400)
        data = copy.deepcopy(self.recipe)
        data['ingredients'][0]['unit'] = 'unknown'
        self.assertEqual(self.client.post('/api/recipes', json=data).status_code, 400)

    def test_invalid_payload_and_missing_routes(self):
        self.assertEqual(self.client.post('/api/recipes', json=[]).status_code, 400)
        self.assertEqual(self.client.post('/api/recipes', data='broken', content_type='application/json').status_code, 400)
        self.assertEqual(self.client.put('/api/recipes/999', json=self.recipe).status_code, 404)
        self.assertEqual(self.client.patch('/api/recipes/999/favorite', json={'favorite': True}).status_code, 404)
        self.assertEqual(self.client.patch('/api/recipes/1/favorite', json={'favorite': 1}).status_code, 400)
        self.assertEqual(self.client.post('/api/recipes', data='x' * 100001, content_type='application/json').status_code, 413)
        self.assertEqual(self.client.get('/api/not-found').status_code, 404)

    def test_plan_replacement_and_deletion(self):
        route = '/api/plan/2026-10-08/Dinner'
        self.assertEqual(self.client.put(route, json={'recipe_id': 1, 'servings': 2}).status_code, 200)
        self.assertEqual(self.client.put(route, json={'recipe_id': 2, 'servings': 3}).status_code, 200)
        meals = self.client.get('/api/plan').get_json()
        self.assertEqual(len(meals), 1)
        self.assertEqual(meals[0]['recipe_id'], 2)
        self.assertEqual(meals[0]['servings'], 3)
        self.assertEqual(self.client.delete(route).status_code, 204)
        self.assertEqual(self.client.get('/api/plan').get_json(), [])

    def test_plan_validation(self):
        valid = {'recipe_id': 1, 'servings': 2}
        for route in ['/api/plan/20261008/Dinner', '/api/plan/2026-02-30/Dinner', '/api/plan/2026-10-08/Supper']:
            self.assertEqual(self.client.put(route, json=valid).status_code, 400)
        self.assertEqual(self.client.put('/api/plan/2026-10-08/Dinner', json={'recipe_id': 999, 'servings': 2}).status_code, 404)
        self.assertEqual(self.client.put('/api/plan/2026-10-08/Dinner', json={'recipe_id': 1, 'servings': 25}).status_code, 400)

    def test_shopping_scales_and_aggregates_only_selected_week(self):
        self.client.put('/api/plan/2026-10-08/Dinner', json={'recipe_id': 1, 'servings': 2})
        self.client.put('/api/plan/2026-10-09/Lunch', json={'recipe_id': 1, 'servings': 4})
        self.client.put('/api/plan/2026-11-01/Dinner', json={'recipe_id': 1, 'servings': 4})
        items = self.client.get('/api/shopping?start=2026-10-05&end=2026-10-11').get_json()
        pasta = next(i for i in items if i['name'] == 'spaghetti')
        self.assertEqual(pasta['quantity'], 600)
        self.assertEqual(pasta['unit'], 'g')
        self.assertFalse(pasta['checked'])
        self.client.patch('/api/shopping/check', json={'key': pasta['key'], 'checked': True})
        again = create_app(self.database).test_client().get('/api/shopping?start=2026-10-05&end=2026-10-11').get_json()
        self.assertTrue(next(i for i in again if i['name'] == 'spaghetti')['checked'])

    def test_different_units_stay_separate_and_names_ignore_case(self):
        new = copy.deepcopy(self.recipe)
        new['ingredients'] = [{'name': 'RICE', 'quantity': 1, 'unit': 'cup'}, {'name': 'rice', 'quantity': 50, 'unit': 'g'}, {'name': 'Rice', 'quantity': 0.5, 'unit': 'cup'}]
        new_id = self.client.post('/api/recipes', json=new).get_json()['id']
        self.client.put('/api/plan/2026-10-08/Dinner', json={'recipe_id': new_id, 'servings': 4})
        items = self.client.get('/api/shopping?start=2026-10-05&end=2026-10-11').get_json()
        self.assertEqual(len(items), 2)
        self.assertEqual(next(i for i in items if i['unit'] == 'cup')['quantity'], 1.5)

    def test_recipe_deletion_cascades_into_plan_and_shopping(self):
        self.client.put('/api/plan/2026-10-08/Dinner', json={'recipe_id': 1, 'servings': 4})
        self.client.delete('/api/recipes/1')
        self.assertEqual(self.client.get('/api/plan').get_json(), [])
        self.assertEqual(self.client.get('/api/shopping?start=2026-10-05&end=2026-10-11').get_json(), [])

    def test_empty_database_does_not_reseed_after_deletion(self):
        for recipe in self.client.get('/api/recipes').get_json():
            self.client.delete(f"/api/recipes/{recipe['id']}")
        self.assertEqual(create_app(self.database).test_client().get('/api/recipes').get_json(), [])

    def test_shopping_validation(self):
        self.assertEqual(self.client.get('/api/shopping').status_code, 400)
        self.assertEqual(self.client.get('/api/shopping?start=2026-10-11&end=2026-10-05').status_code, 400)
        self.assertEqual(self.client.patch('/api/shopping/check', json={'key': 'x', 'checked': 'yes'}).status_code, 400)


if __name__ == '__main__':
    unittest.main()
