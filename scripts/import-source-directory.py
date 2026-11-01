#!/usr/bin/env python3
"""
Authoritative import script for VIP Tracker Source Directory.
Parses data/VIP Tracker Source Directory.xlsx into normalized application data.
Maintains 5 independent inventories with strict fidelity:
  1. Lawo Sources (Cols 1 & 2)
  2. Lawo Processing Sources/Destinations (Cols 3 & 4)
  3. Lawo Destinations / Lawo-to-Evertz Tielines (Cols 5 & 6)
  4. Evertz Sources (Cols 7 & 8)
  5. Evertz MV Inputs (Cols 9 & 10)
"""

import zipfile
import xml.etree.ElementTree as ET
import re
import os
import json
import hashlib
from datetime import datetime, timezone

def create_source_id(name: str) -> str:
    slug = re.sub(r'[^A-Z0-9_-]', '_', name.strip().upper())
    return f"SRC:{slug}"

def create_dest_id(name: str) -> str:
    # name is MV-XX-YY
    return f"DEST:{name.strip()}"

def classify_source_category(raw_name: str) -> str:
    upper = raw_name.strip().upper()
    if re.search(r'TEST|COLOR|BARS|TONE|BLACK|SYNC', upper):
        return 'Test'
    if re.search(r'^CAP\b|^CAPTURE\b|ENC\b|ENCODER', upper):
        return 'Capture Encoder'
    if re.search(r'^J2K.*CLIP|^J2K_CLIP', upper):
        return 'J2K Clip'
    if re.search(r'^J2K.*RPL|^J2K.*REPLAY', upper):
        return 'J2K Replay'
    if re.search(r'^JXS.*CLIP|^JXS_CLIP', upper):
        return 'JXS Clip'
    if re.search(r'^JXS.*RPL|^JXS.*REPLAY|^JXS DEC|^JXS ENC', upper):
        return 'JXS Replay'
    if re.search(r'^MV\b|^VIP\b|^MULTI\b', upper):
        return 'Multiview'
    if re.search(r'^SW\b|^SWR\b|^SWITCHER\b|^ME\b|^AUX\b|^PGM\b|^PST\b', upper):
        return 'Switcher'
    if re.search(r'^TX\b|^TRANS\b|^SAT\b|^FIBER\b', upper):
        return 'Transmission'
    if re.search(r'^VCAM\b|^CAM\b|^ROBO\b', upper):
        return 'Virtual Camera'
    if re.search(r'^VING\b|^VINGEST\b|^INGEST\b', upper):
        return 'Virtual Ingest'
    if re.search(r'^VPGM\b|^PROG\b', upper):
        return 'Virtual Program'
    if re.search(r'^VTIE\b|^TIE\b', upper):
        return 'Virtual Tie'
    return 'Other'

def infer_vendor(name: str, type_str: str) -> str | None:
    combined = f"{name} {type_str}".upper()
    if 'LIVEU' in combined: return 'LiveU'
    if 'HAIVISION' in combined: return 'Haivision'
    if 'AJA' in combined: return 'AJA'
    if 'QUICKLINK' in combined: return 'QuickLink'
    if 'BLACKMAGIC' in combined: return 'Blackmagic Design'
    if 'SONY' in combined: return 'Sony'
    if 'ROSS' in combined: return 'Ross'
    if 'APPEAR' in combined: return 'Appear'
    if 'AWS' in combined: return 'AWS'
    if 'CUESCRIPT' in combined: return 'CueScript'
    if 'GNURAL' in combined: return 'Gnural'
    if 'MAGEWELL' in combined: return 'Magewell'
    if 'AI-MEDIA' in combined or 'AIMEDIA' in combined: return 'AI-Media'
    if 'EVERTZ' in combined: return 'Evertz'
    if 'LAWO' in combined: return 'Lawo'
    return None

def main():
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    xlsx_path = os.path.join(repo_root, 'data', 'VIP Tracker Source Directory.xlsx')
    output_ts_path = os.path.join(repo_root, 'src', 'data', 'seed', 'sourceInventory.ts')

    print(f"Reading workbook: {xlsx_path}")
    if not os.path.exists(xlsx_path):
        raise FileNotFoundError(f"Workbook not found at {xlsx_path}")

    with open(xlsx_path, 'rb') as f:
        file_bytes = f.read()
        file_hash = hashlib.sha256(file_bytes).hexdigest()

    with zipfile.ZipFile(xlsx_path, 'r') as z:
        ns = {'main': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        shared_strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            sst_tree = ET.fromstring(z.read('xl/sharedStrings.xml'))
            for si in sst_tree.findall('main:si', ns):
                texts = [t.text for t in si.findall('.//main:t', ns) if t.text]
                shared_strings.append("".join(texts))

        sheet_tree = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
        rows = sheet_tree.findall('.//main:row', ns)

        def col_to_num(col_str):
            num = 0
            for c in col_str:
                num = num * 26 + (ord(c.upper()) - ord('A')) + 1
            return num

        def parse_cell_ref(ref):
            m = re.match(r'([A-Z]+)([0-9]+)', ref)
            return m.group(1), int(m.group(2))

        parsed_rows = {}
        for r in rows:
            row_idx = int(r.attrib.get('r', 0))
            cells = {}
            for c in r.findall('main:c', ns):
                ref = c.attrib.get('r')
                col_str, r_num = parse_cell_ref(ref)
                col_num = col_to_num(col_str)
                t = c.attrib.get('t')
                v_elem = c.find('main:v', ns)
                val = v_elem.text if v_elem is not None else None
                if t == 's' and val is not None:
                    val = shared_strings[int(val)]
                cells[col_num] = val
            parsed_rows[row_idx] = cells

    header_row = parsed_rows[1]
    expected_headers = {
        1: 'Lawo Sources',
        2: 'Lawo Source Type',
        3: 'Lawo Processing Sources/Destinations',
        4: 'Lawo Processing Type',
        5: 'Lawo Destinations / Lawo-to-Evertz Tielines',
        6: 'Tieline Type',
        7: 'Evertz Sources',
        8: 'Evertz Source Type',
        9: 'Evertz MV Inputs',
        10: 'MV Input Type',
    }
    for col_idx, exp_title in expected_headers.items():
        actual = header_row.get(col_idx)
        if actual != exp_title:
            raise ValueError(f"Header mismatch in col {col_idx}: expected {repr(exp_title)}, got {repr(actual)}")

    # Extract 5 groups
    lawo_sources_raw = [(parsed_rows[r][1], parsed_rows[r][2]) for r in sorted(parsed_rows.keys()) if r > 1 and parsed_rows[r].get(1)]
    lawo_proc_raw = [(parsed_rows[r][3], parsed_rows[r][4]) for r in sorted(parsed_rows.keys()) if r > 1 and parsed_rows[r].get(3)]
    lawo_tielines_raw = [(parsed_rows[r][5], parsed_rows[r][6]) for r in sorted(parsed_rows.keys()) if r > 1 and parsed_rows[r].get(5)]
    evertz_sources_raw = [(parsed_rows[r][7], parsed_rows[r][8]) for r in sorted(parsed_rows.keys()) if r > 1 and parsed_rows[r].get(7)]
    mv_inputs_raw = [(parsed_rows[r][9], parsed_rows[r][10]) for r in sorted(parsed_rows.keys()) if r > 1 and parsed_rows[r].get(9)]

    # Validate zero duplicates within each list
    for name_list, grp_label in [
        (lawo_sources_raw, 'Lawo Sources'),
        (lawo_proc_raw, 'Lawo Processing Sources/Destinations'),
        (lawo_tielines_raw, 'Lawo Destinations / Tielines'),
        (evertz_sources_raw, 'Evertz Sources'),
        (mv_inputs_raw, 'Evertz MV Inputs'),
    ]:
        seen = set()
        for item_name, _ in name_list:
            if item_name in seen:
                raise ValueError(f"Duplicate entry found in {grp_label}: {item_name}")
            seen.add(item_name)

    # Build SourceInventoryItem entries
    def make_inventory_item(name: str, item_type: str, category_group: str, is_dest: bool = False):
        cat = classify_source_category(name)
        item_id = create_dest_id(name) if is_dest else create_source_id(name)
        return {
            'id': item_id,
            'name': name,
            'displayName': name,
            'category': cat,
            'type': item_type,
            'inventoryCategory': category_group,
            'rawType': item_type,
        }

    lawo_sources_items = [make_inventory_item(n, t, 'lawo-source') for n, t in lawo_sources_raw]
    lawo_proc_items = [make_inventory_item(n, t, 'lawo-processing') for n, t in lawo_proc_raw]
    lawo_tielines_items = [make_inventory_item(n, t, 'lawo-destination/tieline') for n, t in lawo_tielines_raw]
    evertz_sources_items = [make_inventory_item(n, t, 'evertz-source') for n, t in evertz_sources_raw]
    mv_inputs_items = [make_inventory_item(n, t, 'evertz-mv-input', is_dest=True) for n, t in mv_inputs_raw]

    # Build facility Source[] records
    # 1. Processing devices (138)
    proc_lookup = {n: t for n, t in lawo_proc_raw}
    seed_processing_sources = []
    for n, t in lawo_proc_raw:
        seed_processing_sources.append({
            'id': create_source_id(n),
            'name': n,
            'normalizedName': n.strip().upper(),
            'category': classify_source_category(n),
            'active': True,
            'upstreamSourceId': None,
            'sourceType': 'processing',
            'deviceType': t,
            'vendor': infer_vendor(n, t),
            'router': 'Lawo',
            'routeRole': 'processing',
            'inventoryCategory': 'lawo-processing',
            'inventoryCategories': ['lawo-source', 'lawo-processing'],
        })

    # 2. Originating Lawo sources (445 - 138 = 307)
    seed_lawo_origin_sources = []
    for n, t in lawo_sources_raw:
        if n in proc_lookup:
            continue
        seed_lawo_origin_sources.append({
            'id': create_source_id(n),
            'name': n,
            'normalizedName': n.strip().upper(),
            'category': classify_source_category(n),
            'active': True,
            'upstreamSourceId': None,
            'sourceType': 'originating',
            'deviceType': t,
            'vendor': infer_vendor(n, t),
            'router': 'Lawo',
            'routeRole': 'lawo_source',
            'inventoryCategory': 'lawo-source',
            'inventoryCategories': ['lawo-source'],
        })

    # 3. Tieline sources (117)
    tieline_lookup = {n: t for n, t in lawo_tielines_raw}
    seed_tieline_sources = []
    for n, t in lawo_tielines_raw:
        seed_tieline_sources.append({
            'id': create_source_id(n),
            'name': n,
            'normalizedName': n.strip().upper(),
            'category': classify_source_category(n),
            'active': True,
            'upstreamSourceId': None,
            'sourceType': 'virtual',
            'deviceType': None,
            'vendor': None,
            'router': 'Both',
            'routeRole': 'tieline',
            'inventoryCategory': 'lawo-destination/tieline',
            'inventoryCategories': ['lawo-destination/tieline', 'evertz-source'],
        })

    # 4. Direct Evertz sources (267 - 117 = 150)
    seed_direct_evertz_sources = []
    for n, t in evertz_sources_raw:
        if n in tieline_lookup:
            continue
        seed_direct_evertz_sources.append({
            'id': create_source_id(n),
            'name': n,
            'normalizedName': n.strip().upper(),
            'category': classify_source_category(n),
            'active': True,
            'upstreamSourceId': None,
            'sourceType': 'originating',
            'deviceType': None,
            'vendor': None,
            'router': 'Evertz',
            'routeRole': 'evertz_source',
            'inventoryCategory': 'evertz-source',
            'inventoryCategories': ['evertz-source'],
        })

    # All Evertz Sources = 117 tielines + 150 direct = 267
    seed_evertz_sources = seed_tieline_sources + seed_direct_evertz_sources

    # Unified all sources = 307 + 138 + 117 + 150 = 712
    seed_all_sources = seed_lawo_origin_sources + seed_processing_sources + seed_tieline_sources + seed_direct_evertz_sources

    # Write sourceInventory.ts
    print(f"Writing generated source inventory to {output_ts_path}...")
    ts_code = f"""/**
 * Authoritative normalized source inventory generated from:
 *   data/VIP Tracker Source Directory.xlsx
 *
 * Hash: {file_hash}
 * Generated: {datetime.now(timezone.utc).isoformat()}
 *
 * DO NOT EDIT MANUALLY. Run 'npm run import:sources' to re-generate.
 */

import {{ Source, WorkbookSourceDirectory }} from '../../domain/models';

export const SOURCE_INVENTORY_METADATA = {{
  sourceWorkbook: 'data/VIP Tracker Source Directory.xlsx',
  sourceWorkbookHash: '{file_hash}',
  counts: {{
    lawoSources: {len(lawo_sources_items)},
    lawoProcessing: {len(lawo_proc_items)},
    lawoTielines: {len(lawo_tielines_items)},
    evertzSources: {len(evertz_sources_items)},
    evertzMvInputs: {len(mv_inputs_items)},
    unifiedSources: {len(seed_all_sources)},
  }},
}} as const;

export const WORKBOOK_SOURCE_INVENTORY: WorkbookSourceDirectory = {{
  lawoSources: {json.dumps(lawo_sources_items, indent=2)},
  lawoProcessing: {json.dumps(lawo_proc_items, indent=2)},
  lawoTielines: {json.dumps(lawo_tielines_items, indent=2)},
  evertzSources: {json.dumps(evertz_sources_items, indent=2)},
  evertzMvInputs: {json.dumps(mv_inputs_items, indent=2)},
}};

export const SEED_LAWO_SOURCES: Source[] = {json.dumps(seed_lawo_origin_sources, indent=2)};

export const SEED_LAWO_PROCESSING_DEVICES: Source[] = {json.dumps(seed_processing_sources, indent=2)};

export const SEED_EVERTZ_SOURCES: Source[] = {json.dumps(seed_evertz_sources, indent=2)};

export const SEED_ALL_SOURCES: Source[] = {json.dumps(seed_all_sources, indent=2)};
"""

    with open(output_ts_path, 'w', encoding='utf-8') as f:
        f.write(ts_code)

    print(f"Successfully generated {output_ts_path}")
    print(f"  Total Lawo Sources: {len(lawo_sources_items)}")
    print(f"  Total Lawo Processing: {len(lawo_proc_items)}")
    print(f"  Total Lawo Tielines: {len(lawo_tielines_items)}")
    print(f"  Total Evertz Sources: {len(evertz_sources_items)}")
    print(f"  Total Evertz MV Inputs: {len(mv_inputs_items)}")
    print(f"  Total Unified Sources: {len(seed_all_sources)}")

if __name__ == '__main__':
    main()
