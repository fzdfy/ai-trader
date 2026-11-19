import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  dataIncident,
  dataIncidentEvent,
} from "../../db/schema";

export type OpenIncidentInput = {
  assetKey: string | null;
  incidentType: string;
  severity: "warning" | "critical";
  title: string;
  description: string;
  payloadJson: Record<string, unknown>;
};

export type IncidentTransition = {
  action: "acknowledge" | "start_resolving" | "resolve" | "close";
  actorUserId?: string | null;
  message?: string | null;
  rootCause?: string | null;
};

type IncidentRow = typeof dataIncident.$inferSelect;
type IncidentEventRow = typeof dataIncidentEvent.$inferSelect;

const TRANSITIONS = {
  acknowledge: {
    from: ["open"],
    to: "acknowledged",
    eventType: "acknowledged",
  },
  start_resolving: {
    from: ["open", "acknowledged"],
    to: "resolving",
    eventType: "resolving",
  },
  resolve: {
    from: ["open", "acknowledged", "resolving"],
    to: "resolved",
    eventType: "resolved",
  },
  close: {
    from: ["resolved"],
    to: "closed",
    eventType: "closed",
  },
} as const;

export async function openIncident(input: OpenIncidentInput): Promise<number> {
  return db.transaction(async (tx) => {
    const [incident] = await tx
      .insert(dataIncident)
      .values({
        ...input,
        status: "open",
      })
      .returning({ id: dataIncident.id });
    if (!incident) throw new Error("创建数据事故失败");
    await tx.insert(dataIncidentEvent).values({
      incidentId: incident.id,
      eventType: "opened",
      payloadJson: {},
    });
    return incident.id;
  });
}

export async function openOrUpdateQualityIncident(input: {
  assetKey: string;
  title: string;
  description: string;
  payloadJson: Record<string, unknown>;
}): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`quality:${input.assetKey}`}))`,
    );
    const [existing] = await tx
      .select({ id: dataIncident.id })
      .from(dataIncident)
      .where(
        and(
          eq(dataIncident.assetKey, input.assetKey),
          eq(dataIncident.incidentType, "quality"),
          inArray(dataIncident.status, [
            "open",
            "acknowledged",
            "resolving",
          ]),
        ),
      )
      .orderBy(asc(dataIncident.id))
      .limit(1);
    if (existing) {
      await tx
        .update(dataIncident)
        .set({
          severity: "critical",
          title: input.title,
          description: input.description,
          payloadJson: input.payloadJson,
        })
        .where(eq(dataIncident.id, existing.id));
      await tx.insert(dataIncidentEvent).values({
        incidentId: existing.id,
        eventType: "recurred",
        payloadJson: input.payloadJson,
      });
      return existing.id;
    }
    const [incident] = await tx
      .insert(dataIncident)
      .values({
        assetKey: input.assetKey,
        incidentType: "quality",
        severity: "critical",
        status: "open",
        title: input.title,
        description: input.description,
        payloadJson: input.payloadJson,
      })
      .returning({ id: dataIncident.id });
    if (!incident) throw new Error("创建数据质量事故失败");
    await tx.insert(dataIncidentEvent).values({
      incidentId: incident.id,
      eventType: "opened",
      payloadJson: input.payloadJson,
    });
    return incident.id;
  });
}

export async function transitionIncident(
  id: number,
  transition: IncidentTransition,
): Promise<void> {
  const rule = TRANSITIONS[transition.action];
  if (transition.action === "resolve" && !transition.message?.trim()) {
    throw new Error("incident resolution message is required");
  }
  await db.transaction(async (tx) => {
    const [incident] = await tx
      .select()
      .from(dataIncident)
      .where(eq(dataIncident.id, id))
      .limit(1);
    if (!incident) throw new Error("incident not found");
    if (!rule.from.some((status) => status === incident.status)) {
      throw new Error(
        `invalid transition: ${transition.action} from ${incident.status}`,
      );
    }
    await tx
      .update(dataIncident)
      .set({
        status: rule.to,
        ...(transition.action === "acknowledge"
          ? { acknowledgedAt: new Date() }
          : {}),
        ...(transition.action === "resolve"
          ? {
              resolvedAt: new Date(),
              rootCause: transition.rootCause ?? incident.rootCause,
            }
          : {}),
      })
      .where(eq(dataIncident.id, id));
    await tx.insert(dataIncidentEvent).values({
      incidentId: id,
      actorUserId: transition.actorUserId ?? null,
      eventType: rule.eventType,
      message: transition.message ?? null,
      payloadJson: {},
    });
  });
}

export async function getIncident(id: number): Promise<IncidentRow | null> {
  const [incident] = await db
    .select()
    .from(dataIncident)
    .where(eq(dataIncident.id, id))
    .limit(1);
  return incident ?? null;
}

export async function listIncidentEvents(
  id: number,
): Promise<IncidentEventRow[]> {
  return db
    .select()
    .from(dataIncidentEvent)
    .where(eq(dataIncidentEvent.incidentId, id))
    .orderBy(asc(dataIncidentEvent.id));
}
