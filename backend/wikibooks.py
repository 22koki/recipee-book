"""Wikibooks Cookbook search and plain-text recipe previews."""
import json
import re
from html.parser import HTMLParser
from urllib.parse import urlencode
from urllib.request import Request, urlopen


class WikibooksError(Exception):
    pass


def request_wiki(params):
    url = 'https://en.wikibooks.org/w/api.php?' + urlencode(dict(format='json', formatversion=2, **params))
    try:
        request = Request(url, headers={'Accept': 'application/json', 'User-Agent': 'EverydayTable/1.0 (personal cookbook; https://github.com/22koki/recipee-book)'})
        with urlopen(request, timeout=8) as response:
            body = response.read(1_000_001)
        if len(body) > 1_000_000:
            raise WikibooksError('This Wikibooks page is too large to preview. Open the original instead.')
        data = json.loads(body)
        if not isinstance(data, dict) or 'error' in data:
            raise WikibooksError('Wikibooks could not return this recipe. Try another dish.')
        return data
    except WikibooksError:
        raise
    except (OSError, ValueError, TypeError):
        raise WikibooksError('Wikibooks is unavailable right now. Try again; your saved cookbook still works.') from None


class Node:
    def __init__(self, tag='', attrs=None):
        self.tag, self.attrs, self.children = tag, dict(attrs or []), []

    def text(self):
        classes = set(self.attrs.get('class', '').split())
        if self.tag in ('script', 'style', 'sup') or classes & {'mw-editsection', 'reference', 'noprint', 'navbox', 'toc'}:
            return ''
        return ''.join(child.text() if isinstance(child, Node) else child for child in self.children)


class RecipeHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}:
            self.stack.append(node)
        elif tag == 'br':
            node.children.append(' ')

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                break

    def handle_data(self, text):
        self.stack[-1].children.append(text)


def extract_recipe(html):
    parser = RecipeHTML()
    parser.feed(html)
    ingredients, instructions = [], []
    section, boundary = None, 0

    def walk(node):
        nonlocal section, boundary
        if not isinstance(node, Node):
            return
        if node.tag in ('table', 'script', 'style', 'sup', 'aside') or set(node.attrs.get('class', '').split()) & {'toc', 'navbox', 'noprint', 'mw-editsection'}:
            return
        if re.fullmatch(r'h[1-6]', node.tag):
            level = int(node.tag[1])
            heading = re.sub(r'\s+', ' ', node.text()).strip().casefold()
            if heading in ('ingredients', 'ingredient list'):
                section, boundary = 'ingredients', level
            elif heading in ('procedure', 'preparation', 'directions', 'method', 'instructions'):
                section, boundary = 'instructions', level
            elif level <= boundary:
                section = None
            return
        if section and node.tag in ('li', 'p'):
            value = re.sub(r'\s+', ' ', node.text()).strip()
            # Ingredient prose is often an introduction, not an ingredient list.
            if value and (section == 'instructions' or node.tag == 'li'):
                (ingredients if section == 'ingredients' else instructions).append(value)
            return
        for child in node.children:
            walk(child)

    walk(parser.root)
    return ingredients, instructions


def search_recipes(query):
    # Search Cookbook namespace 102 and the Recipes category, not all wiki pages.
    words = re.findall(r'[^\W_]+', query, re.UNICODE)
    if not words:
        return []
    search = ' '.join('"' + word + '"' for word in words) + ' incategory:Recipes'
    data = request_wiki({'action': 'query', 'list': 'search', 'srsearch': search, 'srnamespace': 102, 'srlimit': 20, 'srprop': ''})
    query_data = data.get('query')
    rows = query_data.get('search') if isinstance(query_data, dict) else None
    if not isinstance(rows, list):
        raise WikibooksError('Wikibooks returned an unexpected search response.')
    result = []
    for row in rows:
        if isinstance(row, dict) and isinstance(row.get('pageid'), int) and not isinstance(row['pageid'], bool) and row['pageid'] > 0 and isinstance(row.get('title'), str) and row['title'].startswith('Cookbook:'):
            result.append({'page_id': str(row['pageid']), 'title': row['title'][9:], 'provider': 'wikibooks'})
    return result


def lookup_recipe(page_id):
    data = request_wiki({'action': 'parse', 'pageid': page_id, 'prop': 'text|revid', 'disableeditsection': 1})
    page = data.get('parse')
    if not isinstance(page, dict) or not isinstance(page.get('title'), str) or not page['title'].startswith('Cookbook:') or str(page.get('pageid')) != str(page_id):
        raise WikibooksError('Choose a recipe page from the Wikibooks Cookbook.')
    html = page.get('text')
    revision = page.get('revid')
    if not isinstance(html, str) or not isinstance(revision, int) or revision <= 0:
        raise WikibooksError('Wikibooks returned an unexpected recipe page.')
    ingredients, instructions = extract_recipe(html)
    if not ingredients or not instructions:
        raise WikibooksError('This page has no readable ingredient and method sections. Open the original recipe or try another result.')
    if len(ingredients) > 50 or len(instructions) > 30 or any(len(line) > 1500 for line in instructions) or any(len(line) > 600 for line in ingredients):
        raise WikibooksError('This recipe is too detailed for automatic import. Open the original and add it manually.')
    return {'page_id': str(page_id), 'revision': str(revision), 'title': page['title'][9:], 'ingredients': ingredients, 'instructions': instructions, 'provider': 'wikibooks'}
