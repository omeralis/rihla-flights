import type { Metadata, Viewport } from 'next';
import { Header, Footer } from '@/components/shell';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'وصال — ابحث عن رحلتك القادمة', template: '%s — وصال' },
  description: 'وصال: ابحث عن رحلات تاركو وبدر وسودانير، واختر الأسعار بالجنيه السوداني أو الريال السعودي أو الدولار.',
};
export const viewport: Viewport = { themeColor: '#102b43' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ar" dir="rtl"><body><Header />{children}<Footer /></body></html>;
}
