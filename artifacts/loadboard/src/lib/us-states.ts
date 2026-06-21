export type UsStateOption = {
  abbr: string;
  name: string;
};

export const US_STATE_OPTIONS: UsStateOption[] = [
  { abbr: "AL", name: "Alabama" },
  { abbr: "AK", name: "Alaska" },
  { abbr: "AZ", name: "Arizona" },
  { abbr: "AR", name: "Arkansas" },
  { abbr: "CA", name: "California" },
  { abbr: "CO", name: "Colorado" },
  { abbr: "CT", name: "Connecticut" },
  { abbr: "DE", name: "Delaware" },
  { abbr: "FL", name: "Florida" },
  { abbr: "GA", name: "Georgia" },
  { abbr: "HI", name: "Hawaii" },
  { abbr: "ID", name: "Idaho" },
  { abbr: "IL", name: "Illinois" },
  { abbr: "IN", name: "Indiana" },
  { abbr: "IA", name: "Iowa" },
  { abbr: "KS", name: "Kansas" },
  { abbr: "KY", name: "Kentucky" },
  { abbr: "LA", name: "Louisiana" },
  { abbr: "ME", name: "Maine" },
  { abbr: "MD", name: "Maryland" },
  { abbr: "MA", name: "Massachusetts" },
  { abbr: "MI", name: "Michigan" },
  { abbr: "MN", name: "Minnesota" },
  { abbr: "MS", name: "Mississippi" },
  { abbr: "MO", name: "Missouri" },
  { abbr: "MT", name: "Montana" },
  { abbr: "NE", name: "Nebraska" },
  { abbr: "NV", name: "Nevada" },
  { abbr: "NH", name: "New Hampshire" },
  { abbr: "NJ", name: "New Jersey" },
  { abbr: "NM", name: "New Mexico" },
  { abbr: "NY", name: "New York" },
  { abbr: "NC", name: "North Carolina" },
  { abbr: "ND", name: "North Dakota" },
  { abbr: "OH", name: "Ohio" },
  { abbr: "OK", name: "Oklahoma" },
  { abbr: "OR", name: "Oregon" },
  { abbr: "PA", name: "Pennsylvania" },
  { abbr: "RI", name: "Rhode Island" },
  { abbr: "SC", name: "South Carolina" },
  { abbr: "SD", name: "South Dakota" },
  { abbr: "TN", name: "Tennessee" },
  { abbr: "TX", name: "Texas" },
  { abbr: "UT", name: "Utah" },
  { abbr: "VT", name: "Vermont" },
  { abbr: "VA", name: "Virginia" },
  { abbr: "WA", name: "Washington" },
  { abbr: "WV", name: "West Virginia" },
  { abbr: "WI", name: "Wisconsin" },
  { abbr: "WY", name: "Wyoming" },
  { abbr: "DC", name: "District of Columbia" },
];

export const US_STATE_ABBRS = US_STATE_OPTIONS.map((s) => s.abbr);

export function formatUsState(option: UsStateOption): string {
  return `${option.name} (${option.abbr})`;
}

export function getStateSearchQuery(raw: string): string {
  const trimmed = raw.trim();
  const commaIdx = trimmed.lastIndexOf(",");
  if (commaIdx >= 0) return trimmed.slice(commaIdx + 1).trim();
  return trimmed;
}

export function filterUsStates(query: string, limit = 8): UsStateOption[] {
  const q = getStateSearchQuery(query).toLowerCase();
  if (!q) return US_STATE_OPTIONS.slice(0, limit);

  const scored = US_STATE_OPTIONS.map((state) => {
    const label = formatUsState(state).toLowerCase();
    const abbr = state.abbr.toLowerCase();
    const name = state.name.toLowerCase();
    let score = 0;
    if (abbr === q || name === q) score = 100;
    else if (abbr.startsWith(q) || name.startsWith(q)) score = 80;
    else if (label.includes(q) || name.includes(q)) score = 60;
    else if (q.includes(abbr) || q.includes(name)) score = 40;
    return { state, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.state.name.localeCompare(b.state.name));

  return scored.slice(0, limit).map((x) => x.state);
}
