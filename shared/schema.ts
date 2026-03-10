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
