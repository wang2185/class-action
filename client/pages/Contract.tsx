import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "../lib/queryClient";
import { useState, useRef, useEffect } from "react";
import SignaturePad from "signature_pad";

export default function Contract() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sigPadRef = useRef<SignaturePad | null>(null);

  const { data: caseData } = useQuery({ queryKey: ["case", id], queryFn: () => apiRequest(`/api/cases/${id}`) });
  const { data: myParty } = useQuery({ queryKey: ["myParty", id], queryFn: () => apiRequest(`/api/cases/${id}/my-party`) });

  useEffect(() => {
    if (canvasRef.current && !sigPadRef.current) {
      const canvas = canvasRef.current;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);
      sigPadRef.current = new SignaturePad(canvas, { penColor: "#1a1a2e" });
    }
  }, []);

  const contractMutation = useMutation({
    mutationFn: (data: any) => apiRequest(`/api/cases/${id}/contract`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myParty", id] });
      queryClient.invalidateQueries({ queryKey: ["myCases"] });
      navigate(`/cases/${id}/payment`);
    },
    onError: (err: any) => setError(err.message),
  });

  const handleSubmit = () => {
    if (!agreed) { setError("수임계약 내용에 동의해주세요."); return; }
    if (!sigPadRef.current || sigPadRef.current.isEmpty()) { setError("서명을 해주세요."); return; }
    const signatureImage = sigPadRef.current.toDataURL("image/png");
    contractMutation.mutate({ agreed: true, signatureImage });
  };

  if (myParty?.contractAgreed) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center">
        <div className="card py-12">
          <h1 className="text-2xl font-bold text-green-600 mb-3">수임계약 체결 완료</h1>
          <p className="text-gray-500 mb-6">이미 수임계약이 체결되었습니다.</p>
          <button onClick={() => navigate(`/cases/${id}/payment`)} className="btn-primary">착수금 결제하기</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">사건 수임계약</h1>
      {caseData && <p className="text-gray-500 mb-6">{caseData.title}</p>}

      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">{error}</div>}

      <div className="card space-y-6">
        {/* 계약 내용 */}
        <div className="bg-gray-50 rounded-lg p-6 max-h-96 overflow-y-auto text-sm leading-relaxed">
          <h2 className="font-bold text-lg mb-4 text-center">사건 수임 계약서</h2>

          <p className="mb-3">의뢰인(이하 "갑")과 법무법인 윈스(이하 "을")는 다음과 같이 사건 수임 계약을 체결한다.</p>

          <h3 className="font-bold mt-4 mb-2">제1조 (수임사건)</h3>
          <p>을은 갑으로부터 아래 사건의 소송대리를 수임한다.</p>
          <p className="ml-4 mt-1">- 사건명: {caseData?.title || "(사건명)"}</p>
          <p className="ml-4">- 피고: {caseData?.defendant || "(피고)"}</p>
          <p className="ml-4">- 관할법원: {caseData?.courtName || "(관할법원)"}</p>

          <h3 className="font-bold mt-4 mb-2">제2조 (착수금)</h3>
          <p>갑은 을에게 착수금으로 금 {(caseData?.retainerFee || 0).toLocaleString()}원을 지급한다.</p>

          <h3 className="font-bold mt-4 mb-2">제3조 (성공보수)</h3>
          <p>소송 결과에 따라 별도 합의에 의한 성공보수를 지급할 수 있으며, 자동결제 등록 시 합의된 금액이 자동 결제된다.</p>

          <h3 className="font-bold mt-4 mb-2">제4조 (의무)</h3>
          <p>1. 을은 수임사건에 대하여 성실히 직무를 수행한다.</p>
          <p>2. 갑은 수임사건에 관련된 자료를 성실히 제공한다.</p>
          <p>3. 을은 사건의 경과를 갑에게 수시로 통보한다.</p>

          <h3 className="font-bold mt-4 mb-2">제5조 (해지)</h3>
          <p>본 계약은 쌍방 합의에 의하여 해지할 수 있으며, 이 경우 착수금의 반환 여부는 사건 진행 정도에 따라 정한다.</p>

          <h3 className="font-bold mt-4 mb-2">제6조 (개인정보)</h3>
          <p>을은 갑의 개인정보를 수임사건 처리 목적으로만 사용하며, 관련 법률에 따라 보호한다.</p>
        </div>

        {/* 동의 체크 */}
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1 w-5 h-5 text-primary-500 rounded focus:ring-primary-500" />
          <span className="text-sm">
            상기 수임계약 내용을 모두 확인하였으며, 이에 동의합니다.
          </span>
        </label>

        {/* 서명 패드 */}
        <div>
          <label className="label">서명</label>
          <div className="border-2 border-dashed border-gray-300 rounded-lg overflow-hidden bg-white">
            <canvas ref={canvasRef} className="w-full" style={{ height: 200 }} />
          </div>
          <div className="flex justify-end mt-2">
            <button
              type="button"
              onClick={() => sigPadRef.current?.clear()}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              서명 지우기
            </button>
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!agreed || contractMutation.isPending}
          className="btn-primary w-full"
        >
          {contractMutation.isPending ? "처리 중..." : "수임계약 체결"}
        </button>
      </div>
    </div>
  );
}
