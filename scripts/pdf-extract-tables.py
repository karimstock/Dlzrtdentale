#!/usr/bin/env python3
"""
JADOMI — PDF Table Extractor (pdfplumber)
Extracts product references and prices from PDF tables.
Called by Node.js scan-dashboard as a subprocess.

Usage: python3 pdf-extract-tables.py <pdf_path>
Output: JSON to stdout
"""
import pdfplumber
import json
import re
import sys

if len(sys.argv) < 2:
    print(json.dumps({"error": "Usage: pdf-extract-tables.py <pdf_path>"}))
    sys.exit(1)

pdf_path = sys.argv[1]

ref_pattern = re.compile(r'\b\d{2}\.[A-Za-z0-9]{3,}[A-Za-z0-9\/._-]*|33[A-Z]\.[A-Za-z0-9\/._-]+|\d{4}-\d{2,3}')
bad_ref = re.compile(r'^\d{2}\.\d{1,3}$')

products = []

try:
    with pdfplumber.open(pdf_path) as pdf:
        current_product = None
        current_brand = None

        for page in pdf.pages:
            tables = page.extract_tables()
            if not tables:
                continue

            for table in tables:
                for row in table:
                    if not row:
                        continue
                    cells = [str(c).strip() if c else '' for c in row]

                    # Product header
                    if cells[0] and len(cells[0]) > 3 and not ref_pattern.search(cells[0]):
                        header = cells[0].replace('\n', ' ').strip()
                        if ',' in header and len(header) < 80:
                            parts = header.split(',')
                            current_product = parts[0].strip()
                            current_brand = parts[-1].strip()
                        elif len(header) < 60 and not header.startswith('Par '):
                            current_product = header

                    refs_found = []
                    prices_found = []
                    descriptions = []

                    for cell in cells:
                        if not cell:
                            continue
                        for r in ref_pattern.findall(cell):
                            if not bad_ref.match(r):
                                refs_found.append(r)
                        for pm in re.finditer(r'(\d[\d ]*,\d{2})\b', cell):
                            try:
                                val = float(pm.group(1).replace(' ', '').replace(',', '.'))
                                if 0.5 < val < 50000:
                                    prices_found.append(val)
                            except:
                                pass
                        if not ref_pattern.search(cell) and len(cell) > 3 and len(cell) < 200:
                            clean = cell.replace('\n', ' ').strip()
                            if clean and not clean.startswith('Par ') and clean != "l'unité":
                                descriptions.append(clean)

                    if refs_found:
                        for ri, ref in enumerate(refs_found):
                            price = prices_found[min(ri, len(prices_found)-1)] if prices_found else None
                            desc = descriptions[0] if descriptions else None
                            products.append({
                                'ref': ref,
                                'product': current_product,
                                'brand': current_brand,
                                'description': desc,
                                'prixPromo': price,
                            })

    unique_refs = len(set(p['ref'] for p in products))
    with_price = sum(1 for p in products if p.get('prixPromo'))
    print(json.dumps({
        'ok': True,
        'uniqueRefs': unique_refs,
        'withPrice': with_price,
        'products': products
    }, ensure_ascii=False))

except Exception as e:
    print(json.dumps({'ok': False, 'error': str(e)}))
    sys.exit(1)
