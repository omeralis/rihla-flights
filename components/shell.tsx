import Link from 'next/link';
import { Icon } from './icon';

function Brand() {
  return <Link className="brand" href="/" aria-label="وصال — الرئيسية"><span className="brand-icon" aria-hidden="true"><Icon width="29" height="29" /></span><span>وصال<small>WISAL</small></span></Link>;
}

export function Header() {
  return <><a className="skip-link" href="#main">انتقل إلى المحتوى</a><header className="header"><Brand /><nav aria-label="التنقل الرئيسي"><Link className="active" href="/">البحث عن رحلة</Link><Link href="/#airlines">شركات الطيران</Link></nav><span className="language"><span aria-hidden="true">◎</span> العربية</span></header></>;
}

export function Footer() {
  return <footer className="footer"><div className="footer-brand"><Brand /><p>رحلة طيّبة، أينما كانت وجهتك.</p></div><div className="footer-meta"><span>© {new Date().getUTCFullYear()} وصال</span><a className="creator-link" href="https://omerali.dev" target="_blank" rel="noopener noreferrer" dir="ltr">@omerali.dev <Icon name="arrow" /></a></div></footer>;
}
