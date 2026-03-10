import { Link, useSearchParams } from "react-router-dom";

export default function PaymentResult({ type }: { type: "success" | "fail" }) {
  const [params] = useSearchParams();
  const orderId = params.get("orderId");
  const msg = params.get("msg");

  return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center">
      <div className="card py-12">
        {type === "success" ? (
          <>
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-green-600 mb-3">결제가 완료되었습니다</h1>
            <p className="text-gray-500 mb-2">착수금 결제가 정상적으로 처리되었습니다.</p>
            {orderId && <p className="text-xs text-gray-400">주문번호: {orderId}</p>}
          </>
        ) : (
          <>
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-red-600 mb-3">결제 실패</h1>
            <p className="text-gray-500 mb-2">{msg || "결제 처리 중 오류가 발생했습니다."}</p>
          </>
        )}

        <div className="flex justify-center gap-3 mt-8">
          <Link to="/my" className="btn-primary">내 사건 목록</Link>
          <Link to="/cases" className="btn-secondary">사건 목록</Link>
        </div>
      </div>
    </div>
  );
}
