"""Converts the five ESDC GIS table workbooks in this folder to one compact JSON file.
Run: python docs/sources/extract_gis_tables.py
Each entry is [income_from, income_to, monthly_amount] for the named column. Source: ESDC, Table of
Amounts October to December 2026 (open.canada.ca)."""
import json, re, zipfile, os
import xml.etree.ElementTree as ET

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
HERE = os.path.dirname(os.path.abspath(__file__))

def load(path):
    z = zipfile.ZipFile(path)
    ss = []
    if 'xl/sharedStrings.xml' in z.namelist():
        root = ET.fromstring(z.read('xl/sharedStrings.xml'))
        for si in root.findall('m:si', NS):
            ss.append(''.join(t.text or '' for t in si.iter('{%s}t' % NS['m'])))
    sheet = sorted(n for n in z.namelist() if re.match(r'xl/worksheets/sheet\d+\.xml', n))[0]
    rows = []
    for r in ET.fromstring(z.read(sheet)).iter('{%s}row' % NS['m']):
        cells = []
        for c in r.findall('m:c', NS):
            v = c.find('m:v', NS)
            if v is None:
                inline = c.find('m:is', NS)  # inline string cell (tables 2 to 5 store their headers this way)
                cells.append(''.join(t.text or '' for t in inline.iter('{%s}t' % NS['m'])) if inline is not None else '')
            else:
                cells.append(ss[int(v.text)] if c.get('t') == 's' else v.text)
        rows.append(cells)
    return rows

WANT = {
    'table1.xlsx': ['gistotal'],
    'table2.xlsx': ['gistotal'],
    'table3.xlsx': ['gistotal'],
    'table4.xlsx': ['gistotal', 'alwtotal'],
    'table5.xlsx': ['alwstotal'],
}
out = {}
for name, cols in WANT.items():
    rows = load(os.path.join(HERE, name))
    hdr = rows[0]
    for col in cols:
        i, a, b = hdr.index(col), hdr.index('income_from'), hdr.index('income_to')
        out[name.replace('.xlsx', '') + '.' + col] = [[round(float(r[a]), 2), round(float(r[b]), 2), round(float(r[i]), 2)] for r in rows[1:]]
with open(os.path.join(HERE, 'gis-tables-2026q4.json'), 'w') as f:
    json.dump(out, f, separators=(',', ':'))
print({k: len(v) for k, v in out.items()})
