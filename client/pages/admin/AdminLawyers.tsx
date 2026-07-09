import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "../../lib/queryClient";
import { useAuth } from "../../hooks/use-auth";

const STAFF_ROLES = [{ v: "lawyer", l: "변호사" }, { v: "admin", l: "관리자" }, { v: "owner", l: "오너" }];
const ROLE_LABEL: Record<string, string> = { member: "회원", lawyer: "변호사", admin: "관리자", owner: "오너" };
const ROLE_CLS: Record<string, string> = {
  owner: "bg-rose-100 text-rose-700", admin: "bg-accent-100 text-accent-700",
  lawyer: "bg-purple-100 text-purple-700", member: "bg-gray-100 text-gray-600",
};
const fmt = (d?: string) => (d ? new Date(d).toLocaleDateString("ko-KR") : "-");
const blankForm = { email: "", name: "", phone: "", role: "lawyer", tempPassword: "" };

// 변호사·직원 계정(role !== "member") 및 권한 관리. 권한 변경·삭제는 오너 전용.
export default function AdminLawyers() {
  const { user: me, isOwner } = useAuth();
  const { data: users, isLoading } = useQuery({ queryKey: ["adminUsers"], queryFn: () => apiRequest("/api/admin/users") });
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(blankForm);
  const [promoteQ, setPromoteQ] = useState("");

  const staff = useMemo(() => (Array.isArray(users) ? users.filter((u) => u.role !== "member") : []), [users]);
  const promoteHits = useMemo(() => {
    const kw = promoteQ.trim().toLowerCase();
    if (!kw) return [];
    return (Array.isArray(users) ? users : [])
      .filter((u) => u.role === "member")
      .filter((u) => [u.name, u.email, u.phone].some((v) => String(v || "").toLowerCase().includes(kw)))
      .slice(0, 8);
  }, [users, promoteQ]);

  function refresh() { return queryClient.invalidateQueries({ queryKey: ["adminUsers"] }); }

  async function changeRole(id: number, role: string) {
    setBusy(id); setMsg(null);
    try {
      await apiRequest(`/api/admin/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) });
      await refresh();
      setMsg({ ok: true, text: "권한이 변경되었습니다." });
    } catch (err: any) { setMsg({ ok: false, text: err?.message || "변경 실패" }); }
    finally { setBusy(null); }
  }

  async function createStaff(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    try {
      await apiRequest("/api/admin/users", { method: "POST", body: JSON.stringify(createForm) });
      await refresh();
      setCreateForm(blankForm); setShowCreate(false);
      setMsg({ ok: true, text: "직원 계정이 추가되었습니다." });
    } catch (err: any) { setMsg({ ok: false, text: err?.message || "추가 실패" }); }
  }

  async function softDelete(u: any) {
    if (!window.confirm(`'${u.name}' 계정을 탈퇴 처리하시겠습니까?\n목록·로그인에서 제외됩니다.`)) return;
    setBusy(u.id); setMsg(null);
    try {
      await apiRequest(`/api/admin/users/${u.id}`, { method: "DELETE" });
      await refresh();
      setMsg({ ok: true, text: "계정을 탈퇴 처리했습니다." });
    } catch (err: any) { setMsg({ ok: false, text: err?.message || "삭제 실패" }); }
    finally { setBusy(null); }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">변호사 회원</h1>
          <p className="text-sm text-gray-500 mt-1">변호사·관리자·오너 계정입니다. 민감 데이터에 접근하므로 신뢰할 수 있는 직원에게만 권한을 부여하세요.</p>
        </div>
        {isOwner && (
          <button onClick={() => { setShowCreate((s) => !s); setMsg(null); }} className="btn-primary text-sm">{showCreate ? "닫기" : "+ 직원 추가"}</button>
        )}
      </div>

      {msg && <p className={`text-sm mb-4 ${msg.ok ? "text-primary-700" : "text-red-600"}`}>{msg.text}</p>}

      {showCreate && isOwner && (
        <form onSubmit={createStaff} className="card mb-6 flex items-end gap-2 flex-wrap">
          <label className="text-xs text-gray-500 flex flex-col gap-1">이메일*
            <input type="email" required value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm w-52" />
          </label>
          <label className="text-xs text-gray-500 flex flex-col gap-1">이름*
            <input required value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm w-32" />
          </label>
          <label className="text-xs text-gray-500 flex flex-col gap-1">연락처
            <input value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm w-36" />
          </label>
          <label className="text-xs text-gray-500 flex flex-col gap-1">권한
            <select value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
              {STAFF_ROLES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-500 flex flex-col gap-1">임시 비밀번호(선택)
            <input type="text" value={createForm.tempPassword} onChange={(e) => setCreateForm({ ...createForm, tempPassword: e.target.value })} placeholder="8자 이상" className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm w-36" />
          </label>
          <button type="submit" className="btn-primary text-sm">추가</button>
        </form>
      )}

      <div className="card">
        <h2 className="font-bold text-lg mb-4">직원 계정 <span className="text-sm text-gray-400 font-normal">{staff.length}명</span></h2>
        {isLoading ? (
          <p className="text-gray-400 py-10 text-center">불러오는 중…</p>
        ) : staff.length === 0 ? (
          <p className="text-gray-400 py-10 text-center">직원 계정이 없습니다.</p>
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
                  <th className="pb-3 font-semibold text-center">관리</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((u) => (
                  <tr key={u.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3 font-medium">{u.name}{me?.id === u.id && <span className="text-xs text-gray-400"> (나)</span>}</td>
                    <td className="py-3 text-gray-500">{u.email}</td>
                    <td className="py-3 text-gray-500">{u.phone || "-"}</td>
                    <td className="py-3 text-gray-400">{fmt(u.createdAt)}</td>
                    <td className="py-3 text-center">
                      {isOwner && me?.id !== u.id ? (
                        <select disabled={busy === u.id} value={u.role} onChange={(e) => changeRole(u.id, e.target.value)}
                          className="rounded-lg border border-gray-300 px-2 py-1 text-sm disabled:opacity-50">
                          <option value="member">회원</option>
                          {STAFF_ROLES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
                        </select>
                      ) : (
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_CLS[u.role]}`}>{ROLE_LABEL[u.role] || u.role}</span>
                      )}
                    </td>
                    <td className="py-3 text-center">
                      {isOwner && me?.id !== u.id ? (
                        <button onClick={() => softDelete(u)} disabled={busy === u.id} className="text-xs text-red-600 hover:underline disabled:opacity-50">탈퇴</button>
                      ) : <span className="text-xs text-gray-300">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 회원 승격(오너) */}
      {isOwner && (
        <div className="card mt-6">
          <h2 className="font-bold text-lg mb-1">회원 승격</h2>
          <p className="text-sm text-gray-500 mb-4">기존 일반 회원을 변호사·관리자 권한으로 올립니다.</p>
          <input value={promoteQ} onChange={(e) => setPromoteQ(e.target.value)} placeholder="회원 이름·이메일·연락처 검색"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 w-full max-w-md mb-3" />
          {promoteQ.trim() && (
            promoteHits.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">일치하는 회원이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {promoteHits.map((u) => (
                  <div key={u.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2">
                    <div className="min-w-0">
                      <p className="font-medium text-ink truncate">{u.name} <span className="text-xs text-gray-400">{u.email}</span></p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => changeRole(u.id, "lawyer")} disabled={busy === u.id} className="btn-secondary text-xs disabled:opacity-50">변호사로</button>
                      <button onClick={() => changeRole(u.id, "admin")} disabled={busy === u.id} className="btn-secondary text-xs disabled:opacity-50">관리자로</button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
