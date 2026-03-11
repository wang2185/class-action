import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "../../lib/queryClient";
import { useState, useRef } from "react";

const DOC_TYPE_LABELS: Record<string, string> = {
  contract: "계약서", registry: "등기부등본", resident_cert: "주민등록등본",
  id_copy: "신분증사본", payment_proof: "입금증명", demand_letter: "내용증명", other: "기타",
};

const PARTY_TYPE_LABELS: Record<string, string> = { individual: "개인", company: "법인" };

export default function AdminDefendants() {
  const { id: caseId } = useParams();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [showBulk, setShowBulk] = useState(false);
  const [showDocGen, setShowDocGen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const emptyForm = {
    name: "", partyType: "individual", residentNumber: "", companyRegNumber: "",
    representativeName: "", address: "", phone: "", email: "",
    claimAmount: "", contractDate: "", unitNumber: "", notes: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [bulkText, setBulkText] = useState("");
  const [genType, setGenType] = useState("payment_order");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const { data: caseData } = useQuery({
    queryKey: ["case", caseId],
    queryFn: () => apiRequest(`/api/cases/${caseId}`),
  });

  const { data: defs = [], isLoading } = useQuery({
    queryKey: ["defendants", caseId],
    queryFn: () => apiRequest(`/api/admin/cases/${caseId}/defendants`),
  });

  const saveMutation = useMutation({
    mutationFn: (data: any) =>
      editId
        ? apiRequest(`/api/admin/defendants/${editId}`, { method: "PUT", body: JSON.stringify(data) })
        : apiRequest(`/api/admin/cases/${caseId}/defendants`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["defendants", caseId] });
      setShowForm(false);
      setEditId(null);
      setForm(emptyForm);
      setSuccess(editId ? "수정 완료" : "추가 완료");
      setTimeout(() => setSuccess(""), 2000);
    },
    onError: (err: any) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (defId: number) => apiRequest(`/api/admin/defendants/${defId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["defendants", caseId] });
      setSuccess("삭제 완료");
      setTimeout(() => setSuccess(""), 2000);
    },
  });

  const bulkMutation = useMutation({
    mutationFn: (rows: any[]) =>
      apiRequest(`/api/admin/cases/${caseId}/defendants/bulk`, { method: "POST", body: JSON.stringify({ rows }) }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["defendants", caseId] });
      setShowBulk(false);
      setBulkText("");
      setSuccess(`${data.count}명 일괄 등록 완료`);
      setTimeout(() => setSuccess(""), 3000);
    },
    onError: (err: any) => setError(err.message),
  });

  const [genResult, setGenResult] = useState<any>(null);
  const genMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest(`/api/admin/cases/${caseId}/generate-documents`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (data) => setGenResult(data),
    onError: (err: any) => setError(err.message),
  });

  const update = (field: string, value: any) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleEdit = (def: any) => {
    setForm({
      name: def.name || "", partyType: def.partyType || "individual",
      residentNumber: "", companyRegNumber: def.companyRegNumber || "",
      representativeName: def.representativeName || "", address: def.address || "",
      phone: def.phone || "", email: def.email || "",
      claimAmount: def.claimAmount?.toString() || "", contractDate: def.contractDate || "",
      unitNumber: def.unitNumber || "", notes: def.notes || "",
    });
    setEditId(def.id);
    setShowForm(true);
  };

  const handleBulkParse = () => {
    try {
      const lines = bulkText.trim().split("\n").filter(Boolean);
      if (lines.length === 0) return setError("데이터가 없습니다.");

      const headers = lines[0].split("\t");
      const fieldMap: Record<string, string> = {
        "이름": "name", "성명": "name", "상호": "name",
        "주소": "address", "전화": "phone", "연락처": "phone", "전화번호": "phone",
        "이메일": "email", "청구금액": "claimAmount", "금액": "claimAmount",
        "계약일": "contractDate", "계약일자": "contractDate",
        "호수": "unitNumber", "동호수": "unitNumber", "동호": "unitNumber",
        "비고": "notes", "메모": "notes",
        "주민등록번호": "residentNumber", "사업자번호": "residentNumber",
        "법인등록번호": "companyRegNumber", "대표자": "representativeName", "대표자명": "representativeName",
        "유형": "partyType",
      };

      const mappedHeaders = headers.map((h) => fieldMap[h.trim()] || h.trim());
      const rows = lines.slice(1).map((line) => {
        const cols = line.split("\t");
        const obj: any = {};
        mappedHeaders.forEach((key, i) => {
          if (cols[i]?.trim()) obj[key] = cols[i].trim();
        });
        return obj;
      }).filter((r) => r.name);

      if (rows.length === 0) return setError("유효한 행이 없습니다. 첫 행에 '이름' 열이 필요합니다.");
      bulkMutation.mutate(rows);
    } catch {
      setError("데이터 파싱 오류");
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };
  const selectAll = () => {
    setSelectedIds(selectedIds.length === defs.length ? [] : defs.map((d: any) => d.id));
  };

  const totalClaim = defs.reduce((sum: number, d: any) => sum + (d.claimAmount || 0), 0);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link to="/admin" className="text-sm text-gray-400 hover:text-gray-600">&larr; 대시보드</Link>
          <h1 className="text-2xl font-bold mt-1">상대방 관리</h1>
          {caseData && <p className="text-sm text-gray-500 mt-1">{caseData.title}</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowForm(true); setEditId(null); setForm(emptyForm); }} className="btn-primary">+ 개별 추가</button>
          <button onClick={() => setShowBulk(true)} className="btn-secondary">엑셀 일괄등록</button>
          <button onClick={() => setShowDocGen(true)} className="btn-secondary" disabled={defs.length === 0}>소송서류 생성</button>
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">{error} <button onClick={() => setError("")} className="ml-2 font-bold">×</button></div>}
      {success && <div className="bg-green-50 text-green-600 text-sm p-3 rounded-lg mb-4">{success}</div>}

      {/* 통계 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card text-center">
          <p className="text-sm text-gray-500">총 상대방</p>
          <p className="text-2xl font-bold text-primary-500">{defs.length}명</p>
        </div>
        <div className="card text-center">
          <p className="text-sm text-gray-500">총 청구금액</p>
          <p className="text-2xl font-bold text-accent-500">{totalClaim.toLocaleString()}원</p>
        </div>
        <div className="card text-center">
          <p className="text-sm text-gray-500">선택됨</p>
          <p className="text-2xl font-bold text-blue-500">{selectedIds.length}명</p>
        </div>
      </div>

      {/* 상대방 목록 */}
      <div className="card">
        {isLoading ? (
          <p className="text-center py-8 text-gray-400">불러오는 중...</p>
        ) : defs.length === 0 ? (
          <p className="text-center py-8 text-gray-400">등록된 상대방이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-3 w-8"><input type="checkbox" checked={selectedIds.length === defs.length && defs.length > 0} onChange={selectAll} /></th>
                  <th className="pb-3 font-semibold">이름</th>
                  <th className="pb-3 font-semibold">유형</th>
                  <th className="pb-3 font-semibold">주소</th>
                  <th className="pb-3 font-semibold">연락처</th>
                  <th className="pb-3 font-semibold">동호수</th>
                  <th className="pb-3 font-semibold text-right">청구금액</th>
                  <th className="pb-3 font-semibold text-center">관리</th>
                </tr>
              </thead>
              <tbody>
                {defs.map((d: any) => (
                  <tr key={d.id} className="border-b last:border-0 hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}>
                    <td className="py-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.includes(d.id)} onChange={() => toggleSelect(d.id)} />
                    </td>
                    <td className="py-3 font-medium">{d.name}{d.representativeName && <span className="text-xs text-gray-400 ml-1">(대표: {d.representativeName})</span>}</td>
                    <td className="py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${d.partyType === "company" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"}`}>{PARTY_TYPE_LABELS[d.partyType]}</span></td>
                    <td className="py-3 text-gray-500 max-w-[200px] truncate">{d.address || "-"}</td>
                    <td className="py-3 text-gray-500">{d.phone || "-"}</td>
                    <td className="py-3 text-gray-500">{d.unitNumber || "-"}</td>
                    <td className="py-3 text-right">{d.claimAmount ? `${d.claimAmount.toLocaleString()}원` : "-"}</td>
                    <td className="py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => handleEdit(d)} className="text-primary-500 hover:underline text-xs">편집</button>
                        <button onClick={() => { if (confirm(`${d.name}을(를) 삭제하시겠습니까?`)) deleteMutation.mutate(d.id); }} className="text-red-500 hover:underline text-xs">삭제</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 개별 추가/수정 모달 */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-xl font-bold mb-4">{editId ? "상대방 수정" : "상대방 추가"}</h2>
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="label">이름/상호 *</label>
                  <input type="text" className="input" value={form.name} onChange={(e) => update("name", e.target.value)} />
                </div>
                <div>
                  <label className="label">유형</label>
                  <select className="input" value={form.partyType} onChange={(e) => update("partyType", e.target.value)}>
                    <option value="individual">개인</option>
                    <option value="company">법인</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">주소</label>
                <input type="text" className="input" value={form.address} onChange={(e) => update("address", e.target.value)} />
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="label">연락처</label>
                  <input type="text" className="input" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
                </div>
                <div>
                  <label className="label">이메일</label>
                  <input type="text" className="input" value={form.email} onChange={(e) => update("email", e.target.value)} />
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="label">주민등록번호/사업자번호</label>
                  <input type="text" className="input" value={form.residentNumber} onChange={(e) => update("residentNumber", e.target.value)} placeholder={editId ? "(변경시에만 입력)" : ""} />
                </div>
                <div>
                  <label className="label">동호수</label>
                  <input type="text" className="input" value={form.unitNumber} onChange={(e) => update("unitNumber", e.target.value)} placeholder="예: 101동 1201호" />
                </div>
              </div>
              {form.partyType === "company" && (
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">법인등록번호</label>
                    <input type="text" className="input" value={form.companyRegNumber} onChange={(e) => update("companyRegNumber", e.target.value)} />
                  </div>
                  <div>
                    <label className="label">대표자명</label>
                    <input type="text" className="input" value={form.representativeName} onChange={(e) => update("representativeName", e.target.value)} />
                  </div>
                </div>
              )}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="label">청구금액 (원)</label>
                  <input type="number" className="input" value={form.claimAmount} onChange={(e) => update("claimAmount", e.target.value)} />
                </div>
                <div>
                  <label className="label">계약일자</label>
                  <input type="text" className="input" value={form.contractDate} onChange={(e) => update("contractDate", e.target.value)} placeholder="2025-01-15" />
                </div>
              </div>
              <div>
                <label className="label">비고</label>
                <textarea className="input" rows={2} value={form.notes} onChange={(e) => update("notes", e.target.value)} />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending} className="btn-primary flex-1">
                  {saveMutation.isPending ? "저장 중..." : editId ? "수정" : "추가"}
                </button>
                <button onClick={() => { setShowForm(false); setEditId(null); setForm(emptyForm); }} className="btn-secondary">취소</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 엑셀 일괄등록 모달 */}
      {showBulk && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-xl font-bold mb-4">엑셀 일괄등록</h2>
            <p className="text-sm text-gray-500 mb-2">
              엑셀에서 데이터를 복사하여 아래에 붙여넣기 하세요. 첫 행은 열 제목이어야 합니다.
            </p>
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 mb-3">
              <p className="font-semibold mb-1">지원하는 열 제목:</p>
              <p>이름(필수), 주소, 전화번호, 이메일, 청구금액, 계약일자, 동호수, 비고, 주민등록번호, 법인등록번호, 대표자명, 유형</p>
            </div>
            <textarea
              className="input font-mono text-xs min-h-[200px]"
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={"이름\t주소\t전화번호\t청구금액\t동호수\n홍길동\t서울시 강남구\t010-1234-5678\t50000000\t101동 1201호"}
            />
            <div className="flex gap-3 pt-4">
              <button onClick={handleBulkParse} disabled={bulkMutation.isPending || !bulkText.trim()} className="btn-primary flex-1">
                {bulkMutation.isPending ? "등록 중..." : "일괄 등록"}
              </button>
              <button onClick={() => { setShowBulk(false); setBulkText(""); }} className="btn-secondary">취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 소송서류 생성 모달 */}
      {showDocGen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-xl font-bold mb-4">소송서류 생성</h2>
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="label">서류 유형</label>
                <select className="input" value={genType} onChange={(e) => setGenType(e.target.value)}>
                  <option value="payment_order">지급명령 신청서</option>
                  <option value="complaint">소장</option>
                  <option value="seizure">가압류 신청서</option>
                </select>
              </div>
              <div>
                <label className="label">대상</label>
                <p className="text-sm text-gray-500 mt-2">
                  {selectedIds.length > 0 ? `선택된 ${selectedIds.length}명` : `전체 ${defs.length}명`}
                </p>
              </div>
            </div>

            <button
              onClick={() => genMutation.mutate({ documentType: genType, defendantIds: selectedIds.length > 0 ? selectedIds : undefined })}
              disabled={genMutation.isPending}
              className="btn-primary w-full mb-4"
            >
              {genMutation.isPending ? "생성 중..." : "서류 생성"}
            </button>

            {genResult && (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-green-600">{genResult.count}건 서류 생성 완료</p>
                <div className="max-h-[400px] overflow-y-auto space-y-2">
                  {genResult.documents.map((doc: any, i: number) => (
                    <div key={i} className="bg-gray-50 rounded-lg p-4 text-sm">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-bold">{doc.content.title} — {doc.defendantName}</h4>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                        <p>법원: {doc.content.courtName}</p>
                        <p>사건번호: {doc.content.caseNumber || "(미정)"}</p>
                        <p>원고: {doc.content.plaintiff}</p>
                        <p>피고: {doc.content.defendant.name}</p>
                        <p>주소: {doc.content.defendant.address || "-"}</p>
                        <p>청구금액: {(doc.content.claimAmount || 0).toLocaleString()}원</p>
                        {doc.content.defendant.unitNumber && <p>동호수: {doc.content.defendant.unitNumber}</p>}
                        {doc.content.contractDate && <p>계약일: {doc.content.contractDate}</p>}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400">
                  DocuRepeat 연동: 위 데이터를 기반으로 템플릿 문서를 생성하려면{" "}
                  <a href="https://docurepeat.com" target="_blank" rel="noopener noreferrer" className="text-primary-500 hover:underline">DocuRepeat</a>을 이용하세요.
                </p>
              </div>
            )}

            <div className="flex justify-end pt-4">
              <button onClick={() => { setShowDocGen(false); setGenResult(null); }} className="btn-secondary">닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
