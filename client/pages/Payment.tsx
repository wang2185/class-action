import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { useState } from "react";

export default function Payment() {
  const { id } = useParams();
  const [error, setError] = useState("");

  const { data: caseData } = useQuery({ queryKey: ["case", id], queryFn: () => apiRequest(`/api/cases/${id}`) });
  const { data: myParty } = useQuery({ queryKey: ["myParty", id], queryFn: () => apiRequest(`/api/cases/${id}/my-party`) });

  const initPayment = useMutation({
    mutationFn: () => apiRequest("/api/nicepay/init-payment", {
      method: "POST",
      body: JSON.stringify({ caseId: parseInt(id!) }),
    }),
    onSuccess: (data) => {
      // NicePay 호스팅 결제 페이지로 리다이렉트
      window.location.href = `/api/nicepay/redirect/${data.orderId}`;
    },
    onError: (err: any) => setError(err.message),
  });

  if (myParty?.paymentStatus === "completed") {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center">
        <div className="card py-12">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-green-600 mb-3">결제 완료</h1>
          <p className="text-gray-500">착수금 결제가 이미 완료되었습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">착수금 결제</h1>
      {caseData && <p className="text-gray-500 mb-6">{caseData.title}</p>}

      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">{error}</div>}

      <div className="card">
        <h2 className="font-bold text-lg mb-4">결제 정보</h2>

        <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">사건명</span>
            <span className="font-medium">{caseData?.title}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">당사자</span>
            <span className="font-medium">{myParty?.name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">결제 방식</span>
            <span className="font-medium">일반결제 (카드)</span>
          </div>
          <div className="border-t my-2" />
          <div className="flex justify-between">
            <span className="font-bold">결제 금액</span>
            <span className="font-bold text-xl text-primary-500">{(caseData?.retainerFee || 0).toLocaleString()}원</span>
          </div>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-6 text-sm text-yellow-800">
          <p className="font-semibold mb-1">환불 안내</p>
          <p>착수금은 소송 제기 전까지 전액 환불이 가능합니다. 소송 제기 후에는 사건 진행 정도에 따라 환불 금액이 결정됩니다.</p>
        </div>

        {!myParty?.contractAgreed ? (
          <div className="text-center py-4">
            <p className="text-gray-500 mb-3">수임계약을 먼저 체결해주세요.</p>
            <a href={`/cases/${id}/contract`} className="btn-primary">수임계약 체결하기</a>
          </div>
        ) : (
          <button
            onClick={() => initPayment.mutate()}
            disabled={initPayment.isPending}
            className="btn-primary w-full text-lg py-3"
          >
            {initPayment.isPending ? "결제 준비 중..." : `${(caseData?.retainerFee || 0).toLocaleString()}원 결제하기`}
          </button>
        )}
      </div>
    </div>
  );
}
