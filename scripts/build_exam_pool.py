#!/usr/bin/env python3
"""從 OLE-QS 題庫（唯讀）產生「段考衝刺」的題目池與題型目錄：data/pool/數學-<年級>-<學期>.json

    python3 scripts/build_exam_pool.py <OLE-QS 路徑>

做法沿用 czpeanut/Prac-sys 的 scripts/build_pool.py（收錄條件相同），擴大到國一～國三全部數學單元，
並多算一件 Prac-sys 沒有的東西：**每個題型在真實段考中的出現頻率**（每份段考平均幾題），
用來把「學生還缺什麼」換算成段考會丟幾分。

讀的 OLE-QS 資料（全部唯讀，不寫回、不留下 __pycache__）：
  - data/bank/*.yaml                               題目、答案、出處、第幾次段考
  - data/curriculum/math_patterns/*.yaml           各單元的題型目錄（名稱、說明）
  - data/pipeline_records/math_patterns_*.tar.gz   每題歸到哪個題型、難度
  - apps/api/quality.py                            品管閘門（與組卷平台同一套）

收錄條件（學生要能自己作答、自動對答案）：
  - 單選題、通過品管閘門、有答案且不是「有疑義」
  - 沒有附圖／選項圖／共用素材／題組前文（圖檔不在版控裡，看不到圖就沒辦法作答）；題幹寫「如圖」的也排除
  - 題幹與選項完全相同的只留一題（同一份卷常被多校沿用）
頻率統計則用「全部有題型歸類的題目」（含帶圖的），才反映真實段考的配題。
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import json
import re
import subprocess
import sys
import tarfile
from datetime import datetime, timezone
from pathlib import Path

import yaml

try:
    from yaml import CSafeLoader as Loader  # 有 libyaml 時快很多
except ImportError:  # pragma: no cover
    from yaml import SafeLoader as Loader

REPO = Path(__file__).resolve().parent.parent
OTHER = 'OTHER'
OTHER_NAME = '其他題型'
FIGURE_WORDS = re.compile(r'如圖|下圖|右圖|左圖|附圖|上圖|圖中|圖\s*[(（]?[一二三四五六七八九十\d]')
BOOK = {'7-1': '七上', '7-2': '七下', '8-1': '八上', '8-2': '八下', '9-1': '九上', '9-2': '九下'}


def has_figure(q: dict) -> bool:
    return bool(q.get('assets') or q.get('shared_asset') or (q.get('group_stem') or '').strip()
                or any(o.get('asset') for o in q.get('options') or []))


def answer_ok(q: dict) -> bool:
    ans = q.get('answer')
    if not ans or q.get('answer_status') == 'disputed':
        return False
    return all(str(a).strip() for a in (ans if isinstance(ans, list) else [ans]))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('oleqs', type=Path)
    ap.add_argument('-o', '--out', type=Path, default=REPO / 'data' / 'pool')
    args = ap.parse_args()
    oleqs = args.oleqs.resolve()

    sys.dont_write_bytecode = True          # 唯讀：不在 OLE-QS 裡留下 __pycache__
    sys.path.insert(0, str(oleqs))
    from apps.api.quality import evaluate  # noqa: E402

    tars = sorted((oleqs / 'data/pipeline_records').glob('math_patterns_*.tar.gz'))
    if not tars:
        sys.exit('找不到 OLE-QS/data/pipeline_records/math_patterns_*.tar.gz')
    cls: dict[str, dict] = {}
    units: list[str] = []
    with tarfile.open(tars[-1]) as tf:
        for m in tf.getmembers():
            mm = re.match(r'math_patterns/(\d-\d_\d+-\d+)\.json$', m.name)
            if not mm:
                continue
            u = mm.group(1)
            units.append(u)
            for qid, r in json.load(tf.extractfile(m))['results'].items():
                cls[qid] = {'unit': u, 'type': r.get('type_code') or OTHER, 'difficulty': r.get('difficulty')}
    units.sort(key=lambda u: [int(x) for x in re.findall(r'\d+', u)])

    docs = sorted({qid.rsplit('_s', 1)[0] for qid in cls})
    print(f'{len(units)} 個單元、{len(cls)} 題有題型歸類、{len(docs)} 份卷', file=sys.stderr)

    by_book: dict[str, list[dict]] = collections.defaultdict(list)
    seen: set[str] = set()
    skipped = collections.Counter()
    # 頻率：每個段考時段（年級-學期-次數）有幾份卷、每個題型總共出現幾題
    slot_docs: dict[str, int] = collections.Counter()
    slot_types: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)

    for i, d in enumerate(docs):
        path = oleqs / 'data/bank' / f'{d}.yaml'
        if not path.exists():
            skipped['卷檔不存在'] += 1
            continue
        doc = yaml.load(path.read_text(encoding='utf-8'), Loader=Loader)
        meta = doc['document']
        slot = f"{meta.get('grade')}-{meta.get('semester')}-{meta.get('exam_seq')}"
        slot_docs[slot] += 1
        cite = f"[{meta.get('city', '')} {meta.get('school_short', '')} {meta.get('academic_year_roc', '')}]"
        for q in doc.get('questions') or []:
            c = cls.get(q['id'])
            if not c:
                continue
            slot_types[slot][f"{c['unit']}:{c['type']}"] += 1
            if q.get('type') != 'single':
                skipped['不是單選題'] += 1
                continue
            if not evaluate(q, doc)[0]:
                skipped['未通過品管閘門'] += 1
                continue
            if not answer_ok(q):
                skipped['沒有答案或答案有疑義'] += 1
                continue
            stem = (q.get('stem') or '').strip()
            if has_figure(q) or FIGURE_WORDS.search(stem):
                skipped['需要附圖'] += 1
                continue
            opts = q.get('options') or []
            ans = q['answer'] if isinstance(q['answer'], list) else [q['answer']]
            labels = [str(o.get('label', '')).strip() for o in opts]
            if len(ans) != 1 or str(ans[0]).strip() not in labels or not (2 <= len(opts) <= 5):
                skipped['答案對不上選項'] += 1
                continue
            key = hashlib.sha1('\x1f'.join([re.sub(r'\s+', '', stem)] +
                                           [re.sub(r'\s+', '', o.get('content') or '') for o in opts]).encode()).hexdigest()
            if key in seen:
                skipped['重複題'] += 1
                continue
            seen.add(key)
            book = c['unit'].split('_')[0]
            by_book[book].append({
                'id': q['id'],
                'unit': c['unit'].split('_')[1],
                'type': c['type'],
                'difficulty': c['difficulty'],
                'stem': stem,
                'options': [str(o.get('content') or '').strip() for o in opts],
                'answer': labels.index(str(ans[0]).strip()),
                'answerStatus': q.get('answer_status'),
                'cite': cite,
            })
        if i % 200 == 0:
            print(f'  {i}/{len(docs)}', file=sys.stderr)

    args.out.mkdir(parents=True, exist_ok=True)
    try:
        commit = subprocess.check_output(['git', '-C', str(oleqs), 'rev-parse', '--short', 'HEAD'], text=True).strip()
    except Exception:
        commit = 'unknown'

    total = 0
    for book in sorted(by_book):
        qs = by_book[book]
        n_type = collections.Counter((q['unit'], q['type']) for q in qs)
        unit_meta = []
        for u in [u for u in units if u.startswith(book + '_')]:
            code = u.split('_')[1]
            cat = yaml.load((oleqs / 'data/curriculum/math_patterns' / f'{u}.yaml').read_text(encoding='utf-8'), Loader=Loader)
            types = [{'code': t['code'], 'name': t['name'], 'desc': t.get('desc', ''), 'n': n_type[(code, t['code'])]}
                     for t in cat.get('types') or []]
            if n_type[(code, OTHER)]:
                types.append({'code': OTHER, 'name': OTHER_NAME, 'desc': '題型目錄歸不進去的題目', 'n': n_type[(code, OTHER)]})
            unit_meta.append({'code': code, 'title': cat['unit']['title'], 'types': types})
        # 每個段考次別：題型「每份卷平均出現幾題」
        g, s = book.split('-')
        freq = {}
        for seq in ('1', '2', '3'):
            slot = f'{g}-{s}-{seq}'
            if not slot_docs.get(slot):
                continue
            freq[seq] = {'docs': slot_docs[slot],
                         'perPaper': {k.split('_', 1)[1]: round(v / slot_docs[slot], 3)
                                      for k, v in slot_types[slot].items() if k.startswith(book + '_')}}
        out = {'source': f'czpeanut/OLE-QS @ {commit}', 'builtAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
               'subject': '數學', 'book': book, 'bookName': BOOK.get(book, book),
               'units': unit_meta, 'freq': freq, 'questions': qs}
        path = args.out / f'數學-{book}.json'
        path.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        total += len(qs)
        print(f'  {BOOK.get(book, book)}：{len(qs)} 題、{len(unit_meta)} 單元、{sum(len(u["types"]) for u in unit_meta)} 題型 → {path.name}'
              f'（{path.stat().st_size // 1024} KB）', file=sys.stderr)
    print(f'題目池共 {total} 題', file=sys.stderr)
    for k, v in skipped.most_common():
        print(f'  排除 {v} 題：{k}', file=sys.stderr)


if __name__ == '__main__':
    main()
