"""
update-meta-ads.py
Chama a API do Meta Ads e salva meta-data.json
Roda diariamente via GitHub Actions (09:00 BRT)
"""
import json, os, urllib.request, urllib.parse
from datetime import datetime, date

TOKEN    = os.environ['META_TOKEN']
ACCT     = os.environ.get('META_ACCT', 'act_2044706169171045')
OUT_FILE = 'meta-data.json'
FIELDS   = 'date_start,spend,impressions,reach,clicks,actions,action_values,cost_per_action_type'

def get_action_count(actions, action_type):
    if not actions: return 0
    for a in actions:
        if a.get('action_type') == action_type:
            return int(float(a.get('value', 0)))
    return 0

def get_action_amount(action_values, action_type):
    if not action_values: return 0.0
    for a in action_values:
        if a.get('action_type') == action_type:
            return round(float(a.get('value', 0)), 2)
    return 0.0

def get_cpp(cpa, action_type):
    if not cpa: return None
    for a in cpa:
        if a.get('action_type') == action_type:
            return round(float(a.get('value', 0)), 2)
    return None

since = '2026-02-01'
until = date.today().strftime('%Y-%m-%d')

params = urllib.parse.urlencode({
    'fields':         FIELDS,
    'time_increment': '1',
    'time_range':     json.dumps({'since': since, 'until': until}),
    'level':          'account',
    'limit':          '90',
    'access_token':   TOKEN,
})

url = f'https://graph.facebook.com/v20.0/{ACCT}/insights?{params}'
all_data = []

while url:
    with urllib.request.urlopen(url) as resp:
        result = json.loads(resp.read())
    all_data.extend(result.get('data', []))
    url = result.get('paging', {}).get('next')

parsed = []
for day in all_data:
    p = day['date_start'].split('-')   # YYYY-MM-DD → DD/MM
    parsed.append({
        'data':       f"{p[2]}/{p[1]}",
        'compras':    get_action_count(day.get('actions'),              'purchase'),
        'gasto':      round(float(day.get('spend', 0)), 2),
        'cpp':        get_cpp(day.get('cost_per_action_type'),          'purchase'),
        'valorConv':  get_action_amount(day.get('action_values'),       'purchase'),
        'impressoes': int(day.get('impressions', 0)),
        'alcance':    int(day.get('reach', 0)),
        'cliques':    int(day.get('clicks', 0)),
        'atc':        get_action_count(day.get('actions'),              'add_to_cart'),
    })

output = {
    'updated': datetime.now().strftime('%d/%m/%Y %H:%M'),
    'data':    parsed,
}

with open(OUT_FILE, 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print(f"✓ {len(parsed)} dias salvos | Último: {parsed[-1]['data'] if parsed else 'N/A'}")
