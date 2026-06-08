'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Tab = {
  id: string
  label: string
  href: string
  icon: React.ReactNode
}

const TABS: Tab[] = [
  {
    id: 'today',
    label: 'TODAY',
    href: '/today',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="5" width="16" height="14" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 3V7M15 3V7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 9H19" stroke="currentColor" strokeWidth="1.5" />
        <rect x="7" y="13" width="2" height="2" fill="currentColor" />
        <rect x="13" y="13" width="2" height="2" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'trends',
    label: 'TRENDS',
    href: '/trends',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 17L8 10L12 14L17 7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M14 7H17V10" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    id: 'log',
    label: 'LOG',
    href: '/log',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M11 5V17M5 11H17" stroke="currentColor" strokeWidth="2" />
      </svg>
    ),
  },
  {
    id: 'body',
    label: 'BODY',
    href: '/body',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="11" cy="5" r="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M11 8V15" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 10H15" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 15L7 19M14 15L15 19" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    id: 'more',
    label: 'MORE',
    href: '/profile',
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="11" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5 19C5 16 7.686 14 11 14C14.314 14 17 16 17 19" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
]

export default function TabBar() {
  const pathname = usePathname()

  function isActive(tab: Tab) {
    if (tab.href === '/today') return pathname === '/today'
    return pathname.startsWith(tab.href)
  }

  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'var(--color-bg)',
        borderTop: '1px solid var(--color-border)',
        zIndex: 100,
      }}
    >
      <div style={{
        maxWidth: '390px',
        margin: '0 auto',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-around',
        paddingTop: '10px',
        // 8px minimum keeps a tiny gap on non-iPhone; env() handles iPhone home bar (~34px)
        paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
      }}>
        {TABS.map(tab => {
          const active = isActive(tab)
          const isLog = tab.id === 'log'

          if (isLog) {
            return (
              <Link
                key={tab.id}
                href={tab.href}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  textDecoration: 'none',
                  paddingBottom: '6px',
                }}
              >
                <div style={{
                  width: '52px',
                  height: '52px',
                  backgroundColor: 'var(--color-accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#FFFFFF',
                }}>
                  {tab.icon}
                </div>
                <span style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontWeight: 700,
                  fontSize: '8px',
                  letterSpacing: '1.5px',
                  textTransform: 'uppercase',
                  color: 'var(--color-accent)',
                }}>
                  {tab.label}
                </span>
              </Link>
            )
          }

          return (
            <Link
              key={tab.id}
              href={tab.href}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
                textDecoration: 'none',
                color: active ? 'var(--color-accent)' : 'var(--color-text-dim)',
                paddingBottom: '6px',
                minWidth: '44px',
              }}
            >
              <div style={{ height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {tab.icon}
              </div>
              <span style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                fontSize: '8px',
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
              }}>
                {tab.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
