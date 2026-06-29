import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "../../lib/queryClient";
import { useAuth } from "../../hooks/use-auth";
import AdminNav from "../../components/AdminNav";

const ROLES = [{ v: "member", l: "회원" }, { v: "lawyer", l: "변호사" }, { v: "admin", l: "관리자" }, { v: "owner", l: "오너" }];
const ROLE_CLS: Record<string, string> = { owner: "bg-rose-100 text-rose-700", admin: "bg-accent-100 text-accent-700", lawyer: "bg-purple-100 text-purple-700", member: "bg-gray-100 text-gray-600" };
const fmt = (d?: string) => (d ? new Date(d).toLocaleDateString("ko-KR") : "-");
const blankForm = { email: "", name: "", phone: "", role: "member", tempPassword: "" };

export default function AdminUsers() {
  const { user: me, isOwner } = useAuth();
  const { data: users, isLoading } = useQuery({ queryKey: ["adminUsers"], queryFn: () => apiRequest("/api/admin/users") });
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // 생성 폼
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(blankForm);
  // 인라인 편집
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "", email: "" });

  const filtered = useMemo(() => {
    const l: any[] = Array.isArray(users) ? users : [];
    const kw = q.trim().toLowerCase();
    return kw ? l.filter((u) => [u.name, u.email, u.phone].some((v) => String(v || "").toLowerCase().includes(kw))) : l;
  }, [users, q]);

  function refresh() { return queryClient.invalidateQueries({ queryKey: ["adminUsers"] }); }

  async function changeRole(id: number, role: string) {
    setBusy(id); setMsg(null);
    try {
      await apiRequest(`/api/admin/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) });
      await refresh();
      setMsg({ ok: true, text: "권한이 변경되었습니다." });
    } catch (err: any) {
      setMsg({ ok: false, text: err?.message || "변경 실패" });
    } finally { setBusy(null); }
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    try {
      await apiRequest("/api/admin/users", { method: "POST", body: JSON.stringify(createForm) });
      await refresh();
      setCreateForm(blankForm); setShowCreate(false);
      setMsg({ ok: true, text: "회원이 추가되었습니다." });
    } catch (err: any) {
      setMsg({ ok: false, text: err?.message || "추가 실패" });
    }
  }

  function startEdit(u: any) { setEditId(u.id); setEditForm({ name: u.name || "", phone: u.phone || "", email: u.email || "" }); }
  async function saveEdit(id: number) {
    setBusy(id); setMsg(null);
    try {
      await apiRequest(`/api/admin/users/${id}`, { method: "PUT", body: JSON.stringify(editForm) });
      await refresh();
      setEditId(null);
      setMsg({ ok: true, text: "회원 정보가 수정되었습니다." });
    } catch (err: any) {
      setMsg({ ok: false, text: err?.message || "수정 실패" });
    } finally { setBusy(null); }
  }

  async function softDelete(u: any) {
    if (!window.confirm(`'${u.name}' 회원을 탈퇴 처리하시겠습니까?\n목록·로그인에서 제외되며 결제 등 기록은 보존됩니다.`)) return;
    setBusy(u.id); setMsg(null);
    try {
      await apiRequest(`/api/admin/users/${u.id}`, { method: "DELETE" });
      await refresh();
      setMsg({ ok: true, text: "회원을 탈퇴 처리했습니다." });
    } catch (err: any) {
      setMsg({ ok: false, text: err?.message || "삭제 실패" });
    } finally { setBusy(null); }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <AdminNav />
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <h1 className="text-2xl md:text-3xl font-bold">사용자 · 권한</h1>
        <button onClick={() => { setShowCreate((s) => !s); setMsg(null); }} className="btn-primary text-sm">{showCreate ? "닫기" : "+ 회원 추가"}</button>
      </div>

      {showCreate && (
        <form onSubmit={createUser} className="card mb-6 flex items-end gap-2 flex-wrap">
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
              {ROLES.filter((r) => r.v !== "owner" || isOwner).map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-500 flex flex-col gap-1">임시 비밀번호(선택)
            <input type="text" value={createForm.tempPassword} onChange={(e) => setCreateForm({ ...createForm, tempPassword: e.target.value })} placeholder="8자 이상" className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm w-36" />
          </label>
          <button type="submit" className="btn-primary text-sm">추가</button>
        </form>
      )}

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
                  <th className="pb-3 font-semibold">생년월일</th>
                  <th className="pb-3 font-semibold">배송지</th>
                  <th className="pb-3 font-semibold">가입일</th>
                  <th className="pb-3 font-semibold text-center">권한</th>
                  <th className="pb-3 font-semibold text-center">관리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="border-b last:border-0 hover:bg-gray-50 align-top">
                    {editId === u.id ? (
                      <>
                        <td className="py-3"><input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="rounded border border-gray-300 px-2 py-1 text-sm w-28" /></td>
                        <td className="py-3"><input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="rounded border border-gray-300 px-2 py-1 text-sm w-48" /></td>
                        <td className="py-3"><input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className="rounded border border-gray-300 px-2 py-1 text-sm w-32" /></td>
                        <td className="py-3 text-gray-400">{u.birthDate || "-"}</td>
                        <td className="py-3 text-gray-400">{u.postalCode ? `(${u.postalCode}) ${u.addressLine1 || ""}${u.addressLine2 ? ` ${u.addressLine2}` : ""}` : "-"}</td>
                        <td className="py-3 text-gray-400">{fmt(u.createdAt)}</td>
                        <td className="py-3 text-center"><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_CLS[u.role] || "bg-gray-100 text-gray-600"}`}>{ROLES.find((r) => r.v === u.role)?.l || u.role}</span></td>
                        <td className="py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => saveEdit(u.id)} disabled={busy === u.id} className="text-xs text-primary-700 hover:underline disabled:opacity-50">저장</button>
                            <button onClick={() => setEditId(null)} className="text-xs text-gray-500 hover:underline">취소</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-3 font-medium">{u.name}{me?.id === u.id && <span className="text-xs text-gray-400"> (나)</span>}</td>
                        <td className="py-3 text-gray-500">{u.email}</td>
                        <td className="py-3 text-gray-500">{u.phone || "-"}</td>
                        <td className="py-3 text-gray-500">{u.birthDate || "-"}</td>
                        <td className="py-3 text-gray-500 max-w-[16rem]"><span className="line-clamp-2" title={u.postalCode ? `(${u.postalCode}) ${u.addressLine1 || ""}${u.addressLine2 ? ` ${u.addressLine2}` : ""}` : ""}>{u.postalCode ? `(${u.postalCode}) ${u.addressLine1 || ""}${u.addressLine2 ? ` ${u.addressLine2}` : ""}` : "-"}</span></td>
                        <td className="py-3 text-gray-400">{fmt(u.createdAt)}</td>
                        <td className="py-3 text-center">
                          <select disabled={busy === u.id || !isOwner} value={u.role} onChange={(e) => changeRole(u.id, e.target.value)}
                            className="rounded-lg border border-gray-300 px-2 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                            {ROLES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
                          </select>
                        </td>
                        <td className="py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => startEdit(u)} className="text-xs text-accent-600 hover:underline">수정</button>
                            {isOwner && me?.id !== u.id && (
                              <button onClick={() => softDelete(u)} disabled={busy === u.id} className="text-xs text-red-600 hover:underline disabled:opacity-50">탈퇴</button>
                            )}
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-3">{isOwner ? "권한 변경·회원 탈퇴는 오너만 가능합니다. 변호사·관리자·오너 권한은 민감 데이터에 접근하므로 신뢰할 수 있는 직원에게만 부여하세요." : "권한 변경·회원 탈퇴는 오너만 가능합니다. 회원 추가·정보 수정은 관리자도 가능합니다."}</p>
    </div>
  );
}
