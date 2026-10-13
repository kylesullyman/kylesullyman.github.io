import type { CSSProperties } from 'react';

const links = [
  { href: '/', label: 'Home' },
  { href: '/projects', label: 'Projects' },
  { href: '/about', label: 'About' },
];

export default function Nav() {
  return (
    <nav className="dots-nav">
      <button className="dots-toggle" type="button" aria-label="Open navigation">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
      </button>
      <ul className="dots-links">
        {links.map((link, i) => (
          <li key={link.href} style={{ '--i': i } as CSSProperties}>
            <a href={link.href}>{link.label}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
