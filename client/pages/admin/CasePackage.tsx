import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "../../lib/queryClient";

// 변호사 전용 — 사건 자료 집계 + 서면 패키지 내보내기
export default function CasePackage() {
  const { id } = useParams();
  const [downloading, setDownloading] = useState(false);
  const [msg, setMsg] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["casePackage", id],
    queryFn: () => apiRequest(`/api/lawyer/cases/${id}/package`),
    retry: false,
  });

  // ZIP 다운로드는 바이너리라 apiRequest(JSON 강제) 대신 raw fetch + blob
  const handleExport = async () => {
    setDownloading(true);
    setMsg("");
    try {
      const res = await fetch(`/api/lawyer/cases/${id}/package/export`, { credentials: "include" });
      if (!res.ok) {
        let em = `오류 (HTTP ${res.status})`;
        try { const d = await res.json(); em = d.error || em; } catch { /* noop */ }
        throw new Error(em);
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const m = cd.match(/filename\*=UTF-8''([^;]+)/);
      const fname = m ? decodeURIComponent(m[1]) : `case_${id}_dossier.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMsg("내려받기 완료");
    } catch (e: any) {
      setMsg(e.message || "내보내기 실패");
    } finally {
      setDownloading(false);
    }
  };

  if (isLoading) return <div className="max-w-5xl mx-auto px-4 py-8 text-gray-400">불러오는 중...</div>;
  if (error || !data) return <div className="max-w-5xl mx-auto px-4 py-8 text-gray-500">패키지를 불러올 수 없습니다. (권한 또는 사건을 확인하세요)</div>;

  const d = data;
  const allEvidence = d.당사자목록.flatMap((p: any) => p.evidence.map((ev: any) => ({ ...ev, 당사자: p.성명 })));

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold">서면 작성 자료</h1>
        <Link to="/admin" className="btn-secondary text-sm">대시보드</Link>
      </div>
      <p className="text-gray-500 mb-6">{d.사건.사건명}{d.사건.사건번호 ? ` (${d.사건.사건번호})` : ""}</p>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card text-center"><p className="text-sm text-gray-500">당사자</p><p className="text-2xl font-bold text-primary-500 mt-1">{d.당사자목록.length}명</p></div>
        <div className="card text-center"><p className="text-sm text-gray-500">청구금액 합계</p><p className="text-2xl font-bold text-accent-500 mt-1">{(d.청구금액합계_당사자 || 0).toLocaleString()}원</p></div>
        <div className="card text-center"><p className="text-sm text-gray-500">증거</p><p className="text-2xl font-bold text-blue-500 mt-1">{d.증거총건수}건</p></div>
      </div>

      <div className="card mb-6 bg-primary-50">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-[240px]">
            <p className="font-semibold text-primary-700">사건 패키지 내보내기</p>
            <p className="text-xs text-primary-600 mt-1">별지 당사자목록·청구금액·증거(호증순)·사건요약을 ZIP으로 묶어 내려받습니다. 이후 Claude Code에 올려 winslaw-brief / sojang-format 스킬로 소장·준비서면을 작성하세요.</p>
            <p className="text-xs text-red-500 mt-1">⚠ dossier.json 에 평문 주민등록번호가 포함됩니다. 외부 전송 금지·취급 유의.</p>
          </div>
          <button onClick={handleExport} disabled={downloading} className="btn-primary whitespace-nowrap">
            {downloading ? "생성 중..." : "패키지 내보내기"}
          </button>
        </div>
        {msg && <p className="text-xs mt-2 text-gray-600">{msg}</p>}
      </div>

      <div className="card overflow-x-auto mb-6">
        <h2 className="font-bold mb-3">별지 당사자목록</h2>
        {d.당사자목록.length === 0 ? <p className="text-gray-400 text-sm py-4">참여 당사자가 없습니다.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left">
              <th className="pb-2">순번</th><th className="pb-2">지위</th><th className="pb-2">성명</th><th className="pb-2">주소</th><th className="pb-2">주민등록번호</th><th className="pb-2 text-right">피해금액</th><th className="pb-2 text-right">증거</th>
            </tr></thead>
            <tbody>
              {d.당사자목록.map((p: any) => (
                <tr key={p.순번} className="border-b last:border-0">
                  <td className="py-2">{p.순번}</td>
                  <td className="py-2">{p.지위}</td>
                  <td className="py-2 font-medium">{p.성명_정규화}</td>
                  <td className="py-2 text-gray-500 max-w-[200px] truncate">{p.주소 || "-"}</td>
                  <td className="py-2 text-gray-400">{p.주민등록번호 || "-"}</td>
                  <td className="py-2 text-right">{p.피해금액 ? `${p.피해금액.toLocaleString()}원` : "-"}</td>
                  <td className="py-2 text-right">{p.evidence.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card overflow-x-auto">
        <h2 className="font-bold mb-3">입증방법 (호증 순)</h2>
        {allEvidence.length === 0 ? <p className="text-gray-400 text-sm py-4">등록된 증거가 없습니다.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left"><th className="pb-2">호증</th><th className="pb-2">당사자</th><th className="pb-2">파일명</th><th className="pb-2">설명</th></tr></thead>
            <tbody>
              {allEvidence.map((ev: any) => (
                <tr key={ev.id} className="border-b last:border-0">
                  <td className="py-2 font-medium whitespace-nowrap">{ev.호증}</td>
                  <td className="py-2 text-gray-500">{ev.당사자}</td>
                  <td className="py-2 max-w-[240px] truncate">{ev.fileName}</td>
                  <td className="py-2 text-gray-500 max-w-[200px] truncate">{ev.description || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
