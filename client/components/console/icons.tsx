// 콘솔 사이드바용 라인 아이콘(1.75 stroke, 18px). 장식용이라 aria-hidden 은 부모에서 처리.
const s = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const IconDashboard = () => (
  <svg {...s}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>
);
export const IconUser = () => (
  <svg {...s}><circle cx="12" cy="8" r="4" /><path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" /></svg>
);
export const IconUsers = () => (
  <svg {...s}><circle cx="9" cy="8" r="3.2" /><path d="M3 19c0-2.8 2.7-5 6-5s6 2.2 6 5" /><path d="M16 6.2a3 3 0 0 1 0 5.6" /><path d="M17 14.2c2 .6 3.5 2.3 3.5 4.3" /></svg>
);
export const IconFolder = () => (
  <svg {...s}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" /></svg>
);
export const IconInbox = () => (
  <svg {...s}><path d="M4 13l2.5-7A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.3L20 13" /><path d="M4 13v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4h-5a3 3 0 0 1-6 0H4z" /></svg>
);
export const IconCard = () => (
  <svg {...s}><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3 10h18" /></svg>
);
export const IconWallet = () => (
  <svg {...s}><path d="M4 7a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2" /><path d="M3 8h16a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z" /><circle cx="16.5" cy="13.5" r="1.2" /></svg>
);
export const IconReceipt = () => (
  <svg {...s}><path d="M6 3h12v18l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5V3z" /><path d="M9 8h6M9 12h6" /></svg>
);
export const IconBell = () => (
  <svg {...s}><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
);
export const IconDoc = () => (
  <svg {...s}><path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>
);
export const IconTag = () => (
  <svg {...s}><path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9z" /><circle cx="8" cy="8" r="1.3" /></svg>
);
export const IconChart = () => (
  <svg {...s}><path d="M4 20V4" /><path d="M4 20h16" /><rect x="7" y="12" width="3" height="5" rx="0.5" /><rect x="12" y="8" width="3" height="9" rx="0.5" /><rect x="17" y="5" width="3" height="12" rx="0.5" /></svg>
);
export const IconScale = () => (
  <svg {...s}><path d="M12 3v18M7 21h10" /><path d="M12 5l6 2-3 6a3 3 0 0 1-6 0L6 7l6-2z" opacity="0" /><path d="M6 7l-3 6a3 3 0 0 0 6 0L6 7zM18 7l-3 6a3 3 0 0 0 6 0l-3-6zM4 7h16" /></svg>
);
export const IconShield = () => (
  <svg {...s}><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" /><path d="M9 12l2 2 4-4" /></svg>
);
