import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";

const STATUS_LABELS: Record<string, string> = {
  recruiting: "모집중", filed: "소 제기", in_progress: "진행중",
  settled: "합의", closed: "종결",
};

export default function Landing() {
  const { data: cases } = useQuery({
    queryKey: ["cases"],
    queryFn: () => apiRequest("/api/cases"),
  });

  const activeCases = cases?.filter((c: any) => c.status === "recruiting") || [];

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-primary-500 via-primary-600 to-primary-800 text-white">
        <div className="max-w-7xl mx-auto px-4 py-20 md:py-28">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-extrabold leading-tight mb-6">
              함께하면 강해지는<br />
              <span className="text-accent-500">단체소송</span> 플랫폼
            </h1>
            <p className="text-lg md:text-xl text-white/80 mb-8 leading-relaxed">
              법무법인 윈스가 운영하는 단체소송 플랫폼입니다.<br />
              당사자 모집부터 증거 수집, 수임계약, 소송 진행 현황까지<br />
              원스톱으로 관리합니다.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link to="/cases" className="btn-accent text-base px-8 py-3">진행 중인 사건 보기</Link>
              <Link to="/register" className="btn bg-white/10 text-white hover:bg-white/20 text-base px-8 py-3 border border-white/30">회원가입</Link>
            </div>
          </div>
        </div>
      </section>

      {/* 절차 안내 */}
      <section className="max-w-7xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold text-center mb-12">참여 절차</h2>
        <div className="grid md:grid-cols-5 gap-6">
          {[
            { step: "01", title: "사건 확인", desc: "진행 중인 단체소송 확인" },
            { step: "02", title: "참여 신청", desc: "당사자 정보 및 증거 제출" },
            { step: "03", title: "수임계약", desc: "전자서명으로 간편 체결" },
            { step: "04", title: "착수금 결제", desc: "안전한 온라인 결제" },
            { step: "05", title: "경과 확인", desc: "실시간 소송 진행 확인" },
          ].map((item) => (
            <div key={item.step} className="card text-center relative">
              <div className="w-10 h-10 bg-primary-500 text-white rounded-full flex items-center justify-center text-sm font-bold mx-auto mb-3">
                {item.step}
              </div>
              <h3 className="font-bold mb-1">{item.title}</h3>
              <p className="text-sm text-gray-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 모집 중인 사건 */}
      {activeCases.length > 0 && (
        <section className="bg-gray-50 py-16">
          <div className="max-w-7xl mx-auto px-4">
            <h2 className="text-2xl font-bold mb-8">현재 모집 중인 사건</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeCases.slice(0, 6).map((c: any) => (
                <Link key={c.id} to={`/cases/${c.id}`} className="card hover:shadow-md transition-shadow">
                  <span className="badge-recruiting mb-3">{STATUS_LABELS[c.status]}</span>
                  <h3 className="font-bold text-lg mb-2 line-clamp-2">{c.title}</h3>
                  <p className="text-sm text-gray-500 mb-3 line-clamp-2">{c.summary}</p>
                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <span>피고: {c.defendant}</span>
                    <span className="font-semibold text-primary-500">
                      {c.currentCount}{c.targetCount ? `/${c.targetCount}` : ""}명
                    </span>
                  </div>
                  <div className="mt-2 text-sm font-medium text-primary-500">
                    착수금: {(c.retainerFee || 0).toLocaleString()}원
                  </div>
                </Link>
              ))}
            </div>
            <div className="text-center mt-8">
              <Link to="/cases" className="btn-primary">전체 사건 보기</Link>
            </div>
          </div>
        </section>
      )}

      {/* 법률 도구 + 홍보 */}
      <section className="max-w-7xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold mb-8">통합 법률 도구</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { title: "문서 자동화", desc: "지급명령·가압류 신청서 자동 생성", url: "https://docurepeat.com", color: "bg-blue-500" },
            { title: "시가 조회", desc: "시가표준액·공시가격 조회", url: "https://gongsi.estate", color: "bg-green-500" },
            { title: "판례 검색", desc: "대법원 판례 검색", url: "https://day.lawyer/casecrab", color: "bg-purple-500" },
            { title: "사건 현황", desc: "내 사건 진행 현황 조회", url: "/my", color: "bg-orange-500", internal: true },
          ].map((tool) => (
            tool.internal ? (
              <Link key={tool.title} to={tool.url} className="card hover:shadow-md transition-shadow">
                <div className={`w-10 h-10 ${tool.color} rounded-lg flex items-center justify-center text-white font-bold text-sm mb-3`}>
                  {tool.title[0]}
                </div>
                <h3 className="font-bold mb-1">{tool.title}</h3>
                <p className="text-sm text-gray-500">{tool.desc}</p>
              </Link>
            ) : (
              <a key={tool.title} href={tool.url} target="_blank" rel="noopener noreferrer" className="card hover:shadow-md transition-shadow">
                <div className={`w-10 h-10 ${tool.color} rounded-lg flex items-center justify-center text-white font-bold text-sm mb-3`}>
                  {tool.title[0]}
                </div>
                <h3 className="font-bold mb-1">{tool.title}</h3>
                <p className="text-sm text-gray-500">{tool.desc}</p>
              </a>
            )
          ))}
        </div>
      </section>

      {/* Day Lawyer / WillSave 홍보 */}
      <section className="bg-primary-50 py-16">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-center mb-8">법무법인 윈스의 다른 서비스</h2>
          <div className="grid md:grid-cols-2 gap-8">
            <a href="https://day.lawyer" target="_blank" rel="noopener noreferrer" className="promo-banner flex items-center gap-6 hover:scale-[1.02] transition-transform">
              <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
                <span className="text-3xl font-extrabold">D</span>
              </div>
              <div>
                <h3 className="text-xl font-bold mb-1">데이로이어 (Day Lawyer)</h3>
                <p className="text-white/80">월 정액 법률 상담 구독 — 방문·전화·이메일 상담을 합리적 가격으로 이용하세요.</p>
                <span className="inline-block mt-2 text-sm bg-white/20 rounded-full px-3 py-1">day.lawyer 방문하기 →</span>
              </div>
            </a>
            <a href="https://willsave.co.kr" target="_blank" rel="noopener noreferrer" className="promo-banner !from-purple-600 !to-purple-800 flex items-center gap-6 hover:scale-[1.02] transition-transform">
              <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
                <span className="text-3xl font-extrabold">W</span>
              </div>
              <div>
                <h3 className="text-xl font-bold mb-1">윌세이브 (WillSave)</h3>
                <p className="text-white/80">유언장 작성·보관 서비스 — 소중한 뜻을 법적으로 유효하게 남기세요.</p>
                <span className="inline-block mt-2 text-sm bg-white/20 rounded-full px-3 py-1">willsave.co.kr 방문하기 →</span>
              </div>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
