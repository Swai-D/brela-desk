#!/usr/bin/env python3
"""
fill_template.py - fills the yellow [PLACEHOLDERS] of a .docx template from a JSON data file.

Highlight convention (same as the senior's Memorandum and Articles template)
  [HIGHLIGHTED LABEL]       fill-in: client information (label = the data key with spaces, e.g. COMPANY_NAME -> [COMPANY NAME])
  highlighted text, no [ ]  a provision to CONFIRM or choose (default wording, variant clause). It is left yellow for review;
                            use --accept-clauses once the clauses have been confirmed.

Usage:
  python fill_template.py TEMPLATE.docx DATA.json OUTPUT.docx [--accept-clauses]
  python fill_template.py --all TEMPLATES_DIR DATA.json OUTPUT_DIR [--accept-clauses]

DATA.json = {"common": {...keys used by many templates...}, "T02": {...keys for that template only...}}
Template id = the part of the file name before the first underscore (T01, T06A, F03 ...). manifest.json (same folder) gives defaults.

Rules
  * key missing from data (and no default)   -> [LABEL] stays yellow, listed as missing
  * value "" and key ends with _OPT           -> removed (brackets too)
  * value "" and key does not end with _OPT   -> the whole paragraph is deleted (unused attendee line etc.); in a table cell only blanked
  * otherwise                                 -> text inserted, brackets and highlight removed
"""
import sys, os, json, glob, zipfile
from lxml import etree
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
q = lambda t: '{%s}%s' % (W, t)
XMLSPACE = '{http://www.w3.org/XML/1998/namespace}space'

def label(k):
    o = k.endswith('_OPT'); b = k[:-4] if o else k
    return b.replace('_', ' ') + (', IF ANY' if o else '')

def load_manifest(folder):
    p = os.path.join(folder, 'manifest.json')
    return json.load(open(p, encoding='utf8')) if os.path.exists(p) else {}

def rtext(r): return ''.join(t.text or '' for t in r.findall(q('t')))
def is_hl(r):
    rp = r.find(q('rPr')); return rp is not None and rp.find(q('highlight')) is not None
def unhl(r):
    rp = r.find(q('rPr'))
    if rp is not None:
        for h in rp.findall(q('highlight')): rp.remove(h)

def fill(template, data, out, manifest=None, accept_clauses=False):
    manifest = manifest or {}
    tid = os.path.basename(template).split('_')[0]
    values = dict(manifest.get('defaults', {})); values.update(data.get('common', {})); values.update(data.get(tid, {}))
    keys = set(values)
    for t in manifest.get('templates', []):
        if t['id'] == tid: keys |= {p['key'] for p in t['placeholders']}
    l2k = {label(k): k for k in keys}
    zin = zipfile.ZipFile(template); zout = zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED)
    missing, filled, clauses = [], 0, 0
    for item in zin.infolist():
        raw = zin.read(item.filename)
        if item.filename.startswith('word/') and item.filename.endswith('.xml') and ('document' in item.filename or 'header' in item.filename):
            root = etree.fromstring(raw); delete = []
            for p in root.iter(q('p')):
                runs = [r for r in p if r.tag == q('r')]
                for i, r in enumerate(runs):
                    if not is_hl(r): continue
                    wrapped = 0 < i < len(runs) - 1 and rtext(runs[i - 1]) == '[' and rtext(runs[i + 1]) == ']'
                    key = l2k.get(rtext(r))
                    if wrapped and key:
                        if key not in values or values[key] is None:
                            missing.append(key); continue
                        val = str(values[key]); filled += 1
                        ts = r.findall(q('t'))
                        ts[0].text = val; ts[0].set(XMLSPACE, 'preserve')
                        for extra in ts[1:]: r.remove(extra)
                        unhl(r)
                        for br in (runs[i - 1], runs[i + 1]): p.remove(br)
                        if val == '' and not key.endswith('_OPT'):
                            if not any(a.tag == q('tc') for a in p.iterancestors()): delete.append(p)
                    elif not wrapped:           # clause-level highlight (provision to confirm)
                        if accept_clauses: unhl(r)
                        else: clauses += 1
                    else:
                        missing.append('?' + rtext(r))
            for p in set(delete):
                if p.getparent() is not None: p.getparent().remove(p)
            raw = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
        zout.writestr(item, raw)
    zout.close()
    return sorted(set(missing)), filled, clauses

if __name__ == '__main__':
    a = [x for x in sys.argv[1:] if not x.startswith('--') or x == '--all']; acc = '--accept-clauses' in sys.argv
    if not a: print(__doc__); sys.exit(1)
    if a[0] == '--all':
        folder, datafile, outdir = a[1:4]; data = json.load(open(datafile, encoding='utf8')); os.makedirs(outdir, exist_ok=True); man = load_manifest(folder)
        for t in sorted(glob.glob(os.path.join(folder, '*.docx'))):
            miss, n, c = fill(t, data, os.path.join(outdir, os.path.basename(t)), man, acc)
            print('%-68s filled %-3d clauses-to-confirm %-2d still yellow: %s' % (os.path.basename(t), n, c, ', '.join(miss) or '-'))
    else:
        t, datafile, out = a[:3]; data = json.load(open(datafile, encoding='utf8'))
        miss, n, c = fill(t, data, out, load_manifest(os.path.dirname(os.path.abspath(t))), acc)
        print('filled', n, '| clauses to confirm:', c, '| still yellow:', ', '.join(miss) or '-')
