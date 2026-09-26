// Column helpers shared by every schema file. Column names come from the TypeScript keys through
// drizzle's snake_case casing, so `orgId` is stored as `org_id`.

import { bigint, integer, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Surrogate primary key. Tenant rows that need time order (runs, events) get their id from the caller. */
export const pk = () => uuid().primaryKey().defaultRandom();

/** timestamptz. Drizzle hands back a Date; stores map it to an ISO string. */
export const ts = () => timestamp({ withTimezone: true, mode: "date" });

/** timestamptz not null default now(). */
export const createdAt = () => ts().notNull().defaultNow();

/** Money as integer micro-USD (bigint, read back as a JS number). Never a float. */
export const microUsd = () => bigint({ mode: "number" });

/** Token counts and other non-negative integers. */
export const count = () => integer();

/** Text column typed to a closed union. The union lives in @sysone/core; the column stays text. */
export const textEnum = <const T extends readonly [string, ...string[]]>(values: T) => text({ enum: values });

/** jsonb typed to a TypeScript shape. */
export const json = <T>() => jsonb().$type<T>();

/** text[] not null default '{}'. */
export const textArray = () => text().array().notNull().default([]);

/** uuid[] that may be null (null = every set). */
export const uuidArray = () => uuid().array();
