from bs4 import BeautifulSoup
import json
import re

html_path = 'e:/ammar/KKN/eco-enzim/index.html'
json_path = 'e:/ammar/KKN/eco-enzim/data/content.json'

with open(json_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

texts = data.get('texts', {})

with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

soup = BeautifulSoup(html, 'html.parser')

# Update texts
for el in soup.find_all(attrs={"data-edit-key": True}):
    key = el['data-edit-key']
    if key in texts:
        # Clear existing contents
        el.clear()
        
        # We need to append HTML string, so we can parse it first to support <br> and <span>
        val = texts[key]
        parsed_val = BeautifulSoup(val, 'html.parser')
        
        el.append(parsed_val)
        
# Save the updated html
with open(html_path, 'w', encoding='utf-8') as f:
    f.write(str(soup))

print("Successfully updated index.html with new default texts.")
