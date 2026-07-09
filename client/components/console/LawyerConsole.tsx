import { Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../lib/queryClient";
import ConsoleLayout, { type ConsoleNavGroup } from "./ConsoleLayout";
import { IconDashboard, IconInbox, IconFolder, IconDoc, IconWallet } from "./icons";

export default function LawyerConsole() {
  // 변호사도 requireAdmin 통과 → 관리자 통계 재사용(신규 사건요청 뱃지)
  const { data: stats } = useQuery<any>({ queryKey: ["adminStats"], queryFn: () => apiRequest("/api/admin/stats") });

  const nav: ConsoleNavGroup[] = [
    {
      items: [
        { to: "/desk", label: "대시보드", end: true, icon: <IconDashboard /> },
        { to: "/desk/requests", label: "신청 사건", icon: <IconInbox />, badge: stats?.newRequests },
      ],
    },
    {
      heading: "수임 업무",
      items: [
        { to: "/desk/cases", label: "수임 사건 진행", icon: <IconFolder /> },
        { to: "/desk/documents", label: "자동 문서 작성", icon: <IconDoc /> },
        { to: "/desk/payments", label: "결제 관리", icon: <IconWallet /> },
      ],
    },
  ];

  return (
    <ConsoleLayout title="변호사 콘솔" badge="변호사" subtitle="법무법인 윈스" nav={nav} maxWidth="max-w-none">
      <Outlet />
    </ConsoleLayout>
  );
}
