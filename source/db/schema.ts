import {sqliteTable,text,integer,index,uniqueIndex} from 'drizzle-orm/sqlite-core';
export const applications=sqliteTable('applications',{
 id:text('id').primaryKey(), owner:text('owner').notNull(), source:text('source').notNull(),sourceKey:text('source_key'),
 data:text('data').notNull(),status:text('status').notNull().default('draft'),jobType:text('job_type').notNull().default('extract'),step:text('step').notNull().default('upload'),
 note:text('note').notNull().default(''),passportKey:text('passport_key'),portraitKey:text('portrait_key'),
 applicationNumber:text('application_number'),officialUrl:text('official_url'),paymentUrl:text('payment_url'),lease:text('lease'),leaseUntil:integer('lease_until'),
 createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),version:integer('version').notNull().default(1)
},t=>[index('idx_applications_owner_status').on(t.owner,t.status,t.createdAt),uniqueIndex('idx_applications_source_key').on(t.owner,t.sourceKey)]);
export const settings=sqliteTable('settings',{owner:text('owner').primaryKey(),runnerHash:text('runner_hash'),heartbeat:integer('heartbeat'),connections:text('connections').notNull().default('{}'),tripDefaults:text('trip_defaults').notNull().default('{}'),telegramBotId:text('telegram_bot_id'),telegramBotUsername:text('telegram_bot_username'),telegramOperatorId:text('telegram_operator_id')},t=>[uniqueIndex('idx_settings_telegram_operator').on(t.telegramBotId,t.telegramOperatorId)]);
export const events=sqliteTable('events',{id:text('id').primaryKey(),owner:text('owner').notNull(),applicationId:text('application_id').notNull(),message:text('message').notNull(),createdAt:integer('created_at').notNull()},t=>[index('idx_events_application').on(t.owner,t.applicationId,t.createdAt)]);

export const telegramSessions=sqliteTable('telegram_sessions',{tokenHash:text('token_hash').primaryKey(),owner:text('owner').notNull(),telegramUserId:text('telegram_user_id').notNull(),expiresAt:integer('expires_at').notNull()},t=>[index('idx_telegram_sessions_expiry').on(t.expiresAt)]);
