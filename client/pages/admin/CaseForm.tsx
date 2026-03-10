import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "../../lib/queryClient";
import { useState, useEffect } from "react";

export default function AdminCaseForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [form, setForm] = useState({
    title: "", summary: "", description: "", caseType: "", defendant: "",
    retainerFee: "", targetCount: "", courtName: "", caseNumber: "",
    status: "recruiting", supportsPaymentOrder: false, supportsProvisionalSeizure: false,
  });
  const [error, setError] = useState("");

  const { data: existing } = useQuery({
    queryKey: ["case", id],
    queryFn: () => apiRequest(`/api/cases/${id}`),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existing) {
      setForm({
        title: existing.title || "",
        summary: existing.summary || "",
        description: existing.description || "",
        caseType: existing.caseType || "",
        defendant: existing.defendant || "",
        retainerFee: existing.retainerFee?.toString() || "",
        targetCount: existing.targetCount?.toString() || "",
        courtName: existing.courtName || "",
        caseNumber: existing.caseNumber || "",
        status: existing.status || "recruiting",
        supportsPaymentOrder: existing.supportsPaymentOrder || false,
        supportsProvisionalSeizure: existing.supportsProvisionalSeizure || false,
      });
    }
  }, [existing]);

  const mutation = useMutation({
    mutationFn: (data: any) =>
      isEdit
        ? apiRequest(`/api/admin/cases/${id}`, { method: "PUT", body: JSON.stringify(data) })
        : apiRequest("/api/admin/cases", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      navigate("/admin");
    },
    onError: (err: any) => setError(err.message),
  });

  const update = (field: string, value: any) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">{isEdit ? "사건 편집" : "새 사건 등록"}</h1>
      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">{error}</div>}

      <div className="card space-y-4">
        <div>
          <label className="label">사건명 *</label>
          <input type="text" className="input" value={form.title} onChange={(e) => update("title", e.target.value)} required />
        </div>
        <div>
          <label className="label">사건 요약 (목록 표시용)</label>
          <input type="text" className="input" value={form.summary} onChange={(e) => update("summary", e.target.value)} />
        </div>
        <div>
          <label className="label">상세 설명</label>
          <textarea className="input min-h-[150px]" value={form.description} onChange={(e) => update("description", e.target.value)} />
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label">사건 유형</label>
            <select className="input" value={form.caseType} onChange={(e) => update("caseType", e.target.value)}>
              <option value="">선택</option>
              <option value="손해배상">손해배상</option>
              <option value="부당이득반환">부당이득반환</option>
              <option value="채무불이행">채무불이행</option>
              <option value="불법행위">불법행위</option>
              <option value="소비자보호">소비자보호</option>
              <option value="근로관계">근로관계</option>
              <option value="기타">기타</option>
            </select>
          </div>
          <div>
            <label className="label">상태</label>
            <select className="input" value={form.status} onChange={(e) => update("status", e.target.value)}>
              <option value="recruiting">모집중</option>
              <option value="filed">소 제기</option>
              <option value="in_progress">진행중</option>
              <option value="settled">합의</option>
              <option value="closed">종결</option>
            </select>
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label">피고</label>
            <input type="text" className="input" value={form.defendant} onChange={(e) => update("defendant", e.target.value)} />
          </div>
          <div>
            <label className="label">관할법원</label>
            <input type="text" className="input" value={form.courtName} onChange={(e) => update("courtName", e.target.value)} />
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="label">사건번호</label>
            <input type="text" className="input" value={form.caseNumber} onChange={(e) => update("caseNumber", e.target.value)} placeholder="2026가합12345" />
          </div>
          <div>
            <label className="label">착수금 (원) *</label>
            <input type="number" className="input" value={form.retainerFee} onChange={(e) => update("retainerFee", e.target.value)} required />
          </div>
          <div>
            <label className="label">목표 인원</label>
            <input type="number" className="input" value={form.targetCount} onChange={(e) => update("targetCount", e.target.value)} />
          </div>
        </div>

        <div className="border-t pt-4 space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.supportsPaymentOrder} onChange={(e) => update("supportsPaymentOrder", e.target.checked)}
              className="w-4 h-4 text-primary-500 rounded" />
            <span className="text-sm">지급명령 신청 가능</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.supportsProvisionalSeizure} onChange={(e) => update("supportsProvisionalSeizure", e.target.checked)}
              className="w-4 h-4 text-primary-500 rounded" />
            <span className="text-sm">가압류 신청 가능</span>
          </label>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={() => mutation.mutate(form)} disabled={mutation.isPending} className="btn-primary flex-1">
            {mutation.isPending ? "저장 중..." : isEdit ? "수정" : "등록"}
          </button>
          <button onClick={() => navigate("/admin")} className="btn-secondary">취소</button>
        </div>
      </div>
    </div>
  );
}
