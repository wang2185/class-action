import { Outlet } from "react-router-dom";
import ConsoleLayout, { type ConsoleNavGroup } from "./ConsoleLayout";
import { IconFolder, IconReceipt, IconCard, IconBell, IconUser } from "./icons";

const NAV: ConsoleNavGroup[] = [
  {
    items: [
      { to: "/my", label: "내 사건", end: true, icon: <IconFolder /> },
      { to: "/my/payments", label: "결제 내역", icon: <IconReceipt /> },
      { to: "/my/payment-methods", label: "결제수단", icon: <IconCard /> },
      { to: "/my/notifications", label: "알림", icon: <IconBell /> },
    ],
  },
  {
    heading: "계정",
    items: [{ to: "/account", label: "내 정보", icon: <IconUser /> }],
  },
];

export default function MemberConsole() {
  return (
    <ConsoleLayout title="내 메뉴" badge="회원" nav={NAV} maxWidth="max-w-3xl">
      <Outlet />
    </ConsoleLayout>
  );
}
