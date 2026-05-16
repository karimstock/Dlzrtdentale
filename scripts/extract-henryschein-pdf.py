#!/usr/bin/env python3
"""
Henry Schein PDF Catalog Extractor V5
Extracts refs with FULL context: Product Title + Color/Variant + Size

Structure detected via font analysis:
- Font >= 18pt  → Category (ex: VÊTEMENTS / ACCESSOIRES)
- Font >= 10pt  → Product title (ex: MARINIÈRE EVASION SELEKTO)
- Font 7-8pt    → Refs, sizes, colors, descriptions

Color/variant detection: text at same X as refs below, no ref pattern, before refs
Size detection: text at same Y as ref, X to the right (XS, S, M, L, XL, XXL, XXXL)
"""

import sys
import re
import json
import fitz

SIZES = {'XS','S','M','L','XL','XXL','XXXL','XXXXL',
         'XS*','S*','M*','L*','XL*','XXL*','XXXL*','XXXXL*'}

SKIP_TITLES = {'garantie','ans','an','contenu','composition',
               'dm classe i','dm classe iia','dm classe iib','dm classe iii',
               'cabinet dentaire','grands comptes','www.henryschein.fr',
               'satisfait ou remboursé','satisfait','remboursé',
               'index','sommaire','table des matières','correspondance des tailles',
               'laboratoire dentaire'}

COLORS = {'blanc','noir','bleu','rouge','vert','gris','rose','violet','fuchsia',
          'turquoise','parme','anis','bordeaux','marine','beige','corail',
          'anthracite','prune','framboise','lavande','menthe','saumon',
          'ciel','nuit','kaki','camel','taupe','ivoire'}

def is_color_label(txt):
    """Detect color labels like 'Fuchsia/Blanc', 'Gris foncé', 'Turquoise'"""
    t = txt.lower().strip().rstrip('*')
    # Direct color
    if t in COLORS:
        return True
    # Compound color: "Gris foncé", "Bleu foncé", "Vert foncé"
    parts = t.replace('/', ' ').split()
    if any(p in COLORS for p in parts):
        return True
    # "Foncé" or "Clair" alone after a color context
    if t in ('foncé','clair','fonce','clair'):
        return True
    return False

def is_size(txt):
    return txt.strip().rstrip('*').upper() in {s.rstrip('*') for s in SIZES}

def extract_hs_products(pdf_path):
    doc = fitz.open(pdf_path)
    total_pages = len(doc)

    ref_pattern = re.compile(r'\b(\d{3,4})\s*-\s*(\d{4})\b')
    price_pattern = re.compile(r'(\d+[.,]\d{2})\s*(?:€|EUR|TTC|HT)', re.IGNORECASE)

    products = {}
    current_category = ""
    current_title = ""
    current_brand = ""

    for page_num in range(total_pages):
        page = doc[page_num]

        if (page_num + 1) % 50 == 0:
            print(f"  Page {page_num+1}/{total_pages} ({len(products)} refs)...", file=sys.stderr)

        # Extract all spans with position and size
        blocks = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)["blocks"]

        elements = []  # (y, x, size, text)
        for block in blocks:
            if block.get("type") != 0:
                continue
            for bline in block.get("lines", []):
                y = bline["bbox"][1]
                for span in bline.get("spans", []):
                    txt = span.get("text", "").strip()
                    size = span.get("size", 0)
                    x = span.get("origin", [bline["bbox"][0]])[0] if "origin" in span else bline["bbox"][0]
                    if txt and len(txt) >= 1:
                        elements.append((round(y, 1), round(x, 1), size, txt))

        elements.sort(key=lambda e: (e[0], e[1]))

        # ── PASS 1: Identify titles, colors, refs, sizes ──
        tagged = []  # (y, x, size, text, tag)

        for y, x, size, txt in elements:
            txt_clean = txt.strip()
            if not txt_clean:
                continue

            # Category (very large)
            if size >= 18 and not ref_pattern.search(txt_clean) and len(txt_clean) > 3:
                low = txt_clean.lower().strip()
                if low not in SKIP_TITLES and 'henryschein' not in low:
                    tagged.append((y, x, size, txt_clean, 'CATEGORY'))
                continue

            # Product title (large font)
            if size >= 10 and not ref_pattern.search(txt_clean):
                low = txt_clean.lower().strip()
                if low in SKIP_TITLES or 'henryschein.fr' in low:
                    continue
                if txt_clean.isdigit() or len(txt_clean) < 3:
                    continue
                tagged.append((y, x, size, txt_clean, 'TITLE'))
                continue

            # Ref
            if ref_pattern.search(txt_clean):
                tagged.append((y, x, size, txt_clean, 'REF'))
                continue

            # Size
            if is_size(txt_clean):
                tagged.append((y, x, size, txt_clean, 'SIZE'))
                continue

            # Color label (short text, title case, matches color list)
            if is_color_label(txt_clean) and len(txt_clean) < 30:
                tagged.append((y, x, size, txt_clean, 'COLOR'))
                continue

            # Compound color like "Fuchsia/Blanc"
            if '/' in txt_clean and len(txt_clean) < 30 and not txt_clean[0].isdigit():
                parts = txt_clean.lower().replace('/', ' ').split()
                if any(p in COLORS for p in parts):
                    tagged.append((y, x, size, txt_clean, 'COLOR'))
                    continue

            # Other label (description, spec, etc.)
            if len(txt_clean) > 3:
                tagged.append((y, x, size, txt_clean, 'LABEL'))

        # ── PASS 2: Build context and assign to refs ──
        page_title = current_title  # inherit from previous page
        page_color = ""
        page_brand = current_brand

        # First find all titles on this page (they reset context)
        page_titles_list = [(y, txt) for y, x, sz, txt, tag in tagged if tag == 'TITLE']

        # Group elements by Y position (same row = same line)
        for i, (y, x, size, txt, tag) in enumerate(tagged):

            if tag == 'CATEGORY':
                current_category = txt.title()
                continue

            if tag == 'TITLE':
                page_title = txt
                # Extract brand from title
                words = txt.split()
                brand_words = [w for w in words if w.isupper() and len(w) > 2
                               and w not in ('DM','LED','USB','POUR','LES','DES','AVEC','ET','EN','LA','LE')]
                if brand_words:
                    page_brand = brand_words[-1]
                page_color = ""  # reset color on new title
                continue

            if tag == 'COLOR':
                page_color = txt
                continue

            if tag != 'REF':
                continue

            # ── Process REF ──
            refs_found = ref_pattern.findall(txt)

            for ref_match in refs_found:
                ref = f"{ref_match[0]}-{ref_match[1]}"
                if ref in products:
                    continue

                # Find SIZE on same Y (within 3px tolerance)
                ref_size = ""
                for y2, x2, sz2, txt2, tag2 in tagged:
                    if tag2 == 'SIZE' and abs(y2 - y) < 3 and x2 > x:
                        ref_size = txt2.strip().rstrip('*')
                        break

                # If no explicit size, check text right after ref in same span
                if not ref_size:
                    ref_str = f"{ref_match[0]}-{ref_match[1]}"
                    after = txt.split(ref_str, 1)[-1].strip() if ref_str in txt else ""
                    after = re.sub(r'^[\s\-:.,]+', '', after)
                    after = ref_pattern.sub('', after).strip()
                    if after and is_size(after.split()[0] if after.split() else ""):
                        ref_size = after.split()[0].rstrip('*')
                        after = ' '.join(after.split()[1:])
                    # Check if after text is a useful description (not size, not ref)
                    inline_desc = after if after and len(after) > 2 and not is_size(after) else ""
                else:
                    # Get inline description (text after ref, excluding size)
                    ref_str = f"{ref_match[0]}-{ref_match[1]}"
                    after = txt.split(ref_str, 1)[-1].strip() if ref_str in txt else ""
                    after = re.sub(r'^[\s\-:.,]+', '', after)
                    after = ref_pattern.sub('', after).strip()
                    # Remove size from description
                    for s in SIZES:
                        after = after.replace(s, '').strip()
                    inline_desc = after if after and len(after) > 2 else ""

                # Also check text BEFORE ref on same span
                if not inline_desc:
                    ref_str = f"{ref_match[0]}-{ref_match[1]}"
                    before = txt.split(ref_str)[0].strip() if ref_str in txt else ""
                    before = re.sub(r'[\s\-:.,]+$', '', before)
                    before = ref_pattern.sub('', before).strip()
                    if before and len(before) > 2 and not is_size(before) and not is_color_label(before):
                        inline_desc = before

                # Also look at LABEL elements just after this ref (next element if not ref/size/color)
                if not inline_desc:
                    for j in range(i+1, min(i+3, len(tagged))):
                        y2, x2, sz2, txt2, tag2 = tagged[j]
                        if tag2 == 'LABEL' and abs(y2 - y) < 15:
                            inline_desc = txt2[:80]
                            break
                        if tag2 in ('REF', 'TITLE', 'CATEGORY', 'COLOR'):
                            break

                # ── BUILD FULL NAME ──
                parts = []
                if page_title:
                    parts.append(page_title)
                if page_color:
                    parts.append(page_color)
                if ref_size:
                    parts.append(ref_size)
                if inline_desc and inline_desc.lower() not in (page_title or '').lower():
                    parts.append(inline_desc)

                if not parts:
                    full_name = f"Henry Schein {ref}"
                elif len(parts) == 1:
                    full_name = parts[0]
                else:
                    full_name = parts[0] + " — " + " — ".join(parts[1:])

                if len(full_name) > 300:
                    full_name = full_name[:300]

                # Price
                price = None
                pm = price_pattern.search(txt)
                if pm:
                    try:
                        p = float(pm.group(1).replace(',', '.'))
                        if 0.1 < p < 50000:
                            price = p
                    except:
                        pass

                products[ref] = {
                    "ref": ref,
                    "product": full_name,
                    "main_product": page_title if page_title else None,
                    "color": page_color if page_color else None,
                    "size": ref_size if ref_size else None,
                    "sub_ref": inline_desc if inline_desc else None,
                    "brand": page_brand if page_brand else "Henry Schein",
                    "category": current_category if current_category else None,
                    "page": page_num + 1
                }
                if price:
                    products[ref]["price"] = price

        # Update persistent state
        current_title = page_title
        current_brand = page_brand

    doc.close()

    return {
        "ok": True,
        "engine": "henryschein-extractor-v5",
        "source": pdf_path.split('/')[-1],
        "pages": total_pages,
        "uniqueRefs": len(products),
        "withPrice": sum(1 for p in products.values() if p.get("price")),
        "withColor": sum(1 for p in products.values() if p.get("color")),
        "withSize": sum(1 for p in products.values() if p.get("size")),
        "products": list(products.values())
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 extract-henryschein-pdf.py <pdf_path>", file=sys.stderr)
        sys.exit(1)

    pdf_path = sys.argv[1]
    print(f"Extracting Henry Schein refs from {pdf_path}...", file=sys.stderr)
    result = extract_hs_products(pdf_path)
    print(f"Done: {result['uniqueRefs']} refs, {result['withPrice']} prices, {result['withColor']} colors, {result['withSize']} sizes", file=sys.stderr)
    print(json.dumps(result, ensure_ascii=False))
