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

    # Build SourceInventoryItem entries for WorkbookSourceDirectory
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

    # Build typed Source entries for application domain models
    def make_source_item(name: str, item_type: str, category_group: str, is_dest: bool = False):
        cat = classify_source_category(name)
        item_id = create_dest_id(name) if is_dest else create_source_id(name)

        if category_group == 'lawo-processing':
            source_type = 'processing'
            route_role = 'processing'
            router = 'Lawo'
            device_type = item_type
        elif category_group == 'lawo-destination/tieline':
            source_type = 'virtual'
            route_role = 'tieline'
            router = 'Both'
            device_type = None
        elif category_group == 'evertz-mv-input':
            source_type = 'originating'
            route_role = None
            router = 'Evertz'
            device_type = None
        elif category_group == 'evertz-source':
            is_tieline = name in tieline_lookup
            source_type = 'virtual' if is_tieline else 'originating'
            route_role = 'tieline' if is_tieline else 'evertz_source'
            router = 'Both' if is_tieline else 'Evertz'
            device_type = None
        elif category_group == 'lawo-source':
            is_proc = name in proc_lookup
            source_type = 'processing' if is_proc else 'originating'
            route_role = 'processing' if is_proc else 'lawo_source'
            router = 'Lawo'
            device_type = item_type
        else:
            source_type = 'originating'
            route_role = None
            router = None
            device_type = None

        vendor = infer_vendor(name, item_type)

        return {
            'id': item_id,
            'name': name,
            'normalizedName': name.strip().upper(),
            'category': cat,
            'active': True,
            'upstreamSourceId': None,
            'sourceType': source_type,
            'deviceType': device_type,
            'vendor': vendor,
            'router': router,
            'routeRole': route_role,
            'inventoryCategory': category_group,
            'metadata': {'rawType': item_type},
        }

    # Pre-lookup tables for classification
    proc_lookup = {n: t for n, t in lawo_proc_raw}
    tieline_lookup = {n: t for n, t in lawo_tielines_raw}

    # 1. Authoritative SourceInventoryItem entries for WorkbookSourceDirectory
    lawo_sources_items = [make_inventory_item(n, t, 'lawo-source') for n, t in lawo_sources_raw]
    lawo_proc_items = [make_inventory_item(n, t, 'lawo-processing') for n, t in lawo_proc_raw]
    lawo_tielines_items = [make_inventory_item(n, t, 'lawo-destination/tieline') for n, t in lawo_tielines_raw]
    evertz_sources_items = [make_inventory_item(n, t, 'evertz-source') for n, t in evertz_sources_raw]
    mv_inputs_items = [make_inventory_item(n, t, 'evertz-mv-input', is_dest=True) for n, t in mv_inputs_raw]

    # 2. Five independent authoritative Excel inventories as Source[]
    seed_lawo_sources = [make_source_item(n, t, 'lawo-source') for n, t in lawo_sources_raw]
    seed_processing_sources = [make_source_item(n, t, 'lawo-processing') for n, t in lawo_proc_raw]
    seed_tieline_sources = [make_source_item(n, t, 'lawo-destination/tieline') for n, t in lawo_tielines_raw]
    seed_evertz_sources = [make_source_item(n, t, 'evertz-source') for n, t in evertz_sources_raw]
    seed_mv_inputs_sources = [make_source_item(n, t, 'evertz-mv-input', is_dest=True) for n, t in mv_inputs_raw]

    # Authoritative combined list across all 5 discrete inventories (445 + 138 + 117 + 267 + 264 = 1231)
    authoritative_inventory_sources = (
        seed_lawo_sources +
        seed_processing_sources +
        seed_tieline_sources +
        seed_evertz_sources +
        seed_mv_inputs_sources
    )

    # Derived internal routing catalog (712 sources):
    # 1. Originating Lawo sources: Lawo Sources minus processing devices minus names that are also
    #    Evertz Sources (those stay in the routing catalog via their existing Evertz/tieline entries,
    #    so IDs and route roles are never duplicated or re-keyed).
    evertz_lookup = {n for n, _ in evertz_sources_raw}
    seed_lawo_origin_sources = [
        {
            **item,
            'inventoryCategories': ['lawo-source'],
        }
        for item in seed_lawo_sources
        if item['name'] not in proc_lookup and item['name'] not in evertz_lookup
    ]

    # 2. Processing devices with routing category tags (138)
    seed_processing_routing_sources = [
        {
            **item,
            'inventoryCategories': ['lawo-source', 'lawo-processing'],
        }
        for item in seed_processing_sources
    ]

    # 3. Tieline sources with routing category tags (117)
    seed_tieline_routing_sources = [
        {
            **item,
            'inventoryCategories': ['lawo-destination/tieline', 'evertz-source'],
        }
        for item in seed_tieline_sources
    ]

    # 4. Direct Evertz sources (267 - 117 = 150)
    seed_direct_evertz_sources = [
        {
            **item,
            'inventoryCategories': ['evertz-source'],
        }
        for item in seed_evertz_sources if item['name'] not in tieline_lookup
    ]

    # Unified internal routing catalog = 307 + 138 + 117 + 150 = 712
    seed_combined_routing_sources = (
        seed_lawo_origin_sources +
        seed_processing_routing_sources +
        seed_tieline_routing_sources +
        seed_direct_evertz_sources
    )

    # Picker type lookups: the sheet's own Type values (trimmed, original casing), keyed by canonical
    # source ID per list role. Separate from Source.category. Blank -> None (picker shows "Uncategorized").
    # The 'tieline' role uses the Evertz Source Type column because the Tieline Type column covers only
    # the 117 tielines, while that picker lists all 267 Evertz sources (approved exception).
    def build_picker_types(raw_list):
        lookup = {}
        order = []
        for n, t in raw_list:
            ty = (t or '').strip() or None
            lookup[create_source_id(n)] = ty
            if ty is not None and ty not in order:
                order.append(ty)
        return lookup, order

    picker_types = {
        'lawoSource': build_picker_types(lawo_sources_raw),
        'lawoProcessing': build_picker_types(lawo_proc_raw),
        'tieline': build_picker_types(evertz_sources_raw),
    }
    picker_type_lookup = {k: v[0] for k, v in picker_types.items()}
    picker_type_order = {k: v[1] for k, v in picker_types.items()}

    # Report cross-list type conflicts (same source name, different Type across lists)
    names_types = {}
    for label, raw in [('Lawo Sources', lawo_sources_raw), ('Lawo Processing', lawo_proc_raw),
                       ('Tieline', lawo_tielines_raw), ('Evertz Sources', evertz_sources_raw)]:
        for n, t in raw:
            names_types.setdefault(n, {})[label] = (t or '').strip()
    conflicts = {n: v for n, v in names_types.items() if len(set(v.values())) > 1}
    print(f"  Cross-list picker type conflicts: {len(conflicts)}")
    for n, v in list(conflicts.items())[:50]:
        print(f"    {n}: {v}")

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

import {{ Source, SourceInventoryItem, WorkbookSourceDirectory }} from '../../domain/models';

export const SOURCE_INVENTORY_METADATA = {{
  sourceWorkbook: 'data/VIP Tracker Source Directory.xlsx',
  sourceWorkbookHash: '{file_hash}',
  counts: {{
    lawoSources: {len(seed_lawo_sources)},
    lawoProcessing: {len(seed_processing_sources)},
    lawoTielines: {len(seed_tieline_sources)},
    evertzSources: {len(seed_evertz_sources)},
    evertzMvInputs: {len(seed_mv_inputs_sources)},
    authoritativeTotal: {len(authoritative_inventory_sources)},
    unifiedSources: {len(seed_combined_routing_sources)},
  }},
}} as const;

export const WORKBOOK_SOURCE_INVENTORY: WorkbookSourceDirectory = {{
  lawoSources: {json.dumps(lawo_sources_items, indent=2)},
  lawoProcessing: {json.dumps(lawo_proc_items, indent=2)},
  lawoTielines: {json.dumps(lawo_tielines_items, indent=2)},
  evertzSources: {json.dumps(evertz_sources_items, indent=2)},
  evertzMvInputs: {json.dumps(mv_inputs_items, indent=2)},
}};

export const SEED_LAWO_SOURCES: Source[] = {json.dumps(seed_lawo_sources, indent=2)};

export const SEED_LAWO_PROCESSING_DEVICES: Source[] = {json.dumps(seed_processing_sources, indent=2)};

export const SEED_LAWO_TIELINES: Source[] = {json.dumps(seed_tieline_sources, indent=2)};

export const SEED_EVERTZ_SOURCES: Source[] = {json.dumps(seed_evertz_sources, indent=2)};

export const SEED_EVERTZ_MV_INPUTS: SourceInventoryItem[] = {json.dumps(seed_mv_inputs_sources, indent=2)};

export const AUTHORITATIVE_INVENTORY_SOURCES: SourceInventoryItem[] = [
  ...WORKBOOK_SOURCE_INVENTORY.lawoSources,
  ...WORKBOOK_SOURCE_INVENTORY.lawoProcessing,
  ...WORKBOOK_SOURCE_INVENTORY.lawoTielines,
  ...WORKBOOK_SOURCE_INVENTORY.evertzSources,
  ...WORKBOOK_SOURCE_INVENTORY.evertzMvInputs,
];

export const SEED_LAWO_ORIGIN_SOURCES: Source[] = {json.dumps(seed_lawo_origin_sources, indent=2)};

export const SEED_DIRECT_EVERTZ_SOURCES: Source[] = {json.dumps(seed_direct_evertz_sources, indent=2)};

export const SEED_COMBINED_ROUTING_CATALOG: Source[] = {json.dumps(seed_combined_routing_sources, indent=2)};

export const SEED_ALL_SOURCES: Source[] = SEED_COMBINED_ROUTING_CATALOG;

export type SourcePickerRole = 'lawoSource' | 'lawoProcessing' | 'tieline';

/** Sheet Type value per canonical source ID and picker role (null = blank in sheet). */
export const SOURCE_PICKER_TYPES: Record<SourcePickerRole, Record<string, string | null>> = {json.dumps(picker_type_lookup, indent=2)};

/** Sheet Type values per picker role in order of first appearance in the sheet. */
export const SOURCE_PICKER_TYPE_ORDER: Record<SourcePickerRole, readonly string[]> = {json.dumps(picker_type_order, indent=2)};
"""

    with open(output_ts_path, 'w', encoding='utf-8') as f:
        f.write(ts_code)

    print(f"Successfully generated {output_ts_path}")

    # Format generated TypeScript file with Prettier to guarantee repository style conformance
    import subprocess
    prettier_cmd = ['npx.cmd' if os.name == 'nt' else 'npx', 'prettier', '--write', output_ts_path]
    print(f"Formatting {output_ts_path} with Prettier...")
    subprocess.run(prettier_cmd, check=True)

    print(f"  Total Lawo Sources: {len(seed_lawo_sources)}")
    print(f"  Total Lawo Processing: {len(seed_processing_sources)}")
    print(f"  Total Lawo Tielines: {len(seed_tieline_sources)}")
    print(f"  Total Evertz Sources: {len(seed_evertz_sources)}")
    print(f"  Total Evertz MV Inputs: {len(seed_mv_inputs_sources)}")
    print(f"  Total Authoritative Inventory Sources: {len(authoritative_inventory_sources)}")
    print(f"  Total Derived Combined Routing Catalog: {len(seed_combined_routing_sources)}")

if __name__ == '__main__':
    main()
