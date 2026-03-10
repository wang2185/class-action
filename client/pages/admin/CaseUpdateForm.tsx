import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "../../lib/queryClient";
import { useState } from "react";

export default function AdminCaseUpdate() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: "", content: "", updateType: "notice", isPublic: true,
  });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");

  const { data: caseData } = useQuery({ queryKey: ["case", id], queryFn: () => apiRequest(`/api/cases/${id}`) });
  const { data: updates } = useQuery({
    queryKey: ["caseUpdates", id],
    queryFn: () => apiRequest(`/api/cases/${id}/updates`),
  });

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const formData = new FormData();
      formData.append("title", data.title);
      formData.append("content", data.content);
      formData.append("updateType", data.updateType);
      formData.append("isPublic", data.isPublic.toString());
      if (file) formData.append("attachment", file);

      const res = await fetch(`/api/admin/cases/${id}/updates`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["caseUpdates", id] });
      setForm({ title: "", content: "", updateType: "notice", isPublic: true });
      setFile(null);
    },
    onError: (err: any) => setError(err.message),
  });

  const update = (field: string, value: any) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">사건 경과 등록</h1>
      {caseData && <p className="text-gray-500 mb-6">{caseData.title}</p>}

      <div className="grid md:grid-cols-2 gap-6">
        {/* 등록 폼 */}
        <div className="card space-y-4">
          <h2 className="font-bold text-lg">새 경과 등록</h2>
          {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">{error}</div>}

          <div>
            <label className="label">유형</label>
            <select className="input" value={form.updateType} onChange={(e) => update("updateType", e.target.value)}>
              <option value="notice">공지</option>
              <option value="filing">소제기</option>
              <option value="hearing">기일</option>
              <option value="ruling">판결</option>
              <option value="settlement">합의</option>
              <option value="document">서류</option>
            </select>
          </div>
          <div>
            <label className="label">제목 *</label>
            <input type="text" className="input" value={form.title} onChange={(e) => update("title", e.target.value)} required />
          </div>
          <div>
            <label className="label">내용 *</label>
            <textarea className="input min-h-[150px]" value={form.content} onChange={(e) => update("content", e.target.value)} required />
          </div>
          <div>
            <label className="label">첨부파일</label>
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isPublic} onChange={(e) => update("isPublic", e.target.checked)}
              className="w-4 h-4 text-primary-500 rounded" />
            <span className="text-sm">당사자에게 공개</span>
          </label>
          <button onClick={() => mutation.mutate(form)} disabled={mutation.isPending} className="btn-primary w-full">
            {mutation.isPending ? "등록 중..." : "경과 등록"}
          </button>
        </div>

        {/* 기존 경과 목록 */}
        <div className="card">
          <h2 className="font-bold text-lg mb-4">등록된 경과 ({updates?.length || 0})</h2>
          {!updates || updates.length === 0 ? (
            <p className="text-gray-400 py-4 text-center text-sm">등록된 경과가 없습니다.</p>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {updates.map((u: any) => (
                <div key={u.id} className="bg-gray-50 rounded-lg p-3 text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="badge bg-primary-100 text-primary-700 text-xs">{u.updateType}</span>
                    <span className="text-xs text-gray-400">{new Date(u.createdAt).toLocaleDateString("ko-KR")}</span>
                    {!u.isPublic && <span className="badge bg-red-100 text-red-600 text-xs">비공개</span>}
                  </div>
                  <p className="font-medium">{u.title}</p>
                  <p className="text-gray-500 text-xs mt-1 line-clamp-2">{u.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
