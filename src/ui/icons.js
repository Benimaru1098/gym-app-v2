const baseAttributes =
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';

const icons = {
  home: `<svg ${baseAttributes}><path d="m3 10 9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>`,
  plan: `<svg ${baseAttributes}><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8"/><path d="M8 12h8"/><path d="M8 17h5"/></svg>`,
  journal: `<svg ${baseAttributes}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/><path d="M8 6h8"/><path d="M8 10h6"/></svg>`,
  download: `<svg ${baseAttributes}><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>`,
  install: `<svg ${baseAttributes}><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 6v8"/><path d="m8.5 10.5 3.5 3.5 3.5-3.5"/><path d="M10 18h4"/></svg>`,
  upload: `<svg ${baseAttributes}><path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 3h14"/></svg>`,
  trash: `<svg ${baseAttributes}><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m6 6 1 15h10l1-15"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`,
  chevronDown: `<svg ${baseAttributes}><path d="m6 9 6 6 6-6"/></svg>`,
  check: `<svg ${baseAttributes}><path d="m20 6-11 11-5-5"/></svg>`,
};

export function icon(name) {
  return icons[name] ?? "";
}
