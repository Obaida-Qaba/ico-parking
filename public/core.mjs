export function normalizeCode(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function parseDestination(input) {
  let raw = String(input ?? '').trim().replace(/^(?:parking|park|parkeerplaats)\s+/i, '');
  let line = null;
  const explicit = raw.match(/\s*(?:\b(?:line|lijn|rij)\b|[/,;])\s*(.*)$/i);
  if (explicit) {
    if (!/^[1-9]\d{0,3}$/.test(explicit[1].trim())) {
      return { parking: normalizeCode(raw.slice(0, explicit.index)), line: null, error: 'Enter a whole line number greater than zero, for example H61 line 15.' };
    }
    line = String(Number(explicit[1].trim()));
    raw = raw.slice(0, explicit.index);
  }
  return { parking: normalizeCode(raw), line, error: null };
}

export function searchParkings(maps, input, mapId = 'all') {
  const parsed = parseDestination(input);
  if (parsed.error || !parsed.parking) return [];
  const found = [];
  for (const map of maps) {
    if (mapId !== 'all' && map.id !== mapId) continue;
    for (const parking of map.parkings) {
      const code = normalizeCode(parking.code);
      if (!code.startsWith(parsed.parking)) continue;
      found.push({ map, parking, line: parsed.line,
        rank: (code === parsed.parking ? 0 : 10) + (map.historical ? 1 : 0) });
    }
  }
  return found.sort((a,b)=>a.rank-b.rank || a.parking.code.localeCompare(b.parking.code,undefined,{numeric:true}) || a.map.name.localeCompare(b.map.name));
}

export function routeStatus(parking, line) {
  return {
    available: false,
    title: parking ? 'Internal road guidance is not available yet' : 'Choose a parking first',
    message: line
      ? `The plan locates ${parking?.code ?? 'the parking'}, but does not locate line ${line}. Verified line positions and internal road routes are needed before navigation can guide you there.`
      : 'This plan shows parking locations. Its internal roads, allowed turns and GPS alignment have not been verified for navigation.'
  };
}
