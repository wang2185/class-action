import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "../lib/queryClient";
import { useState } from "react";

const UPDATE_LABELS: Record<string, string> = {
  notice: "공지", filing: "소제기", hearing: "기일", ruling: "판결", settlement: "합의", document: "서류",
};
const UPDATE_COLORS: Record<string, string> = {
  notice: "bg-gray-100 text-gray-700", filing: "bg-blue-100 text-blue-700",
  hearing: "bg-yellow-100 text-yellow-700", ruling: "bg-red-100 text-red-700",
  settlement: "bg-purple-100 text-purple-700", document: "bg-green-100 text-green-700",
};

export default function CaseProgress() {
  const { id } = useParams();
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");

  const { data: caseData } = useQuery({ queryKey: ["case", id], queryFn: () => apiRequest(`/api/cases/${id}`) });
  const { data: updates, isLoading } = useQuery({
    queryKey: ["caseUpdates", id],
    queryFn: () => apiRequest(`/api/cases/${id}/updates`),
  });
  const { data: myEvidence } = useQuery({
    queryKey: ["evidence", id],
    queryFn: () => apiRequest(`/api/cases/${id}/evidence`),
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadMsg("");
    try {
      const formData = new FormData();
      Array.from(files).forEach((f) => formData.append("files", f));
      const res = await fetch(`/api/cases/${id}/evidence`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      queryClient.invalidateQueries({ queryKey: ["evidence", id] });
      setUploadMsg("업로드 완료");
      e.target.value = "";
    } catch (err: any) {
      setUploadMsg(err.message || "업로드 실패");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">사건 경과</h1>
          {caseData && <p className="text-gray-500 mt-1">{caseData.title}</p>}
        </div>
        <Link to={`/cases/${id}`} className="btn-secondary text-sm">사건 상세</Link>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* 타임라인 */}
        <div className="md:col-span-2">
          <div className="card">
            <h2 className="font-bold text-lg mb-4">진행 경과</h2>
            {isLoading ? (
              <p className="text-gray-400 py-8 text-center">불러오는 중...</p>
            ) : !updates || updates.length === 0 ? (
              <p className="text-gray-400 py-8 text-center">아직 등록된 경과가 없습니다.</p>
            ) : (
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
                <div className="space-y-6">
                  {updates.map((u: any) => (
                    <div key={u.id} className="relative pl-10">
                      <div className="absolute left-2.5 w-3 h-3 bg-primary-500 rounded-full border-2 border-white" />
                      <div className="bg-gray-50 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`badge ${UPDATE_COLORS[u.updateType] || "bg-gray-100 text-gray-700"}`}>
                            {UPDATE_LABELS[u.updateType] || u.updateType}
                          </span>
                          <span className="text-xs text-gray-400">
                            {new Date(u.createdAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}
                          </span>
                        </div>
                        <h3 className="font-semibold">{u.title}</h3>
                        <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{u.content}</p>
                        {u.attachmentName && (
                          <a href={`/uploads/${u.attachmentPath?.split("/").pop()}`} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-primary-500 mt-2 hover:underline">
                            첨부: {u.attachmentName}
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 사이드바 */}
        <div className="space-y-4">
          {/* 증거 */}
          <div className="card">
            <h3 className="font-bold mb-3">내 증거 파일</h3>
            {myEvidence && myEvidence.length > 0 ? (
              <ul className="space-y-2 text-sm mb-4">
                {myEvidence.map((ev: any) => (
                  <li key={ev.id} className="flex items-center justify-between bg-gray-50 rounded p-2">
                    <span className="truncate flex-1">{ev.fileName}</span>
                    <span className="text-xs text-gray-400 ml-2">{(ev.fileSize / 1024).toFixed(0)}KB</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400 mb-3">업로드된 증거가 없습니다.</p>
            )}
            <label className="btn-secondary w-full text-center block cursor-pointer text-sm">
              {uploading ? "업로드 중..." : "증거 파일 추가"}
              <input type="file" multiple className="hidden" onChange={handleFileUpload} disabled={uploading}
                accept=".jpg,.jpeg,.png,.gif,.pdf,.doc,.docx,.xls,.xlsx,.zip,.mp4,.mov,.mp3,.wav,.txt" />
            </label>
            {uploadMsg && <p className="text-xs text-center mt-2 text-gray-500">{uploadMsg}</p>}
          </div>

          {/* 법률 도구 */}
          <div className="card">
            <h3 className="font-bold mb-3">법률 도구</h3>
            <div className="space-y-2">
              <a href="https://day.lawyer/casecrab" target="_blank" rel="noopener noreferrer" className="block text-sm text-primary-500 hover:underline">
                판례 검색 (CaseScraper) →
              </a>
              <a href="https://docurepeat.com" target="_blank" rel="noopener noreferrer" className="block text-sm text-primary-500 hover:underline">
                문서 자동화 (DocuRepeat) →
              </a>
              <a href="https://gongsi.estate" target="_blank" rel="noopener noreferrer" className="block text-sm text-primary-500 hover:underline">
                시가 조회 (Siga-Lookup) →
              </a>
            </div>
          </div>

          {/* 홍보 */}
          <a href="https://willsave.co.kr" target="_blank" rel="noopener noreferrer" className="block card bg-purple-50 hover:bg-purple-100 transition-colors">
            <p className="font-bold text-purple-600 text-sm">유언장 서비스</p>
            <p className="text-xs text-purple-500 mt-1">소중한 뜻을 법적으로 남기세요 →</p>
          </a>
        </div>
      </div>
    </div>
  );
}
