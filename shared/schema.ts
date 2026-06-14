import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  json,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── 사용자 ───
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  role: varchar("role", { length: 20 }).notNull().default("member"), // member, admin
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── 단체소송 사건 ───
export const cases = pgTable("cases", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  summary: text("summary"), // 사건 요약 (목록 표시용)
  description: text("description"), // 상세 설명 (HTML/마크다운)
  caseType: varchar("case_type", { length: 100 }), // 손해배상, 부당이득반환 등
  defendant: varchar("defendant", { length: 500 }), // 피고
  status: varchar("status", { length: 50 }).notNull().default("recruiting"),
  // recruiting(모집중), filed(소제기), in_progress(진행중), settled(합의), closed(종결)
  retainerFee: integer("retainer_fee").notNull(), // 착수금 (원)
  targetCount: integer("target_count"), // 목표 인원
  currentCount: integer("current_count").notNull().default(0),
  filingDate: timestamp("filing_date"), // 소 제기일
  courtName: varchar("court_name", { length: 200 }), // 관할 법원
  caseNumber: varchar("case_number", { length: 100 }), // 사건번호 (2026가합12345)
  recruitStartDate: timestamp("recruit_start_date"),
  recruitEndDate: timestamp("recruit_end_date"),
  coverImage: varchar("cover_image", { length: 500 }),
  // 지급명령/가압류 관련
  supportsPaymentOrder: boolean("supports_payment_order").default(false), // 지급명령 가능 여부
  supportsProvisionalSeizure: boolean("supports_provisional_seizure").default(false), // 가압류 가능 여부
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── 사건 당사자 ───
export const caseParties = pgTable("case_parties", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull().references(() => cases.id),
  userId: integer("user_id").notNull().references(() => users.id),
  name: varchar("name", { length: 100 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 255 }),
  address: text("address"),
  residentNumber: varchar("resident_number", { length: 100 }), // 암호화 저장
  damageAmount: integer("damage_amount"), // 피해 금액
  damageDescription: text("damage_description"), // 피해 내용
  status: varchar("status", { length: 50 }).notNull().default("registered"),
  // registered → contracted → paid → verified
  contractAgreed: boolean("contract_agreed").notNull().default(false),
  contractAgreedAt: timestamp("contract_agreed_at"),
  signatureImage: text("signature_image"), // base64 서명 이미지
  paymentStatus: varchar("payment_status", { length: 50 }).notNull().default("pending"),
  // pending, completed, refunded
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── 증거 파일 ───
export const evidence = pgTable("evidence", {
  id: serial("id").primaryKey(),
  casePartyId: integer("case_party_id").notNull().references(() => caseParties.id),
  caseId: integer("case_id").notNull().references(() => cases.id),
  fileName: varchar("file_name", { length: 500 }).notNull(),
  filePath: varchar("file_path", { length: 1000 }).notNull(),
  fileType: varchar("file_type", { length: 100 }),
  fileSize: integer("file_size"),
  description: text("description"),
  category: varchar("category", { length: 50 }).default("other"),
  // contract(계약서), payment_proof(입금/결제), id_copy(신분증), kakao(카톡/문자),
  // photo(사진), recording(녹취), statement(진술/메모), other(기타)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── 결제 (NicePay) ───
export const paymentSessions = pgTable("payment_sessions", {
  id: serial("id").primaryKey(),
  orderId: varchar("order_id", { length: 100 }).notNull().unique(),
  casePartyId: integer("case_party_id").references(() => caseParties.id),
  caseId: integer("case_id").notNull().references(() => cases.id),
  userId: integer("user_id").notNull().references(() => users.id),
  amount: integer("amount").notNull(),
  ediDate: varchar("edi_date", { length: 20 }).notNull(),
  signData: varchar("sign_data", { length: 128 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  // pending, completed, failed, expired
  expiresAt: timestamp("expires_at").notNull(),
  paymentType: varchar("payment_type", { length: 30 }).notNull().default("retainer"),
  // retainer(착수금), payment_order(지급명령), seizure(가압류)
  metadata: text("metadata"), // JSON
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const paymentTransactions = pgTable("payment_transactions", {
  id: serial("id").primaryKey(),
  casePartyId: integer("case_party_id").references(() => caseParties.id),
  caseId: integer("case_id").notNull().references(() => cases.id),
  userId: integer("user_id").notNull().references(() => users.id),
  orderId: varchar("order_id", { length: 100 }).notNull(),
  tid: varchar("tid", { length: 100 }).unique(),
  amount: integer("amount").notNull(),
  resultCode: varchar("result_code", { length: 10 }),
  resultMsg: varchar("result_msg", { length: 255 }),
  authDate: varchar("auth_date", { length: 20 }),
  authCode: varchar("auth_code", { length: 50 }),
  cardCode: varchar("card_code", { length: 10 }),
  cardName: varchar("card_name", { length: 50 }),
  cardNum: varchar("card_num", { length: 30 }), // 마스킹
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  paymentType: varchar("payment_type", { length: 30 }).notNull().default("retainer"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── 빌링키 (성공보수 자동결제용, winslaw01m) ───
export const billingKeys = pgTable("billing_keys", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  casePartyId: integer("case_party_id").references(() => caseParties.id),
  caseId: integer("case_id").references(() => cases.id),
  bid: varchar("bid", { length: 100 }).notNull(), // NicePay 빌링키
  cardName: varchar("card_name", { length: 50 }),
  cardNum: varchar("card_num", { length: 30 }), // 마스킹
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── 결제 링크 (토큰 단축링크 — 로그인 없이 클릭 결제) ───
export const paymentLinks = pgTable("payment_links", {
  id: serial("id").primaryKey(),
  token: varchar("token", { length: 64 }).notNull().unique(), // randomBytes(24).base64url
  caseId: integer("case_id").notNull().references(() => cases.id),
  casePartyId: integer("case_party_id").references(() => caseParties.id),
  userId: integer("user_id").references(() => users.id), // 결제 귀속 사용자(당사자 계정)
  amount: integer("amount").notNull(),
  paymentType: varchar("payment_type", { length: 30 }).notNull().default("retainer"),
  goodsName: varchar("goods_name", { length: 200 }),
  status: varchar("status", { length: 20 }).notNull().default("active"), // active|used|cancelled|expired
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  lastSessionOrderId: varchar("last_session_order_id", { length: 100 }), // 최근 결제세션 orderId
  openCount: integer("open_count").notNull().default(0), // 열람 횟수(남용 신호)
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── 사건 경과 업데이트 ───
export const caseUpdates = pgTable("case_updates", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull().references(() => cases.id),
  title: varchar("title", { length: 500 }).notNull(),
  content: text("content").notNull(),
  updateType: varchar("update_type", { length: 50 }).notNull().default("notice"),
  // notice(공지), filing(소제기), hearing(기일), ruling(판결), settlement(합의), document(서류)
  isPublic: boolean("is_public").notNull().default(true),
  attachmentPath: varchar("attachment_path", { length: 1000 }),
  attachmentName: varchar("attachment_name", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── 지급명령 신청 ───
export const paymentOrders = pgTable("payment_orders", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull().references(() => cases.id),
  casePartyId: integer("case_party_id").notNull().references(() => caseParties.id),
  userId: integer("user_id").notNull().references(() => users.id),
  // 신청 정보
  creditorName: varchar("creditor_name", { length: 100 }).notNull(), // 채권자
  debtorName: varchar("debtor_name", { length: 100 }).notNull(), // 채무자
  claimAmount: integer("claim_amount").notNull(), // 청구금액
  claimReason: text("claim_reason").notNull(), // 청구원인
  courtName: varchar("court_name", { length: 200 }), // 관할법원
  status: varchar("status", { length: 50 }).notNull().default("draft"),
  // draft, submitted, accepted, rejected, enforced
  documentPath: varchar("document_path", { length: 1000 }), // 생성된 문서 경로
  submittedAt: timestamp("submitted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── 가압류 신청 ───
export const provisionalSeizures = pgTable("provisional_seizures", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull().references(() => cases.id),
  casePartyId: integer("case_party_id").notNull().references(() => caseParties.id),
  userId: integer("user_id").notNull().references(() => users.id),
  // 신청 정보
  creditorName: varchar("creditor_name", { length: 100 }).notNull(),
  debtorName: varchar("debtor_name", { length: 100 }).notNull(),
  seizureAmount: integer("seizure_amount").notNull(), // 가압류 금액
  seizureReason: text("seizure_reason").notNull(), // 가압류 사유
  propertyType: varchar("property_type", { length: 50 }), // real_estate, bank_account, vehicle
  propertyDetail: text("property_detail"), // 대상 재산 상세
  propertyValue: integer("property_value"), // 시가 (siga-lookup 연동)
  courtName: varchar("court_name", { length: 200 }),
  status: varchar("status", { length: 50 }).notNull().default("draft"),
  // draft, submitted, accepted, rejected, released
  documentPath: varchar("document_path", { length: 1000 }),
  submittedAt: timestamp("submitted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── 상대방 (피고/채무자) ───
export const defendants = pgTable("defendants", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull().references(() => cases.id),
  name: varchar("name", { length: 200 }).notNull(),
  partyType: varchar("party_type", { length: 20 }).notNull().default("individual"),
  // individual(개인), company(법인)
  residentNumber: varchar("resident_number", { length: 100 }), // 암호화 저장 (주민등록번호/사업자등록번호)
  companyRegNumber: varchar("company_reg_number", { length: 50 }), // 법인등록번호
  representativeName: varchar("representative_name", { length: 100 }), // 대표자명
  address: text("address"),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 255 }),
  claimAmount: integer("claim_amount"), // 청구금액
  contractDate: varchar("contract_date", { length: 20 }), // 계약일자
  unitNumber: varchar("unit_number", { length: 100 }), // 호수/동호수 (분양 사건용)
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── 상대방 첨부자료 ───
export const defendantDocuments = pgTable("defendant_documents", {
  id: serial("id").primaryKey(),
  defendantId: integer("defendant_id").notNull().references(() => defendants.id, { onDelete: "cascade" }),
  caseId: integer("case_id").notNull().references(() => cases.id),
  fileName: varchar("file_name", { length: 500 }).notNull(),
  filePath: varchar("file_path", { length: 1000 }).notNull(),
  fileType: varchar("file_type", { length: 100 }),
  fileSize: integer("file_size"),
  documentType: varchar("document_type", { length: 50 }).notNull().default("other"),
  // contract(계약서), registry(등기부등본), resident_cert(주민등록등본), id_copy(신분증사본),
  // payment_proof(입금증명), demand_letter(내용증명), other(기타)
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── 개인정보 처리 동의 ───
export const consents = pgTable("consents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  consentType: varchar("consent_type", { length: 50 }).notNull(),
  // privacy_policy, pii_collection, third_party_sharing, marketing
  version: varchar("version", { length: 20 }).notNull().default("1.0"),
  agreed: boolean("agreed").notNull().default(true),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── 감사 로그 (PII 접근 기록) ───
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  action: varchar("action", { length: 50 }).notNull(),
  // view_parties, view_defendants, export_data, delete_data, view_evidence
  tableName: varchar("table_name", { length: 50 }),
  recordId: integer("record_id"),
  details: text("details"),
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── 알림 발송 로그 (SMS/이메일/알림톡 — 감사·멱등) ───
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  channel: varchar("channel", { length: 20 }).notNull(), // sms | email | alimtalk
  recipient: varchar("recipient", { length: 255 }).notNull(), // 전화(숫자) 또는 이메일
  templateKey: varchar("template_key", { length: 60 }).notNull(), // case_filing | payment_link 등
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending|sent|failed|skipped
  providerMsgId: varchar("provider_msg_id", { length: 100 }), // Aligo msg_id / SES messageId
  error: text("error"),
  caseId: integer("case_id"),
  casePartyId: integer("case_party_id"),
  caseUpdateId: integer("case_update_id"), // ⑥ 소송경과 트리거
  paymentLinkId: integer("payment_link_id"), // ⑤ 결제링크 트리거
  dedupeKey: varchar("dedupe_key", { length: 160 }), // 멱등 키(중복 발송 방지)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── 사건 요청 (제보 — "이런 피해가 있다, 사건을 열어달라") ───
export const caseRequests = pgTable("case_requests", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(), // 요청자 이름
  phone: varchar("phone", { length: 20 }).notNull(), // 연락처
  email: varchar("email", { length: 255 }), // 이메일(선택)
  category: varchar("category", { length: 100 }), // 피해 유형(분양/투자/소비자/임금/전세 등)
  title: varchar("title", { length: 500 }).notNull(), // 한 줄 요약
  opponent: varchar("opponent", { length: 500 }), // 가해자/상대방(회사·개인)
  content: text("content").notNull(), // 피해 내용 상세
  headcount: varchar("headcount", { length: 100 }), // 예상 피해자 규모(대략)
  damageScale: varchar("damage_scale", { length: 100 }), // 예상 피해 금액(대략)
  status: varchar("status", { length: 30 }).notNull().default("new"),
  // new(접수) → reviewing(검토중) → accepted(채택·개설예정) → declined(반려) → converted(사건개설완료)
  adminNote: text("admin_note"), // 내부 메모
  userId: integer("user_id"), // 로그인 상태로 제출 시(선택)
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── 세션 (express-session) ───
export const sessions = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
});

// ─── Relations ───
export const usersRelations = relations(users, ({ many }) => ({
  caseParties: many(caseParties),
}));

export const casesRelations = relations(cases, ({ many }) => ({
  parties: many(caseParties),
  updates: many(caseUpdates),
  evidence: many(evidence),
  paymentOrders: many(paymentOrders),
  provisionalSeizures: many(provisionalSeizures),
  defendants: many(defendants),
}));

export const casePartiesRelations = relations(caseParties, ({ one, many }) => ({
  case: one(cases, { fields: [caseParties.caseId], references: [cases.id] }),
  user: one(users, { fields: [caseParties.userId], references: [users.id] }),
  evidence: many(evidence),
}));

export const evidenceRelations = relations(evidence, ({ one }) => ({
  caseParty: one(caseParties, { fields: [evidence.casePartyId], references: [caseParties.id] }),
  case: one(cases, { fields: [evidence.caseId], references: [cases.id] }),
}));

export const caseUpdatesRelations = relations(caseUpdates, ({ one }) => ({
  case: one(cases, { fields: [caseUpdates.caseId], references: [cases.id] }),
}));

export const defendantsRelations = relations(defendants, ({ one, many }) => ({
  case: one(cases, { fields: [defendants.caseId], references: [cases.id] }),
  documents: many(defendantDocuments),
}));

export const defendantDocumentsRelations = relations(defendantDocuments, ({ one }) => ({
  defendant: one(defendants, { fields: [defendantDocuments.defendantId], references: [defendants.id] }),
  case: one(cases, { fields: [defendantDocuments.caseId], references: [cases.id] }),
}));

// ─── Types ───
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Case = typeof cases.$inferSelect;
export type InsertCase = typeof cases.$inferInsert;
export type CaseParty = typeof caseParties.$inferSelect;
export type InsertCaseParty = typeof caseParties.$inferInsert;
export type Evidence = typeof evidence.$inferSelect;
export type CaseUpdate = typeof caseUpdates.$inferSelect;
export type PaymentSession = typeof paymentSessions.$inferSelect;
export type PaymentTransaction = typeof paymentTransactions.$inferSelect;
export type PaymentOrder = typeof paymentOrders.$inferSelect;
export type ProvisionalSeizure = typeof provisionalSeizures.$inferSelect;
export type Defendant = typeof defendants.$inferSelect;
export type InsertDefendant = typeof defendants.$inferInsert;
export type DefendantDocument = typeof defendantDocuments.$inferSelect;
export type Consent = typeof consents.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type PaymentLink = typeof paymentLinks.$inferSelect;
export type CaseRequest = typeof caseRequests.$inferSelect;
export type InsertCaseRequest = typeof caseRequests.$inferInsert;
