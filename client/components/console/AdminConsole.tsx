import { Outlet, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../lib/queryClient";
import { useAuth } from "../../hooks/use-auth";
import ConsoleLayout, { type ConsoleNavGroup } from "./ConsoleLayout";
import {
  IconDashboard, IconChart, IconFolder, IconInbox, IconTag,
  IconWallet, IconReceipt, IconUsers, IconScale, IconShield,
} from "./icons";

export default function AdminConsole() {
  const { isOwner } = useAuth();
  const { data: stats } = useQuery<any>({ queryKey: ["adminStats"], queryFn: () => apiRequest("/api/admin/stats") });

  const nav: ConsoleNavGroup[] = [
    {
      items: [
        { to: "/admin", label: "대시보드", end: true, icon: <IconDashboard /> },
        { to: "/owner", label: "경영 현황", icon: <IconChart />, hidden: !isOwner },
      ],
    },
    {
      heading: "사건",
      items: [
        { to: "/admin/cases", label: "전체 사건 관리", icon: <IconFolder /> },
        { to: "/admin/requests", label: "사건 요청", icon: <IconInbox />, badge: stats?.newRequests },
      ],
    },
    {
      heading: "정산",
      items: [
        { to: "/admin/pricing", label: "요금·정책", icon: <IconTag /> },
        { to: "/admin/payments", label: "결제 관리", icon: <IconWallet /> },
        { to: "/admin/accounting", label: "회계", icon: <IconReceipt /> },
      ],
    },
    {
      heading: "회원",
      items: [
        { to: "/admin/members", label: "회원 관리", icon: <IconUsers /> },
        { to: "/admin/lawyers", label: "변호사 회원", icon: <IconScale /> },
      ],
    },
    {
      heading: "시스템",
      items: [{ to: "/admin/audit-logs", label: "감사 로그", icon: <IconShield /> }],
    },
  ];

  return (
    <ConsoleLayout
      title="관리자 콘솔"
      badge={isOwner ? "오너" : "관리자"}
      subtitle="법무법인 윈스"
      nav={nav}
      maxWidth="max-w-none"
      action={
        <Link to="/admin/cases/new" className="btn-primary w-full text-sm">
          새 사건 등록
        </Link>
      }
    >
      <Outlet />
    </ConsoleLayout>
  );
}
