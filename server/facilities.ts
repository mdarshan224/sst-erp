import { z } from "zod";
import { FacilityCharge, nextMonth } from "../lib/facilities";
import { safeMoney } from "../lib/money";
import { dateField } from "./catalog";
import {
  all,
  batch,
  insert,
  now,
  one,
  Row,
  stamps,
  stmt,
  today,
  uuid,
} from "./db";
import { Actor, ApiError, audit, own, permit } from "./security";
const name = z.string().trim().min(1).max(100),
  id = z.string().uuid(),
  amount = z.number().int().min(0).max(10000000000);
const schemas = {
  vehicles: z.object({
    registration: name,
    driver_name: name,
    driver_mobile: z.string().regex(/^[6-9]\d{9}$/),
    capacity: z.number().int().min(1).max(100),
  }),
  routes: z.object({ name, vehicle_id: id }),
  stops: z.object({
    name,
    route_id: id,
    distance_km: z.number().int().min(0).max(500),
    monthly_paise: amount.refine((v) => v > 0),
    component_id: id,
  }),
  blocks: z.object({ name }),
  rooms: z
    .object({
      name,
      block_id: id,
      capacity: z.number().int().min(1).max(100),
      boarding_paise: amount,
      mess_paise: amount,
      boarding_component_id: id,
      mess_component_id: id,
    })
    .refine(
      (d) => d.boarding_paise + d.mess_paise > 0,
      "Enter a boarding or mess fee.",
    ),
};
const tables = {
  vehicles: "transport_vehicles",
  routes: "transport_routes",
  stops: "transport_stops",
  blocks: "hostel_blocks",
  rooms: "hostel_rooms",
} as const;
export async function facilitySetup(actor: Actor, p: URLSearchParams) {
  permit(actor, "facilities.view");
  // Each catalogue is independently paginated; allocation and student databases are never sent wholesale.
  const kind = p.get("catalog"),
    page = Math.max(1, Math.trunc(Number(p.get("page")) || 1));
  if (kind && kind in tables) {
    const table = tables[kind as keyof typeof tables];
    return {
      rows: await all(
        `SELECT * FROM ${table} WHERE institution_id=? ORDER BY created_at DESC LIMIT 50 OFFSET ?`,
        [actor.institutionId, (page - 1) * 50],
      ),
      total: (await one(
        `SELECT COUNT(*) n FROM ${table} WHERE institution_id=?`,
        [actor.institutionId],
      ))!.n,
      page,
    };
  }
  const year = p.get("year") || "";
  await own(actor, "academic_years", year);
  const k = p.get("kind") === "Hostel" ? "Hostel" : "Transport";
  return {
    rows: await all(
      "SELECT a.*,s.name student_name,s.admission_number,t.name stop_name,r.name room_name,b.name block_name FROM facility_allocations a JOIN students s ON s.id=a.student_id AND s.institution_id=a.institution_id LEFT JOIN transport_stops t ON t.id=a.stop_id AND t.institution_id=a.institution_id LEFT JOIN hostel_rooms r ON r.id=a.room_id AND r.institution_id=a.institution_id LEFT JOIN hostel_blocks b ON b.id=r.block_id WHERE a.institution_id=? AND a.academic_year_id=? AND a.kind=? ORDER BY a.created_at DESC LIMIT 50 OFFSET ?",
      [actor.institutionId, year, k, (page - 1) * 50],
    ),
    total: (await one(
      "SELECT COUNT(*) n FROM facility_allocations WHERE institution_id=? AND academic_year_id=? AND kind=?",
      [actor.institutionId, year, k],
    ))!.n,
    page,
  };
}
export async function createFacility(
  actor: Actor,
  kind: string,
  input: unknown,
) {
  permit(actor, "facilities.manage");
  if (!(kind in schemas))
    throw new ApiError(404, "NOT_FOUND", "Facility not found.");
  const d = schemas[kind as keyof typeof schemas].parse(input) as Row;
  const references: Record<string, string> = {
    vehicle_id: "transport_vehicles",
    route_id: "transport_routes",
    block_id: "hostel_blocks",
    component_id: "fee_components",
    boarding_component_id: "fee_components",
    mess_component_id: "fee_components",
  };
  for (const [key, table] of Object.entries(references))
    if (d[key]) await own(actor, table, d[key]);
  const key = uuid(),
    table = tables[kind as keyof typeof tables];
  await batch([
    insert(table, {
      id: key,
      institution_id: actor.institutionId,
      ...d,
      ...stamps(actor.userId),
    }),
    audit(actor, "Created facility", table, key, null, d),
  ]);
  return { id: key };
}
export async function allocateFacility(actor: Actor, input: unknown) {
  permit(actor, "facilities.manage");
  permit(actor, "fees.invoice");
  const d = z
    .object({
      kind: z.enum(["Transport", "Hostel"]),
      studentId: id,
      yearId: id,
      stopId: id.optional(),
      roomId: id.optional(),
      bedNumber: z.number().int().min(1).max(100).optional(),
      startDate: dateField,
      endDate: dateField,
    })
    .parse(input);
  const student = await own(actor, "students", d.studentId),
    y = await own(actor, "academic_years", d.yearId);
  if (student.status !== "Active" || ["Closed", "Archived"].includes(y.status))
    throw new ApiError(
      409,
      "YEAR_CLOSED",
      "Select an active student and an open academic year.",
    );
  if (
    d.startDate < y.start_date ||
    d.endDate > y.end_date ||
    d.endDate < d.startDate
  )
    throw new ApiError(
      422,
      "FACILITY_DATES",
      "Select dates within the academic year, starting today or earlier.",
    );
  if (
    !(await one(
      "SELECT id FROM enrollments WHERE institution_id=? AND student_id=? AND academic_year_id=?",
      [actor.institutionId, d.studentId, d.yearId],
    ))
  )
    throw new ApiError(
      422,
      "ENROLLMENT_REQUIRED",
      "Enroll the student in this academic year first.",
    );
  let charges: FacilityCharge[];
  if (d.kind === "Transport") {
    const stop = await own(actor, "transport_stops", d.stopId || "");
    charges = [
      {
        componentId: stop.component_id,
        name: `Transport · ${stop.name}`,
        amountPaise: stop.monthly_paise,
      },
    ];
  } else {
    const room = await own(actor, "hostel_rooms", d.roomId || "");
    if (!d.bedNumber || d.bedNumber > room.capacity)
      throw new ApiError(422, "BED_REQUIRED", "Select an existing bed number.");
    charges = [
      {
        componentId: room.boarding_component_id,
        name: `Boarding · ${room.name}`,
        amountPaise: room.boarding_paise,
      },
      {
        componentId: room.mess_component_id,
        name: `Mess · ${room.name}`,
        amountPaise: room.mess_paise,
      },
    ].filter((c) => c.amountPaise > 0);
  }
  const allocation = {
    id: uuid(),
    institution_id: actor.institutionId,
    kind: d.kind,
    student_id: d.studentId,
    academic_year_id: d.yearId,
    stop_id: d.kind === "Transport" ? d.stopId : null,
    room_id: d.kind === "Hostel" ? d.roomId : null,
    bed_number: d.kind === "Hostel" ? d.bedNumber : null,
    start_date: d.startDate,
    end_date: d.endDate,
    next_bill_date: d.startDate,
    charges: JSON.stringify(charges),
    status: "Active",
    ...stamps(actor.userId),
  };
  const billing =
    d.startDate <= today() ? await facilityInvoice(actor, allocation) : null;
  await batch([
    insert("facility_allocations", allocation),
    ...(billing?.statements || []),
    audit(
      actor,
      "Allocated facility and generated monthly invoice",
      "facility_allocations",
      allocation.id,
      null,
      { ...d, invoiceId: billing?.invoiceId || null },
    ),
  ]);
  return { id: allocation.id, invoiceId: billing?.invoiceId || null };
}
async function facilityInvoice(actor: Actor, a: Row) {
  const e = await one(
    "SELECT e.*,s.class_id FROM enrollments e JOIN sections s ON s.id=e.section_id AND s.institution_id=e.institution_id WHERE e.institution_id=? AND e.student_id=? AND e.academic_year_id=?",
    [actor.institutionId, a.student_id, a.academic_year_id],
  );
  if (!e)
    throw new ApiError(
      409,
      "ENROLLMENT_REQUIRED",
      "The student is no longer enrolled in the billing year.",
    );
  const charges = JSON.parse(a.charges) as FacilityCharge[],
    gross = safeMoney(charges.reduce((sum, c) => sum + c.amountPaise, 0));
  const structureId = uuid(),
    assignmentId = uuid(),
    invoiceId = uuid(),
    base = { institution_id: actor.institutionId, ...stamps(actor.userId) },
    year = a.academic_year_id,
    period = a.next_bill_date.slice(0, 7),
    title = `${a.kind} · ${period}`,
    date = today();
  const statements = [
    insert("fee_structures", {
      id: structureId,
      ...base,
      academic_year_id: year,
      class_id: e.class_id,
      section_id: e.section_id,
      name: title,
      frequency: "Monthly",
      schedule: JSON.stringify([a.next_bill_date]),
      status: "Archived",
    }),
    ...charges.map((c) =>
      insert("fee_structure_items", {
        id: uuid(),
        institution_id: actor.institutionId,
        structure_id: structureId,
        component_id: c.componentId,
        amount_paise: c.amountPaise,
      }),
    ),
    insert("student_fee_assignments", {
      id: assignmentId,
      ...base,
      student_id: a.student_id,
      academic_year_id: year,
      structure_id: structureId,
      reason: `Facility allocation ${a.id}`,
    }),
    insert("invoices", {
      id: invoiceId,
      ...base,
      student_id: a.student_id,
      academic_year_id: year,
      assignment_id: assignmentId,
      gross_paise: gross,
      net_paise: gross,
      issued_date: date,
      due_date: a.next_bill_date,
    }),
    ...charges.map((c) =>
      insert("invoice_items", {
        id: uuid(),
        institution_id: actor.institutionId,
        invoice_id: invoiceId,
        component_id: c.componentId,
        name: c.name,
        amount_paise: c.amountPaise,
      }),
    ),
    insert("installments", {
      id: uuid(),
      ...base,
      invoice_id: invoiceId,
      student_id: a.student_id,
      academic_year_id: year,
      title,
      amount_paise: gross,
      due_date: a.next_bill_date,
      sort_order: 0,
    }),
    insert("ledger_entries", {
      id: uuid(),
      ...base,
      student_id: a.student_id,
      academic_year_id: year,
      invoice_id: invoiceId,
      kind: "Fee",
      description: title,
      debit_paise: gross,
      credit_paise: 0,
      entry_date: date,
    }),
    insert("facility_billings", {
      id: uuid(),
      ...base,
      allocation_id: a.id,
      period,
      invoice_id: invoiceId,
    }),
    stmt(
      "UPDATE facility_allocations SET next_bill_date=?,updated_at=?,updated_by=? WHERE institution_id=? AND id=? AND next_bill_date=?",
      [
        nextMonth(a.next_bill_date),
        now(),
        actor.userId,
        actor.institutionId,
        a.id,
        a.next_bill_date,
      ],
    ),
  ];
  return { statements, invoiceId };
}
export async function billFacilities(actor: Actor) {
  permit(actor, "admin");
  permit(actor, "fees.invoice");
  const rows = await all(
    "SELECT a.* FROM facility_allocations a JOIN academic_years y ON y.id=a.academic_year_id AND y.institution_id=a.institution_id JOIN students s ON s.id=a.student_id AND s.institution_id=a.institution_id WHERE a.institution_id=? AND a.status='Active' AND a.next_bill_date<=? AND a.next_bill_date<=a.end_date AND y.status IN ('Draft','Active') AND s.status='Active' ORDER BY a.next_bill_date,a.id LIMIT 20",
    [actor.institutionId, today()],
  );
  let generated = 0;
  for (const a of rows) {
    const b = await facilityInvoice(actor, a);
    try {
      await batch([
        ...b.statements,
        audit(
          actor,
          "Generated recurring facility invoice",
          "invoices",
          b.invoiceId,
          null,
          { allocationId: a.id, period: a.next_bill_date.slice(0, 7) },
        ),
      ]);
      generated++;
    } catch (error) {
      // A competing transaction may have advanced the cursor before our billing
      // guard runs. Accept only a persisted charge for this exact monthly key.
      const already = await one(
        "SELECT invoice_id FROM facility_billings WHERE institution_id=? AND allocation_id=? AND period=?",
        [actor.institutionId, a.id, a.next_bill_date.slice(0, 7)],
      );
      if (!already) throw error;
    }
  }
  const more = await one(
    "SELECT a.id FROM facility_allocations a JOIN academic_years y ON y.id=a.academic_year_id AND y.institution_id=a.institution_id JOIN students s ON s.id=a.student_id AND s.institution_id=a.institution_id WHERE a.institution_id=? AND a.status='Active' AND a.next_bill_date<=? AND a.next_bill_date<=a.end_date AND y.status IN ('Draft','Active') AND s.status='Active' LIMIT 1",
    [actor.institutionId, today()],
  );
  return { generated, hasMore: !!more };
}
export async function endAllocation(actor: Actor, id: string) {
  permit(actor, "facilities.manage");
  const a = await own(actor, "facility_allocations", id);
  if (a.status === "Ended") return { ended: true };
  await batch([
    stmt(
      "UPDATE facility_allocations SET status='Ended',updated_at=?,updated_by=? WHERE institution_id=? AND id=?",
      [now(), actor.userId, actor.institutionId, id],
    ),
    audit(
      actor,
      "Ended facility allocation",
      "facility_allocations",
      id,
      { status: a.status },
      { status: "Ended" },
    ),
  ]);
  return { ended: true };
}

export async function roomBeds(
  actor: Actor,
  roomId: string,
  from: string,
  to: string,
) {
  permit(actor, "facilities.view");
  const room = await own(actor, "hostel_rooms", roomId);
  dateField.parse(from);
  dateField.parse(to);
  if (to < from)
    throw new ApiError(422, "DATE_RANGE", "Select valid allocation dates.");
  const occupied = await all<{ bed_number: number }>(
    "SELECT bed_number FROM facility_allocations WHERE institution_id=? AND room_id=? AND status='Active' AND start_date<=? AND end_date>=? LIMIT 100",
    [actor.institutionId, roomId, to, from],
  );
  return {
    room: room.name,
    capacity: room.capacity,
    beds: Array.from({ length: room.capacity }, (_, i) => ({
      number: i + 1,
      occupied: occupied.some((b) => b.bed_number === i + 1),
    })),
  };
}
