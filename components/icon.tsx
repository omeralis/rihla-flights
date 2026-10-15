import type { SVGProps } from 'react';

const paths = {
  plane: 'm21 3-8 18-3-8-7-3 18-7Zm0 0L10 13',
  arrow: 'M6 18 18 6M6 6h12v12',
  back: 'M5 12h14m-5-5 5 5-5 5',
  swap: 'M4 8h16m-4-4 4 4-4 4M20 16H4m4-4-4 4 4 4',
  refresh: 'M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 3M5 15a8 8 0 0 0 13 3',
  calendar: 'M4 11h16M16 3v4M8 3v4M7 5h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Zm3 10h4',
  person: 'M5 21v-2a7 7 0 0 1 14 0v2M15 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
} as const;

export function Icon({ name = 'plane', ...props }: SVGProps<SVGSVGElement> & { name?: keyof typeof paths }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name]} /></svg>;
}
