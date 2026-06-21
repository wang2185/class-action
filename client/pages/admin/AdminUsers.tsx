import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "../../lib/queryClient";
import { useAuth } from "../../hooks/use-auth";

const ROLES = [{ v: "member", l: "회원" }, { v: "lawyer", l: "변호사" }, { v: "admin", l: "관리자" }];
const ROLE_CLS: Record<string, string> = { admin: "bg-accent-100 text-accent-700", lawyer: "bg-purple-100 text-purple-700", member: "bg-gray-100 text-gray-600" };
const fmt = (d?: string) => (d ? new Date(d).toLocaleDateString("ko-KR") : "-");

export default function AdminUsers() {
  const { user: me } = useAuth();
  const { data: users, isLoading } = useQuery({ queryKey: ["adminUsers"], queryFn: () => apiRequest("/api/admin/users") });
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const filtered = useMemo(() => {
    const l: any[] = Array.isArray(users) ? users : [];
    const kw = q.trim().toLowerCase();
    return kw ? l.filter((u) => [u.name, u.email, u.phone].some((v) => String(v || "").toLowerCase().includes(kw))) : l;
  }, [users, q]);

  async function changeRole(id: number, role: string) {
    setBusy(id); setMsg(null);
    try {
      await apiRequest(`/api/admin/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) });
      await queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
      setMsg({ ok: true, text: "권한이 변경되었습니다." });
    } catch (err: any) {
      setMsg({ ok: false, text: err?.message || "변경 실패" });
    } finally { setBusy(null); }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-bold">사용자 · 권한</h1>
        <Link to="/admin" className="btn-secondary">대시보드</Link>
      </div>

      <div className="card">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div>
            <h2 className="font-bold text-lg">회원 목록</h2>
            {msg && <p className={`text-sm mt-1 ${msg.ok ? "text-primary-700" : "text-red-600"}`}>{msg.text}</p>}
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·이메일·연락처 검색"
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 w-60" />
        </div>
        {isLoading ? (
          <p className="text-gray-400 py-10 text-center">불러오는 중…</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-400 py-10 text-center">사용자가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-3 font-semibold">이름</th>
                  <th className="pb-3 font-semibold">이메일</th>
                  <th className="pb-3 font-semibold">연락처</th>
                  <th className="pb-3 font-semibold">가입일</th>
                  <th className="pb-3 font-semibold text-center">권한</th>
                  <th className="pb-3 font-semibold text-center">변경</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3 font-medium">{u.name}{me?.id === u.id && <span className="text-xs text-gray-400"> (나)</span>}</td>
                    <td className="py-3 text-gray-500">{u.email}</td>
                    <td className="py-3 text-gray-500">{u.phone || "-"}</td>
                    <td className="py-3 text-gray-400">{fmt(u.createdAt)}</td>
                    <td className="py-3 text-center"><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_CLS[u.role] || "bg-gray-100 text-gray-600"}`}>{ROLES.find((r) => r.v === u.role)?.l || u.role}</span></td>
                    <td className="py-3 text-center">
                      <select disabled={busy === u.id} value={u.role} onChange={(e) => changeRole(u.id, e.target.value)}
                        className="rounded-lg border border-gray-300 px-2 py-1 text-sm disabled:opacity-50">
                        {ROLES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-3">변호사·관리자 권한은 사건·당사자·결제 등 민감 데이터에 접근할 수 있습니다. 신뢰할 수 있는 직원에게만 부여하세요.</p>
    </div>
  );
}
