#!/usr/bin/env python3
"""
JADOMI — PDF Pro Extractor (PyMuPDF + pdfplumber hybrid)
Extracts ALL product references and prices from dental catalogs.
Handles large files (300+ Mo) without OOM by processing page-by-page.

Usage: python3 pdf-extract-pro.py <pdf_path>
Output: JSON to stdout
"""
import sys
import json
import re
import fitz  # PyMuPDF

if len(sys.argv) < 2:
    print(json.dumps({"ok": False, "error": "Usage: pdf-extract-pro.py <pdf_path>"}))
    sys.exit(1)

pdf_path = sys.argv[1]

# Reference patterns for all known suppliers
REF_PATTERNS = [
    re.compile(r'33[A-Z]\.[A-Za-z0-9\/._-]+'),                    # DPI Septaline
    re.compile(r'\b\d{2}\.[A-Za-z0-9]{3,}[A-Za-z0-9\/._-]*'),     # DPI supplier refs
    re.compile(r'\d{4}-\d{2,3}'),                                   # MegaDental / GACD
    re.compile(r'[Rr][ée]f\.?\s*([\w]+-[\w]+)'),                    # "Réf. XXX-XXX"
]
BAD_REF = re.compile(r'^\d{2}\.\d{1,3}$')
PRICE_RE = re.compile(r'(\d[\d\s]*[,\.]\d{2})\s*€?')
JUNK_RE = re.compile(r'dentalpromotion|megadental|gacd\.fr|www\.|http|Lisez attentivement|Dispositifs? m[ée]dicaux|Garantie inconditionnelle|se r[ée]f[ée]rer aux CGV', re.I)

def extract_refs_from_text(text):
    """Extract all references from a text string"""
    refs = set()
    for pattern in REF_PATTERNS:
        for m in pattern.finditer(text):
            ref = m.group(0) if m.lastindex is None else m.group(1)
            if ref and not BAD_REF.match(ref) and len(ref) >= 4:
                refs.add(ref)
    # Also split concatenated refs: "13.70660713.70684013.706563"
    for m in re.finditer(r'(\d{2}\.[A-Za-z0-9]{5,}){2,}', text):
        parts = re.findall(r'\d{2}\.[A-Za-z0-9]+', m.group(0))
        for p in parts:
            if not BAD_REF.match(p):
                refs.add(p)
    # Split concatenated XXXX-XXX refs
    for m in re.finditer(r'(\d{4}-\d{2,3}){2,}', text):
        parts = re.findall(r'\d{4}-\d{2,3}', m.group(0))
        refs.update(parts)
    return refs

def extract_prices_from_text(text):
    """Extract all prices from a text string"""
    prices = []
    for m in PRICE_RE.finditer(text):
        try:
            val = float(m.group(1).replace(' ', '').replace(',', '.'))
            if 0.5 < val < 50000:
                prices.append(val)
        except:
            pass
    return prices

products = []
all_refs = set()
page_count = 0
current_product = None
current_brand = None

try:
    doc = fitz.open(pdf_path)
    page_count = len(doc)
    print(f"Processing {page_count} pages...", file=sys.stderr)

    for page_num in range(page_count):
        if page_num % 100 == 0 and page_num > 0:
            print(f"  Page {page_num}/{page_count} ({len(all_refs)} refs)...", file=sys.stderr)

        page = doc[page_num]

        # === Strategy 1: PyMuPDF table extraction ===
        try:
            tables = page.find_tables()
            for table in tables:
                for row in table.extract():
                    if not row:
                        continue
                    cells = [str(c).strip() if c else '' for c in row]
                    row_text = ' '.join(cells)

                    if JUNK_RE.search(row_text):
                        continue

                    # Product header detection
                    if cells[0] and len(cells[0]) > 3:
                        header = cells[0].replace('\n', ' ').strip()
                        if ',' in header and len(header) < 80:
                            has_ref = any(p.search(header) for p in REF_PATTERNS)
                            if not has_ref:
                                parts = header.split(',')
                                current_product = parts[0].strip()
                                current_brand = parts[-1].strip()

                    # Extract refs and prices from all cells
                    row_refs = set()
                    row_prices = []
                    row_descs = []

                    for cell in cells:
                        if not cell:
                            continue
                        cell_refs = extract_refs_from_text(cell)
                        row_refs.update(cell_refs)
                        row_prices.extend(extract_prices_from_text(cell))
                        # Description: text without refs/prices
                        if not cell_refs and len(cell) > 3 and len(cell) < 200:
                            clean = cell.replace('\n', ' ').strip()
                            if clean and not clean.startswith('Par ') and clean != "l'unité":
                                row_descs.append(clean)

                    for ri, ref in enumerate(row_refs):
                        if ref in all_refs:
                            # Update price if we find one
                            for p in products:
                                if p['ref'] == ref and not p.get('prixPromo') and row_prices:
                                    p['prixPromo'] = row_prices[0]
                            continue
                        all_refs.add(ref)
                        price = row_prices[min(ri, len(row_prices)-1)] if row_prices else None
                        desc = row_descs[0] if row_descs else None
                        products.append({
                            'ref': ref,
                            'product': current_product,
                            'brand': current_brand,
                            'description': desc,
                            'prixPromo': price,
                            'page': page_num + 1,
                        })
        except Exception as e:
            pass  # Some pages have no tables

        # === Strategy 2: Full text extraction (catches non-table refs) ===
        try:
            text = page.get_text("text")
            if not text:
                continue

            lines = [l.strip() for l in text.split('\n') if l.strip()]

            for li, line in enumerate(lines):
                if JUNK_RE.search(line):
                    continue

                # Product name detection (uppercase lines)
                if len(line) > 4 and len(line) < 80 and not any(p.search(line) for p in REF_PATTERNS):
                    upper_ratio = len(re.findall(r'[A-ZÀ-Ü]', line)) / max(len(line.replace(' ', '')), 1)
                    if upper_ratio > 0.7:
                        if not re.match(r'^(OFFRE|MEGA|SEULEMENT|NOUVEAU|DENTAL|DPI|NOTE)', line):
                            current_product = line.strip()

                # Extract refs from this line
                line_refs = extract_refs_from_text(line)
                line_prices = extract_prices_from_text(line)

                for ref in line_refs:
                    if ref in all_refs:
                        continue
                    all_refs.add(ref)

                    # Try to find price: same line, or next line
                    price = line_prices[0] if line_prices else None
                    if not price and li + 1 < len(lines):
                        next_prices = extract_prices_from_text(lines[li + 1])
                        if next_prices:
                            price = next_prices[0]

                    # Description
                    desc_part = re.split(r'33[A-Z]\.|(?<!\d)\d{2}\.|\d{4}-\d', line)[0].strip()
                    if len(desc_part) < 3:
                        for j in range(li - 1, max(li - 4, -1), -1):
                            prev = lines[j]
                            if prev and len(prev) > 3 and not any(p.search(prev) for p in REF_PATTERNS) and not JUNK_RE.search(prev):
                                desc_part = prev[:200]
                                break

                    products.append({
                        'ref': ref,
                        'product': current_product,
                        'brand': current_brand,
                        'description': desc_part[:300] if desc_part else None,
                        'prixPromo': price,
                        'page': page_num + 1,
                    })

                # Standalone price → attach to last ref without price
                if not line_refs and line_prices and len(line) < 20:
                    for p in reversed(products[-10:]):
                        if p.get('ref') and not p.get('prixPromo'):
                            p['prixPromo'] = line_prices[0]
                            break
        except Exception as e:
            pass

    doc.close()

except Exception as e:
    print(json.dumps({"ok": False, "error": str(e)}))
    sys.exit(1)

unique_refs = len(all_refs)
with_price = sum(1 for p in products if p.get('prixPromo'))

print(f"Done: {unique_refs} refs, {with_price} prices", file=sys.stderr)

print(json.dumps({
    "ok": True,
    "engine": "pymupdf-pro",
    "pages": page_count,
    "uniqueRefs": unique_refs,
    "withPrice": with_price,
    "products": products
}, ensure_ascii=False))
