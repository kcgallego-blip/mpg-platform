import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/authStore'
import { LogOut, User, LayoutDashboard, Ticket, FileText, ChevronDown, ChevronRight, Users, BarChart3, TrendingUp, Wrench } from 'lucide-react'
import { useState, useEffect, useRef, type ComponentType } from 'react'
import Image from 'next/image'

type IconComponent = ComponentType<any>
type NavChild = { href: string; icon: IconComponent; label: string }
type NavItem = { href: string; icon: IconComponent; label: string } | { label: string; icon: IconComponent; children: NavChild[] }

const allNavItems: NavItem[] = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/dashboard/stats', icon: TrendingUp, label: 'Stats' },
  { href: '/dashboard/productivity', icon: BarChart3, label: 'Productivity' },
  {
    label: 'IT',
    icon: Ticket,
    children: [
      { href: '/dashboard/it/submit-ticket', icon: FileText, label: 'Submit Ticket' },
      { href: '/dashboard/it/ticket-reports', icon: Ticket, label: 'Ticket Reports' },
    ],
  },
  {
    label: 'Utilities',
    icon: Wrench,
    children: [
      { href: '/dashboard/utilities/ledger', icon: FileText, label: 'Ledger' },
      { href: '/dashboard/utilities/accounts', icon: Users, label: 'Accounts' },
      { href: '/dashboard/utilities/agents', icon: Users, label: 'Agents' },
    ],
  },
]

const managerNavItems: NavItem[] = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/dashboard/stats', icon: TrendingUp, label: 'Stats' },
  { href: '/dashboard/productivity', icon: BarChart3, label: 'Productivity' },
  {
    label: 'IT',
    icon: Ticket,
    children: [
      { href: '/dashboard/it/submit-ticket', icon: FileText, label: 'Submit Ticket' },
      { href: '/dashboard/it/ticket-reports', icon: Ticket, label: 'Ticket Reports' },
    ],
  },
]

function getNavItemsByRole(role: string | null | undefined) {
  if (!role) {
    return [{ href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' }]
  }

  switch (role) {
    case 'Admin':
      return allNavItems
    case 'IT':
    case 'Operations Manager':
    case 'Supervisor':
      return managerNavItems

    case 'Team Leader':
      return managerNavItems
    case 'Agent':
      return [
        { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { href: '/dashboard/stats', icon: TrendingUp, label: 'Stats' },
      ]
    default:
      return [{ href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' }]
  }
}

export default function Navigation() {
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const [expandedItems, setExpandedItems] = useState<string[]>(['IT', 'Utilities'])
  const [showLogout, setShowLogout] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  const navItems = getNavItemsByRole(user?.role)

  const handleLogout = async () => {
    setShowLogout(false)
    await logout()
    router.push('/login')
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowLogout(false)
      }
    }

    if (showLogout) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showLogout])

  const toggleExpand = (label: string) => {
    setExpandedItems(prev =>
      prev.includes(label)
        ? prev.filter(item => item !== label)
        : [...prev, label]
    )
  }

  return (
    <>
      <header className="sticky top-0 z-50 bg-primary-container/90 backdrop-blur-glass-md border-b border-outline/20">
        <div className="max-w-container mx-auto px-gutter py-4">
          <div className="flex items-center justify-between">
            <Link href="/dashboard" className="flex items-center gap-3">
              <Image
                src="/icon.png"
                alt="CLAD Logo"
                width={48}
                height={48}
                className="object-contain"
              />
              <span className="font-hanken text-2xl font-bold text-white">CLAD</span>
            </Link>

            <div className="flex items-center gap-4">
              <div className="relative" ref={profileRef}>
                <button
                  onClick={() => setShowLogout(prev => !prev)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-surface-container-high transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center overflow-hidden">
                    {user?.avatar_image ? (
                      <img
                        src={user.avatar_image}
                        alt="Profile"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User size={16} className="text-primary-container" />
                    )}
                  </div>
                  <span className="text-on-primary-container text-sm font-medium">{user?.email?.split('@')[0]}</span>
                </button>

                {showLogout && (
                  <div className="absolute right-0 mt-2 w-48 glass-effect rounded-lg shadow-lg transition-all duration-200 p-2">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-error hover:bg-error/10 transition-colors text-sm font-medium"
                    >
                      <LogOut size={18} />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <aside className="fixed top-20 bottom-0 left-0 w-64 bg-surface-container/30 backdrop-blur-glass-lg border-r border-outline/20 z-40 overflow-y-auto">
        <nav className="p-4 space-y-2">
          {navItems.map((item) => {
            if ('children' in item) {
              const isExpanded = expandedItems.includes(item.label)
              return (
                <div key={item.label}>
                  <button
                    onClick={() => toggleExpand(item.label)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg text-on-surface hover:bg-surface-container-high transition-colors text-sm font-medium"
                  >
                    <div className="flex items-center gap-3">
                      <item.icon size={20} />
                      <span>{item.label}</span>
                    </div>
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  {isExpanded && (
                    <div className="ml-8 mt-1 space-y-1">
                      {item.children.map((child) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          className="flex items-center gap-3 px-4 py-2 rounded-lg text-on-surface hover:bg-surface-container-high transition-colors text-sm"
                        >
                          <child.icon size={18} />
                          <span>{child.label}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-on-surface hover:bg-surface-container-high transition-colors text-sm font-medium"
              >
                <item.icon size={20} />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </aside>
    </>
  )
}
