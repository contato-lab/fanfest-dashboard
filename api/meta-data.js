/**
 * api/meta-data.js — Vercel Serverless Function
 * Busca dados do Meta Ads em tempo real e retorna o mesmo
 * formato do meta-data.json para compatibilidade com o dashboard.
 *
 * Env vars necessárias no Vercel:
 *   META_TOKEN  — access token da Meta Ads API
 *   META_ACCT   — (opcional) ID da conta, ex: act_2044706169171045
 */

const https = require('https');

const ACCT   = process.env.META_ACCT || 'act_2044706169171045';
const FIELDS = 'date_start,spend,impressions,reach,clicks,actions,action_values,cost_per_action_type';
const SINCE  = '2026-02-01';

function getActionCount(actions, type) {
  if (!actions) return 0;
  const a = actions.find(a => a.action_type === type);
  return a ? Math.round(parseFloat(a.value || 0)) : 0;
}

function getActionAmount(actionValues, type) {
  if (!actionValues) return 0.0;
  const a = actionValues.find(a => a.action_type === type);
  return a ? Math.round(parseFloat(a.value || 0) * 100) / 100 : 0.0;
}

function getCpp(cpa, type) {
  if (!cpa) return null;
  const a = cpa.find(a => a.action_type === type);
  return a ? Math.round(parseFloat(a.value || 0) * 100) / 100 : null;
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error('JSON parse error: ' + raw.slice(0, 200))); }
      });
    }).on('error', reject);
  });
}

function nowBRT() {
  return new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const TOKEN = process.env.META_TOKEN;
  if (!TOKEN) {
    return res.status(500).json({ error: 'META_TOKEN nao configurado no Vercel.' });
  }

  try {
    const today = new Date().toISOString().split('T')[0];

    const qs = new URLSearchParams({
      fields:         FIELDS,
      time_increment: '1',
      time_range:     JSON.stringify({ since: SINCE, until: today }),
      level:          'account',
      limit:          '90',
      access_token:   TOKEN,
    });

    let url = 'https://graph.facebook.com/v20.0/' + ACCT + '/insights?' + qs;
    const allData = [];

    while (url) {
      const result = await fetchJSON(url);
      if (result.error) throw new Error('Meta API: ' + result.error.message);
      allData.push(...(result.data || []));
      url = (result.paging && result.paging.next) ? result.paging.next : null;
    }

    const parsed = allData.map(function(day) {
      const parts = day.date_start.split('-');
      const m = parts[1], d = parts[2];
      return {
        data:       d + '/' + m,
        compras:    getActionCount(day.actions,        'purchase'),
        gasto:      Math.round(parseFloat(day.spend || 0) * 100) / 100,
        cpp:        getCpp(day.cost_per_action_type,   'purchase'),
        valorConv:  getActionAmount(day.action_values, 'purchase'),
        impressoes: parseInt(day.impressions || 0),
        alcance:    parseInt(day.reach || 0),
        cliques:    parseInt(day.clicks || 0),
        atc:        getActionCount(day.actions,        'add_to_cart'),
      };
    });

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');

    return res.status(200).json({
      updated: nowBRT(),
      data:    parsed,
    });

  } catch (err) {
    console.error('[meta-data]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
