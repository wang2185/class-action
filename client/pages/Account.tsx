import { useState, type FormEvent } from "react";
import { useAuth } from "../hooks/use-auth";
import { apiRequest, queryClient } from "../lib/queryClient";
import { usePageMeta } from "../hooks/use-page-meta";

const inputCls =
  "w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500";

function Msg({ m }: { m: { ok: boolean; text: string } | null }) {
  if (!m) return null;
  return (
    <p role="status" className={`text-sm mt-3 ${m.ok ? "text-primary-700" : "text-red-600"}`}>
      {m.text}
    </p>
  );
}

export default function Account() {
  const { user } = useAuth();
  usePageMeta("내 정보 | 로사이어티 집단소송", "이름·연락처와 로그인 비밀번호를 변경합니다.");

  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [pmsg, setPmsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingP, setSavingP] = useState(false);

  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [cf, setCf] = useState("");
  const [wmsg, setWmsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingW, setSavingW] = useState(false);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setSavingP(true);
    setPmsg(null);
    try {
      await apiRequest("/api/auth/profile", { method: "PATCH", body: JSON.stringify({ name, phone }) });
      await queryClient.invalidateQueries({ queryKey: ["auth"] });
      setPmsg({ ok: true, text: "저장되었습니다." });
    } catch (err: any) {
      setPmsg({ ok: false, text: err?.message || "저장에 실패했습니다." });
    } finally {
      setSavingP(false);
    }
  }

  async function changePw(e: FormEvent) {
    e.preventDefault();
    setWmsg(null);
    if (nw !== cf) return setWmsg({ ok: false, text: "새 비밀번호가 일치하지 않습니다." });
    if (nw.length < 8) return setWmsg({ ok: false, text: "새 비밀번호는 8자 이상이어야 합니다." });
    setSavingW(true);
    try {
      await apiRequest("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: cur, newPassword: nw }),
      });
      setCur("");
      setNw("");
      setCf("");
      setWmsg({ ok: true, text: "비밀번호가 변경되었습니다." });
    } catch (err: any) {
      setWmsg({ ok: false, text: err?.message || "변경에 실패했습니다." });
    } finally {
      setSavingW(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-extrabold text-ink mb-1">내 정보</h1>
      <p className="text-sm text-ink-muted mb-8">이름·연락처와 로그인 비밀번호를 변경할 수 있습니다.</p>

      <form onSubmit={saveProfile} className="card mb-6">
        <h2 className="font-bold text-ink mb-4">기본 정보</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">이메일</label>
            <input className={`${inputCls} bg-gray-50 text-gray-500`} value={user?.email ?? ""} disabled />
          </div>
          <div>
            <label htmlFor="acc-name" className="block text-sm font-medium text-ink mb-1.5">이름</label>
            <input id="acc-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          </div>
          <div>
            <label htmlFor="acc-phone" className="block text-sm font-medium text-ink mb-1.5">연락처</label>
            <input id="acc-phone" className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} placeholder="010-0000-0000" />
          </div>
        </div>
        <Msg m={pmsg} />
        <button type="submit" disabled={savingP} className="btn-primary mt-5 px-5 py-2.5 disabled:opacity-60">
          {savingP ? "저장 중…" : "정보 저장"}
        </button>
      </form>

      <form onSubmit={changePw} className="card">
        <h2 className="font-bold text-ink mb-4">비밀번호 변경</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="acc-cur" className="block text-sm font-medium text-ink mb-1.5">현재 비밀번호</label>
            <input id="acc-cur" type="password" autoComplete="current-password" className={inputCls} value={cur} onChange={(e) => setCur(e.target.value)} />
          </div>
          <div>
            <label htmlFor="acc-nw" className="block text-sm font-medium text-ink mb-1.5">
              새 비밀번호 <span className="text-ink-muted font-normal">(8자 이상)</span>
            </label>
            <input id="acc-nw" type="password" autoComplete="new-password" className={inputCls} value={nw} onChange={(e) => setNw(e.target.value)} />
          </div>
          <div>
            <label htmlFor="acc-cf" className="block text-sm font-medium text-ink mb-1.5">새 비밀번호 확인</label>
            <input id="acc-cf" type="password" autoComplete="new-password" className={inputCls} value={cf} onChange={(e) => setCf(e.target.value)} />
          </div>
        </div>
        <Msg m={wmsg} />
        <button type="submit" disabled={savingW} className="btn-primary mt-5 px-5 py-2.5 disabled:opacity-60">
          {savingW ? "변경 중…" : "비밀번호 변경"}
        </button>
      </form>
    </div>
  );
}
