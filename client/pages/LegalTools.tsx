import { Link } from "react-router-dom";

const tools = [
  {
    title: "문서 자동화 (DocuRepeat)",
    desc: "Excel 데이터와 Word/HWP 템플릿을 결합하여 지급명령 신청서, 가압류 신청서 등 법률 문서를 대량 자동 생성합니다.",
    url: "https://docurepeat.com",
    color: "bg-blue-500",
    features: ["지급명령 신청서 자동 생성", "가압류 신청서 자동 생성", "소장 템플릿 병합", "Excel 데이터 일괄 처리"],
  },
  {
    title: "시가 조회 (Siga-Lookup)",
    desc: "시가표준액, 공시가격을 한 번에 조회합니다. 가압류 대상 부동산의 시가를 확인할 때 유용합니다.",
    url: "https://gongsi.estate",
    color: "bg-green-500",
    features: ["토지 공시지가", "공동주택 공시가격", "개별주택 공시가격", "주택외건물 시가표준액"],
  },
  {
    title: "판례 검색 (CaseScraper)",
    desc: "대법원 판례를 검색하여 유사 사건의 판결 내용을 확인합니다.",
    url: "https://day.lawyer/casecrab",
    color: "bg-purple-500",
    features: ["대법원 판례 검색", "키워드 검색", "사건 유형별 분류", "판결 원문 보기"],
  },
  {
    title: "사건 현황 조회",
    desc: "대한민국 법원의 사건 진행 현황을 조회합니다.",
    url: "https://day.lawyer/casecrab",
    color: "bg-orange-500",
    features: ["사건번호 조회", "진행 상태 확인", "기일 정보", "판결 결과"],
  },
];

export default function LegalTools() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">통합 법률 도구</h1>
      <p className="text-gray-500 mb-8">단체소송에 필요한 법률 도구를 한 곳에서 이용하세요.</p>

      <div className="grid md:grid-cols-2 gap-6 mb-12">
        {tools.map((tool) => (
          <a key={tool.title} href={tool.url} target="_blank" rel="noopener noreferrer"
            className="card hover:shadow-lg transition-all group">
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 ${tool.color} rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0`}>
                {tool.title[0]}
              </div>
              <div className="flex-1">
                <h2 className="font-bold text-lg group-hover:text-primary-500 transition-colors">{tool.title}</h2>
                <p className="text-sm text-gray-500 mt-1 mb-3">{tool.desc}</p>
                <ul className="space-y-1">
                  {tool.features.map((f) => (
                    <li key={f} className="text-xs text-gray-400 flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full bg-gray-300" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </a>
        ))}
      </div>

      {/* 지급명령 / 가압류 바로가기 */}
      <div className="card mb-8">
        <h2 className="font-bold text-lg mb-4">지급명령 · 가압류 신청</h2>
        <p className="text-sm text-gray-500 mb-4">참여 중인 사건에서 지급명령이나 가압류를 신청할 수 있습니다.</p>
        <div className="flex gap-3">
          <Link to="/my" className="btn-primary">내 사건에서 신청하기</Link>
        </div>
      </div>

      {/* 홍보 */}
      <div className="grid md:grid-cols-2 gap-6">
        <a href="https://day.lawyer" target="_blank" rel="noopener noreferrer" className="promo-banner hover:scale-[1.01] transition-transform">
          <h3 className="text-xl font-bold mb-2">데이로이어 (Day Lawyer)</h3>
          <p className="text-white/80 text-sm">월정액 법률 상담 서비스 — 전문 변호사와 바로 상담하세요</p>
          <span className="inline-block mt-3 text-sm bg-white/20 rounded-full px-4 py-1.5">day.lawyer →</span>
        </a>
        <a href="https://willsave.co.kr" target="_blank" rel="noopener noreferrer" className="promo-banner !from-purple-600 !to-purple-800 hover:scale-[1.01] transition-transform">
          <h3 className="text-xl font-bold mb-2">윌세이브 (WillSave)</h3>
          <p className="text-white/80 text-sm">유언장 작성·보관 서비스 — 법적으로 유효한 유언장</p>
          <span className="inline-block mt-3 text-sm bg-white/20 rounded-full px-4 py-1.5">willsave.co.kr →</span>
        </a>
      </div>
    </div>
  );
}
