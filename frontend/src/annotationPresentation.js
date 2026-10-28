/** A pending candidate owns its view; saved layers cannot masquerade as new inference progress. */
export function resolveDisplayLayers(historicalSnapshot, candidate, savedSnapshot) {
  if (historicalSnapshot) return historicalSnapshot.layers ?? {};
  if (candidate) return candidate.response?.layers ?? candidate.progress?.layers ?? {};
  return savedSnapshot?.layers ?? {};
}
