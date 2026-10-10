import type { ReactNode, SVGProps } from 'react';

type Name = 'home' | 'pin' | 'asset' | 'arrow' | 'search' | 'state' | 'centre' | 'warehouse' | 'building' | 'floor' | 'area' | 'plus' | 'check' | 'watch' | 'history' | 'people' | 'bell';

const paths: Record<Name, ReactNode> = {
  home: <><path d="m3.5 10 8.5-7 8.5 7"/><path d="M5.5 9v11h13V9M9.5 20v-6h5v6"/></>,
  pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.3"/></>,
  asset: <><path d="m12 2.8 8.5 4.6v9.2L12 21.2l-8.5-4.6V7.4L12 2.8Z"/><path d="m3.8 7.5 8.2 4.6 8.2-4.6M12 12.1v9"/></>,
  arrow: <><path d="M4.5 12h14"/><path d="m12.5 5 7 7-7 7"/></>,
  search: <><circle cx="10.8" cy="10.8" r="6.6"/><path d="m16 16 4.5 4.5"/></>,
  state: <><path d="M12 2.5 20 7v10l-8 4.5L4 17V7l8-4.5Z"/><path d="M8 9.5h8M8 13h8M8 16.5h4"/></>,
  centre: <><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9M9 20v-6h6v6"/></>,
  warehouse: <><path d="m3 9 9-6 9 6v11H3V9Z"/><path d="M7 20v-7h10v7M7 9h.01M12 9h.01M17 9h.01"/></>,
  building: <><path d="M5 21V4h14v17M3 21h18"/><path d="M9 8h2M14 8h2M9 12h2M14 12h2M10 21v-4h4v4"/></>,
  floor: <><path d="M4 20h16M6 20V5h12v15"/><path d="M8.5 9h2M13.5 9h2M8.5 13h2M13.5 13h2"/></>,
  area: <><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><path d="M8 12h8M12 8v8"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  check: <><path d="m5 12 4.4 4.4L19 7"/></>,
  watch: <><path d="M12 3v2M12 19v2M5.6 5.6 7 7M17 17l1.4 1.4M3 12h2M19 12h2M5.6 18.4 7 17M17 7l1.4-1.4"/><circle cx="12" cy="12" r="7"/><path d="M12 8v4l2.7 1.7"/></>,
  history: <><path d="M3.5 11a8.5 8.5 0 1 1 2.2 6.4"/><path d="M3.5 5v6h6M12 7v5l3.2 2"/></>,
  people: <><circle cx="9" cy="8" r="3.2"/><path d="M3 20v-1.4a5.9 5.9 0 0 1 11.8 0V20M16 5.2a3.1 3.1 0 0 1 0 5.8M17 14.2a5.3 5.3 0 0 1 4 5.1V20"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
};

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: Name }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
