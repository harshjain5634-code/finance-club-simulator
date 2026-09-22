import {
  ArrowLeftRight,
  BookOpen,
  BriefcaseBusiness,
  ChartCandlestick,
  ClipboardList,
  Download,
  Gauge,
  LayoutDashboard,
  Medal,
  MonitorPlay,
  Newspaper,
  ChartPie,
  ReceiptText,
  Settings2,
  Timer,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { label: string; href: string; icon: LucideIcon; exact?: boolean; badgeKey?: string };
export type NavGroup = { label?: string; items: NavItem[] };

export function participantNav(code: string): NavGroup[] {
  const base = `/event/${code}`;
  return [
    {
      items: [
        { label: "Dashboard", href: `${base}/dashboard`, icon: LayoutDashboard },
        { label: "Markets", href: `${base}/markets`, icon: ChartCandlestick },
        { label: "Portfolio", href: `${base}/portfolio`, icon: BriefcaseBusiness },
        { label: "Trade", href: `${base}/trade`, icon: ArrowLeftRight, badgeKey: "incoming" },
        { label: "News", href: `${base}/news`, icon: Newspaper, badgeKey: "news" },
        { label: "Leaderboard", href: `${base}/leaderboard`, icon: Medal },
      ],
    },
    {
      label: "More",
      items: [
        { label: "Transactions", href: `${base}/transactions`, icon: ReceiptText },
        { label: "Rules & help", href: `${base}/rules`, icon: BookOpen },
      ],
    },
  ];
}

export function participantTitle(pathname: string, code: string): string {
  const base = `/event/${code}`;
  if (pathname.startsWith(`${base}/markets/`)) return "Stock detail";
  const item = participantNav(code)
    .flatMap((group) => group.items)
    .find((i) => pathname.startsWith(i.href));
  return item?.label ?? "Dashboard";
}

/**
 * C4 host rail groups (section 13): LIVE is what a host touches every minute, OPS is reference during the event,
 * SETUP is before and after it. Event setup covers every /setup/* page (they share a tab strip).
 */
export function hostRailNav(eventId: string): NavGroup[] {
  const base = `/host/events/${eventId}`;
  return [
    {
      label: "Live",
      items: [
        { label: "Control room", href: base, icon: Gauge, exact: true },
        { label: "News desk", href: `${base}/news`, icon: Newspaper },
        { label: "Trades", href: `${base}/trades`, icon: ArrowLeftRight, badgeKey: "approvals" },
        { label: "Projector", href: `${base}/display`, icon: MonitorPlay },
      ],
    },
    {
      label: "Ops",
      items: [
        { label: "Teams", href: `${base}/teams`, icon: Users },
        { label: "Market", href: `${base}/prices`, icon: TrendingUp },
        { label: "Leaderboard", href: `${base}/leaderboard`, icon: Medal },
        { label: "Audit log", href: `${base}/audit`, icon: ClipboardList },
      ],
    },
    {
      label: "Setup",
      items: [
        { label: "Event setup", href: `${base}/setup`, icon: Settings2 },
        { label: "Exports", href: `${base}/exports`, icon: Download },
      ],
    },
  ];
}

export function hostSetupTabs(eventId: string): NavItem[] {
  const base = `/host/events/${eventId}/setup`;
  return [
    { label: "General", href: `${base}/general`, icon: Settings2 },
    { label: "Stocks", href: `${base}/instruments`, icon: ChartCandlestick },
    { label: "Allocations", href: `${base}/allocations`, icon: ChartPie },
    { label: "Rounds", href: `${base}/rounds`, icon: Timer },
  ];
}

export function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
