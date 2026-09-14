import {
  ArrowLeftRight,
  BriefcaseBusiness,
  ChartCandlestick,
  CircleQuestionMark,
  LayoutDashboard,
  Medal,
  Settings,
  Star,
  Trophy,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const primaryNav: NavGroup[] = [
  {
    label: "Trading",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Markets", href: "/markets", icon: ChartCandlestick },
      { label: "Portfolio", href: "/portfolio", icon: BriefcaseBusiness },
      { label: "Trade", href: "/trade", icon: ArrowLeftRight },
      { label: "Watchlist", href: "/watchlist", icon: Star },
    ],
  },
  {
    label: "Club",
    items: [
      { label: "Leaderboard", href: "/leaderboard", icon: Medal },
      { label: "Competition", href: "/competition", icon: Trophy, badge: "Live" },
    ],
  },
];

export const secondaryNav: NavItem[] = [
  { label: "Help", href: "/help", icon: CircleQuestionMark },
  { label: "Settings", href: "/settings", icon: Settings },
];

export const allNavItems: NavItem[] = [...primaryNav.flatMap((group) => group.items), ...secondaryNav];

export function isNavItemActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function findNavItem(pathname: string) {
  return allNavItems.find((item) => isNavItemActive(pathname, item.href));
}
