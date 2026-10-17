#!/usr/bin/env python3
"""從 OLE-QS 題庫統計「主流段考範圍」，輸出 lib/data/exam-scopes.json。

用法：
    python3 scripts/build_exam_scopes.py <OLE-QS 路徑> [-o lib/data/exam-scopes.json]

原理：OLE-QS 的每份考卷都記了年級、學期、第幾次段考（document.exam_seq），
每一題都歸到教科書的節／課（tags.chapter：版本、冊、科、代號、名稱、章）。
所以「某次段考考哪些單元」可以直接數：同一個段考時段的所有考卷中，
有幾成考卷出現這個單元 → 出現率高的就是主流範圍。

- 一份卷裡某單元只出現 1 題、且占全卷不到 5% → 視為雜訊（多半是歸類誤差或複習題），不算該卷考了這單元
- 數學、自然各版本節次對齊（OLE-QS 的 MERGED 規則），三版本合併統計
- 國文、社會依版本分開統計；版本由章節歸類模型判斷（看不出時偏向翰林）
- 英語用 OLE-QS 的跨版本文法主題
- 只讀檔，不改動 OLE-QS
"""
import argparse
import collections
import json
import os
import re
import subprocess
import sys

DOC_RE = {k: re.compile(rf'^  {k}: (.+)$') for k in ('grade', 'subject', 'semester', 'exam_seq', 'academic_year_roc', 'city', 'id')}
MERGED = {'數學', '自然'}
SUBS = {'自然': ['生物', '理化', '地科'], '社會': ['歷史', '地理', '公民']}
NOISE_SHARE = 0.05


def scan(path):
    """回傳 (document 欄位, [每題的章節 dict])；用逐行掃描取代完整 YAML 解析（題庫 270MB，快很多）"""
    doc, qs = {}, []
    in_doc, cur, in_chapter = False, None, False
    with open(path, encoding='utf-8') as f:
        for line in f:
            if line.startswith('document:'):
                in_doc = True
                continue
            if line.startswith('questions:'):
                in_doc = False
                continue
            if in_doc:
                for k, rx in DOC_RE.items():
                    m = rx.match(line)
                    if m and k not in doc:
                        doc[k] = m.group(1).strip().strip("'\"")
                continue
            if line.startswith('- id: '):
                cur = {}
                qs.append(cur)
                in_chapter = False
                continue
            if cur is None:
                continue
            if line.startswith('    chapter:'):
                in_chapter = True
                continue
            if in_chapter:
                m = re.match(r'^      (publisher|book|subject|code|title|chapter): (.*)$', line)
                if m:
                    cur[m.group(1)] = m.group(2).strip().strip("'\"")
                    continue
                in_chapter = False
            m = re.match(r'^  type: (\S+)', line)
            if m:
                cur['_type'] = m.group(1)
    return doc, qs


CN = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10}


def cn_num(t):
    """十二 → 12、二十 → 20、七 → 7"""
    if '十' in t:
        a, _, b = t.partition('十')
        return (CN.get(a, 1) if a else 1) * 10 + (CN.get(b, 0) if b else 0)
    return CN.get(t, 0)


def sort_key(code):
    """1-1、1-2…依數字；「第十二課」依中文數字；語文常識等排在課文之後"""
    m = re.match(r'^第([一二三四五六七八九十]+)課', code)
    if m:
        return (1, cn_num(m.group(1)), code)
    if re.match(r'^[\d-]+$', code):
        return (0, [int(x) for x in code.split('-')], code)
    return (2, [], code)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('oleqs')
    ap.add_argument('-o', '--out', default=os.path.join(os.path.dirname(__file__), '..', 'lib', 'data', 'exam-scopes.json'))
    a = ap.parse_args()
    bank = os.path.join(a.oleqs, 'data', 'bank')
    files = sorted(f for f in os.listdir(bank) if f.endswith('.yaml'))

    # slot = (科目, 子科, 年級, 學期, 次數, 版本) → [每份卷的單元集合]
    slots = collections.defaultdict(list)
    unit_info = {}
    unit_q = collections.Counter()
    skipped = 0
    for i, name in enumerate(files):
        doc, qs = scan(os.path.join(bank, name))
        try:
            subject, grade, sem, seq = doc['subject'], int(doc['grade']), int(doc['semester']), int(doc['exam_seq'])
        except (KeyError, ValueError):
            skipped += 1
            continue
        per = collections.Counter()
        pubs = collections.Counter()
        for q in qs:
            if not q.get('code') or q['code'] in ('null', 'None', '~'):
                continue                      # 未歸類（例如國文字詞題只標「第N次段考範圍」）
            if q.get('publisher') in ('null', 'None', '~'):
                q['publisher'] = ''
            sub = q.get('subject') if subject in SUBS else ''
            key = (sub or '', q['code'])
            per[key] += 1
            pubs[q.get('publisher', '')] += 1
            unit_info.setdefault((subject, grade, sem, q.get('publisher', ''), key), (q.get('title', ''), q.get('chapter', '')))
        total = sum(per.values())
        if total < 5:
            skipped += 1
            continue
        units = {k for k, n in per.items() if n >= 2 or n / total >= NOISE_SHARE}
        pub = '*' if subject in MERGED else (pubs.most_common(1)[0][0] or '不確定')
        for sub in {k[0] for k in units}:
            sub_units = {k for k in units if k[0] == sub}
            slots[(subject, sub, grade, sem, seq, pub)].append(sub_units)
            if subject not in MERGED:
                slots[(subject, sub, grade, sem, seq, '*')].append(sub_units)
        for k in units:
            unit_q[(subject, grade, sem, k)] += per[k]
        if i % 1000 == 0:
            print(f'  {i}/{len(files)}', file=sys.stderr)

    def title_of(subject, grade, sem, pub, key):
        for p in ([pub] if pub != '*' else []) + ['翰林', '康軒', '南一', '']:
            if (subject, grade, sem, p, key) in unit_info:
                return unit_info[(subject, grade, sem, p, key)]
        return ('', '')

    out = {}
    for (subject, sub, grade, sem, seq, pub), docs in sorted(slots.items()):
        n = len(docs)
        if n < 3:
            continue
        cnt = collections.Counter(k for d in docs for k in d)
        units = []
        for key, c in cnt.most_common():
            share = c / n
            if share < 0.1:
                continue
            title, chapter = title_of(subject, grade, sem, pub, key)
            units.append({'code': key[1], 'title': title, 'chapter': chapter, 'share': round(share, 3)})
        units.sort(key=lambda u: sort_key(u['code']))
        out.setdefault(f'{subject}|{sub}|{grade}|{sem}|{seq}', {})[pub] = {'docs': n, 'units': units}

    try:
        commit = subprocess.check_output(['git', '-C', a.oleqs, 'rev-parse', '--short', 'HEAD'], text=True).strip()
    except Exception:
        commit = 'unknown'
    result = {
        'source': f'czpeanut/OLE-QS data/bank @ {commit}',
        'note': 'share = 該段考時段的考卷中，出現此單元的比例。由 scripts/build_exam_scopes.py 產生，請勿手改。',
        'slots': out,
    }
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, separators=(',', ':'))
    print(f'寫入 {a.out}：{len(out)} 個段考時段，略過 {skipped} 份卷', file=sys.stderr)


if __name__ == '__main__':
    main()
